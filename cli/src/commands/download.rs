use crate::emit::emit_json;
use crate::youtube::{
    build_quality_options, extract_visitor_data, fetch_visionos_player, http_get_text,
    parse_clen_from_url, pick_best_audio, WATCH_UA, VISIONOS_UA,
};
use serde_json::json;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(unix)]
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const RANGE_CHUNK_SIZE: u64 = 4 * 1024 * 1024; // 4 MiB chunks for parallel range download
const WORKER_COUNT: usize = 4;

fn probe_remote_size(url: &str) -> Option<u64> {
    if let Some(clen) = parse_clen_from_url(url) {
        return Some(clen);
    }
    let out = Command::new("curl")
        .args([
            "-sS",
            "-L",
            "-I",
            "--max-time",
            "15",
            "-A",
            VISIONOS_UA,
            "-r",
            "0-0",
            url,
        ])
        .output()
        .ok()?;
    let headers = String::from_utf8_lossy(&out.stdout);
    for line in headers.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("content-range:") {
            if let Some(slash) = line.rfind('/') {
                if let Ok(total) = line[slash + 1..].trim().parse::<u64>() {
                    if total > 0 {
                        return Some(total);
                    }
                }
            }
        }
    }
    None
}

#[cfg(unix)]
fn download_stream_parallel(
    url: &str,
    dest: &Path,
    total_size: u64,
    global_downloaded: &Arc<AtomicU64>,
    failed: &Arc<AtomicBool>,
) -> Result<(), String> {
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dest)
        .map_err(|e| format!("failed to open {}: {e}", dest.display()))?;
    file.set_len(total_size)
        .map_err(|e| format!("failed to allocate {}: {e}", dest.display()))?;
    let file = Arc::new(file);

    let mut chunks: Vec<(u64, u64)> = Vec::new();
    let mut offset = 0u64;
    while offset < total_size {
        let end = (offset + RANGE_CHUNK_SIZE - 1).min(total_size - 1);
        chunks.push((offset, end));
        offset = end + 1;
    }

    let next_chunk = Arc::new(AtomicU64::new(0));
    let chunks = Arc::new(chunks);

    thread::scope(|s| {
        let mut handles = Vec::new();
        for _ in 0..WORKER_COUNT.min(chunks.len().max(1)) {
            let file = Arc::clone(&file);
            let chunks = Arc::clone(&chunks);
            let next_chunk = Arc::clone(&next_chunk);
            let global_downloaded = Arc::clone(global_downloaded);
            let failed = Arc::clone(failed);
            let url_owned = url.to_string();

            handles.push(s.spawn(move || -> Result<(), String> {
                loop {
                    if failed.load(Ordering::Relaxed) {
                        return Err("aborted".to_string());
                    }
                    let idx = next_chunk.fetch_add(1, Ordering::SeqCst) as usize;
                    if idx >= chunks.len() {
                        break;
                    }
                    let (start, end) = chunks[idx];
                    let range_arg = format!("{start}-{end}");

                    let mut child = Command::new("curl")
                        .args([
                            "-sS",
                            "-L",
                            "--fail",
                            "--retry",
                            "3",
                            "--retry-delay",
                            "1",
                            "-A",
                            VISIONOS_UA,
                            "-r",
                            &range_arg,
                            &url_owned,
                        ])
                        .stdout(Stdio::piped())
                        .stderr(Stdio::null())
                        .spawn()
                        .map_err(|e| {
                            failed.store(true, Ordering::Relaxed);
                            format!("curl spawn error: {e}")
                        })?;

                    let mut stdout = child.stdout.take().ok_or_else(|| {
                        failed.store(true, Ordering::Relaxed);
                        "missing curl stdout".to_string()
                    })?;

                    let mut buf = [0u8; 64 * 1024];
                    let mut pos = start;
                    loop {
                        let n = stdout.read(&mut buf).map_err(|e| {
                            failed.store(true, Ordering::Relaxed);
                            format!("read error: {e}")
                        })?;
                        if n == 0 {
                            break;
                        }
                        file.write_all_at(&buf[..n], pos).map_err(|e| {
                            failed.store(true, Ordering::Relaxed);
                            format!("write error: {e}")
                        })?;
                        pos += n as u64;
                        global_downloaded.fetch_add(n as u64, Ordering::Relaxed);
                    }

                    let status = child.wait().map_err(|e| {
                        failed.store(true, Ordering::Relaxed);
                        format!("curl wait error: {e}")
                    })?;
                    let expected_len = end - start + 1;
                    if !status.success() || (pos - start) != expected_len {
                        failed.store(true, Ordering::Relaxed);
                        return Err(format!(
                            "range {start}-{end} incomplete (got {}, expected {expected_len})",
                            pos - start
                        ));
                    }
                }
                Ok(())
            }));
        }

        for h in handles {
            h.join().map_err(|_| "worker thread panicked".to_string())??;
        }
        Ok(())
    })
}

#[cfg(not(unix))]
fn download_stream_parallel(
    url: &str,
    dest: &Path,
    _total_size: u64,
    global_downloaded: &Arc<AtomicU64>,
    failed: &Arc<AtomicBool>,
) -> Result<(), String> {
    download_stream_sequential(url, dest, global_downloaded, failed)
}

fn download_stream_sequential(
    url: &str,
    dest: &Path,
    global_downloaded: &Arc<AtomicU64>,
    failed: &Arc<AtomicBool>,
) -> Result<(), String> {
    let mut file = File::create(dest).map_err(|e| format!("create {}: {e}", dest.display()))?;
    let mut child = Command::new("curl")
        .args(["-sS", "-L", "--fail", "-A", VISIONOS_UA, url])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("curl spawn: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = stdout.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        global_downloaded.fetch_add(n as u64, Ordering::Relaxed);
    }
    let st = child.wait().map_err(|e| e.to_string())?;
    if !st.success() {
        failed.store(true, Ordering::Relaxed);
        return Err("curl download failed".to_string());
    }
    Ok(())
}

fn fallback_yt_dlp(video_id: &str, quality: &str, output_path: &Path) -> Result<u64, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let format_selector = match quality {
        "audio" => "bestaudio[ext=m4a]/bestaudio".to_string(),
        q if q.ends_with('p') => {
            let height = q.trim_end_matches('p');
            format!(
                "bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best"
            )
        }
        _ => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"
            .to_string(),
    };

    let mut child = Command::new("yt-dlp")
        .args([
            "--newline",
            "--progress",
            "--no-playlist",
            "--no-warnings",
            "-f",
            &format_selector,
            "--merge-output-format",
            if quality == "audio" { "m4a" } else { "mp4" },
            "-o",
            &output_path.to_string_lossy(),
            &url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("yt-dlp fallback failed to start: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if line.contains("[download]") && line.contains('%') {
                // Parse percentage if present
                if let Some(pct_idx) = line.find('%') {
                    let prefix = &line[..pct_idx];
                    if let Some(num_str) = prefix.split_whitespace().last() {
                        if let Ok(pct) = num_str.parse::<f64>() {
                            emit_json(json!({
                                "v": 1,
                                "type": "progress",
                                "stage": "downloading",
                                "percent": pct.clamp(0.0, 99.0),
                                "downloadedBytes": 0,
                                "totalBytes": 0,
                                "speedBps": 0,
                                "etaSeconds": null
                            }));
                        }
                    }
                }
            }
        }
    }

    let st = child.wait().map_err(|e| e.to_string())?;
    if !st.success() || !output_path.exists() {
        return Err("yt-dlp failed to download media".to_string());
    }
    let meta = fs::metadata(output_path).map_err(|e| e.to_string())?;
    Ok(meta.len())
}

pub fn run(args: &[String]) -> Result<(), String> {
    let mut video_id = String::new();
    let mut output_str = String::new();
    let mut video_url: Option<String> = None;
    let mut audio_url: Option<String> = None;
    let mut quality = "720p".to_string();

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--video-id" => {
                i += 1;
                video_id = args.get(i).cloned().unwrap_or_default();
            }
            "--output" | "-o" => {
                i += 1;
                output_str = args.get(i).cloned().unwrap_or_default();
            }
            "--video-url" => {
                i += 1;
                let v = args.get(i).cloned().unwrap_or_default();
                if !v.is_empty() {
                    video_url = Some(v);
                }
            }
            "--audio-url" => {
                i += 1;
                let a = args.get(i).cloned().unwrap_or_default();
                if !a.is_empty() {
                    audio_url = Some(a);
                }
            }
            "--quality" | "-q" => {
                i += 1;
                quality = args.get(i).cloned().unwrap_or_else(|| "720p".to_string());
            }
            arg if !arg.starts_with('-') && video_id.is_empty() => {
                if let Some(id) = crate::youtube::extract_video_id(arg) {
                    video_id = id;
                } else {
                    video_id = arg.to_string();
                }
            }
            _ => {}
        }
        i += 1;
    }

    if video_id.is_empty() && video_url.is_none() && audio_url.is_none() {
        return Err("Missing video ID or URL. Usage: ear download <URL|ID> [--output <path>] [--quality <q>]".to_string());
    }

    if output_str.is_empty() {
        let ext = if quality == "audio" { "m4a" } else { "mp4" };
        let base = if !video_id.is_empty() {
            &video_id
        } else {
            "media"
        };
        output_str = format!("./{base}.{ext}");
    }

    let output_path = PathBuf::from(&output_str);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }

    // If neither video_url nor audio_url was provided, resolve them first
    if video_url.is_none() && audio_url.is_none() && !video_id.is_empty() {
        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
        let visitor = http_get_text(&watch_url, WATCH_UA)
            .ok()
            .and_then(|h| extract_visitor_data(&h));
        if let Some(player) = fetch_visionos_player(&video_id, visitor.as_deref()) {
            let streaming = player.get("streamingData");
            let formats = streaming
                .and_then(|s| s.get("formats"))
                .and_then(|f| f.as_array())
                .cloned()
                .unwrap_or_default();
            let adaptive = streaming
                .and_then(|s| s.get("adaptiveFormats"))
                .and_then(|f| f.as_array())
                .cloned()
                .unwrap_or_default();
            let best_audio = pick_best_audio(&adaptive);
            let qualities = build_quality_options(&formats, &adaptive, best_audio.as_ref());
            if let Some(q) = qualities
                .iter()
                .find(|q| q.id == quality)
                .or_else(|| qualities.first())
            {
                video_url = q.video_url.clone();
                audio_url = q.audio_url.clone();
            }
        }
    }

    emit_json(json!({
        "v": 1,
        "type": "progress",
        "stage": "starting",
        "percent": 2.0,
        "downloadedBytes": 0,
        "totalBytes": 0,
        "speedBps": 0,
        "etaSeconds": null
    }));

    let v_size = video_url.as_deref().and_then(probe_remote_size);
    let a_size = audio_url.as_deref().and_then(probe_remote_size);
    let total_bytes = v_size.unwrap_or(0) + a_size.unwrap_or(0);

    let video_part = output_path.with_extension("video.part");
    let audio_part = output_path.with_extension("audio.part");
    let mux_part = output_path.with_extension("mux.mp4");

    let global_downloaded = Arc::new(AtomicU64::new(0));
    let failed = Arc::new(AtomicBool::new(false));
    let finished_transfer = Arc::new(AtomicBool::new(false));

    // Start background reporter thread for real-time speed, efficiency & progress
    let rep_downloaded = Arc::clone(&global_downloaded);
    let rep_done = Arc::clone(&finished_transfer);
    let reporter = thread::spawn(move || {
        let start_inst = Instant::now();
        let mut last_inst = start_inst;
        let mut last_bytes = 0u64;
        let mut smoothed_speed = 0.0f64;

        while !rep_done.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(120));
            if rep_done.load(Ordering::Relaxed) {
                break;
            }
            let now = Instant::now();
            let dt = now.duration_since(last_inst).as_secs_f64();
            let cur_bytes = rep_downloaded.load(Ordering::Relaxed);
            if dt >= 0.08 {
                let delta = cur_bytes.saturating_sub(last_bytes);
                let inst_speed = (delta as f64) / dt;
                if smoothed_speed <= 1.0 {
                    smoothed_speed = inst_speed;
                } else {
                    smoothed_speed = smoothed_speed * 0.65 + inst_speed * 0.35;
                }
                last_bytes = cur_bytes;
                last_inst = now;
            }

            let pct = if total_bytes > 0 {
                ((cur_bytes as f64 / total_bytes as f64) * 94.0).clamp(2.0, 94.0)
            } else {
                50.0
            };
            let eta_seconds = if total_bytes > cur_bytes && smoothed_speed > 1024.0 {
                Some(((total_bytes - cur_bytes) as f64 / smoothed_speed).ceil() as u64)
            } else {
                None
            };

            emit_json(json!({
                "v": 1,
                "type": "progress",
                "stage": "downloading",
                "percent": (pct * 10.0).round() / 10.0,
                "downloadedBytes": cur_bytes,
                "totalBytes": total_bytes,
                "speedBps": smoothed_speed.round() as u64,
                "etaSeconds": eta_seconds
            }));
        }
    });

    let mut transfer_res: Result<(), String> = Ok(());

    if let Some(ref vurl) = video_url {
        transfer_res = if let Some(vs) = v_size {
            download_stream_parallel(vurl, &video_part, vs, &global_downloaded, &failed)
        } else {
            download_stream_sequential(vurl, &video_part, &global_downloaded, &failed)
        };
    }

    if transfer_res.is_ok() {
        if let Some(ref aurl) = audio_url {
            transfer_res = if let Some(asize) = a_size {
                download_stream_parallel(aurl, &audio_part, asize, &global_downloaded, &failed)
            } else {
                download_stream_sequential(aurl, &audio_part, &global_downloaded, &failed)
            };
        }
    }

    finished_transfer.store(true, Ordering::Relaxed);
    let _ = reporter.join();

    if transfer_res.is_ok() && (video_url.is_some() || audio_url.is_some()) {
        match (video_url.is_some(), audio_url.is_some()) {
            (true, true) => {
                emit_json(json!({
                    "v": 1,
                    "type": "progress",
                    "stage": "merging",
                    "percent": 96.0,
                    "downloadedBytes": total_bytes,
                    "totalBytes": total_bytes,
                    "speedBps": 0,
                    "etaSeconds": 1
                }));
                let st = Command::new("ffmpeg")
                    .args([
                        "-y",
                        "-loglevel",
                        "error",
                        "-i",
                        &video_part.to_string_lossy(),
                        "-i",
                        &audio_part.to_string_lossy(),
                        "-c",
                        "copy",
                        "-movflags",
                        "+faststart",
                        &mux_part.to_string_lossy(),
                    ])
                    .status()
                    .map_err(|e| format!("ffmpeg execution failed: {e}"))?;
                let _ = fs::remove_file(&video_part);
                let _ = fs::remove_file(&audio_part);
                if !st.success() {
                    let _ = fs::remove_file(&mux_part);
                    return Err("ffmpeg failed to mux video and audio".to_string());
                }
                fs::rename(&mux_part, &output_path)
                    .map_err(|e| format!("rename mux output failed: {e}"))?;
            }
            (true, false) => {
                fs::rename(&video_part, &output_path)
                    .map_err(|e| format!("rename video failed: {e}"))?;
            }
            (false, true) => {
                fs::rename(&audio_part, &output_path)
                    .map_err(|e| format!("rename audio failed: {e}"))?;
            }
            (false, false) => unreachable!(),
        }

        let final_size = fs::metadata(&output_path)
            .map(|m| m.len())
            .unwrap_or(total_bytes);
        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": final_size
        }));
        return Ok(());
    }

    // Cleanup partial files and try yt-dlp fallback
    let _ = fs::remove_file(&video_part);
    let _ = fs::remove_file(&audio_part);
    let _ = fs::remove_file(&mux_part);

    if !video_id.is_empty() {
        let size = fallback_yt_dlp(&video_id, &quality, &output_path)?;
        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": size
        }));
        return Ok(());
    }

    Err(transfer_res.err().unwrap_or_else(|| "Download failed".to_string()))
}

