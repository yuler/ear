pub mod checkpoint;
pub mod library_sync;
pub mod transfer;

use crate::commands::download::checkpoint::PartCheckpoint;
use crate::commands::download::library_sync::{
    fetch_and_save_captions, get_default_downloads_dir, get_library_dir,
    sync_entry_paused, sync_entry_progress, sync_entry_ready, LibraryEntrySync,
};
use crate::commands::download::transfer::{
    download_stream_parallel, download_stream_sequential, probe_remote_size, StreamDownloadParams,
};
use crate::emit::emit_json;
use crate::youtube::{
    build_quality_options, extract_video_id, extract_visitor_data, fetch_visionos_player,
    http_get_text, pick_best_audio, WATCH_UA,
};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

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
    let mut concurrency: usize = 4;
    let mut no_captions = false;
    let mut library_dir_override: Option<PathBuf> = None;

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
            "--library-dir" => {
                i += 1;
                let dir = args.get(i).cloned().unwrap_or_default();
                if !dir.is_empty() {
                    library_dir_override = Some(PathBuf::from(dir));
                }
            }
            "--quality" | "-q" => {
                i += 1;
                quality = args.get(i).cloned().unwrap_or_else(|| "720p".to_string());
            }
            "--concurrency" | "-c" => {
                i += 1;
                if let Some(c) = args.get(i).and_then(|s| s.parse::<usize>().ok()) {
                    concurrency = c.clamp(1, 16);
                }
            }
            "--no-captions" => {
                no_captions = true;
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
            arg if !arg.starts_with('-') && video_id.is_empty() => {
                if let Some(id) = extract_video_id(arg) {
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
        return Err("Missing video ID or URL. Usage: ear download <URL|ID> [-o <path>] [-q <q>] [-c <concurrency>]".to_string());
    }

    let is_audio_only = quality == "audio";
    let ext = if is_audio_only { "m4a" } else { "mp4" };

    if output_str.is_empty() {
        let base = if !video_id.is_empty() {
            &video_id
        } else {
            "media"
        };
        let dl_dir = get_default_downloads_dir();
        output_str = dl_dir.join(format!("{base}.{ext}")).to_string_lossy().to_string();
    }

    let output_path = PathBuf::from(&output_str);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }

    let library_dir = library_dir_override.or_else(get_library_dir);
    let mut player_json: Option<serde_json::Value> = None;
    let mut video_title = video_id.clone();
    let mut thumbnail_url: Option<String> = None;

    // Resolve stream URLs via YouTube VisionOS player API
    if !video_id.is_empty() {
        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
        let visitor = http_get_text(&watch_url, WATCH_UA)
            .ok()
            .and_then(|h| extract_visitor_data(&h));
        if let Some(player) = fetch_visionos_player(&video_id, visitor.as_deref()) {
            if let Some(details) = player.get("videoDetails") {
                if let Some(t) = details.get("title").and_then(|t| t.as_str()) {
                    video_title = t.to_string();
                }
            }
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
                if video_url.is_none() {
                    video_url = q.video_url.clone();
                }
                if audio_url.is_none() {
                    audio_url = q.audio_url.clone();
                }
            }
            thumbnail_url = Some(format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"));
            player_json = Some(player);
        }
    }

    // Initialize or update library entry with state: downloading
    if let Some(ref lib_dir) = library_dir {
        if !video_id.is_empty() {
            let mut entry = LibraryEntrySync::load_or_new(
                lib_dir,
                &video_id,
                &video_title,
                &quality,
                thumbnail_url.clone(),
            );
            entry.video_path = if is_audio_only { None } else { Some(output_path.to_string_lossy().to_string()) };
            entry.audio_path = if is_audio_only { Some(output_path.to_string_lossy().to_string()) } else { None };
            entry.state = "downloading".to_string();
            let _ = entry.save(lib_dir);
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

    // Live telemetry reporter thread
    let rep_downloaded = Arc::clone(&global_downloaded);
    let rep_done = Arc::clone(&finished_transfer);
    let rep_lib_dir = library_dir.clone();
    let rep_vid = video_id.clone();

    let reporter = thread::spawn(move || {
        let start_inst = Instant::now();
        let mut last_inst = start_inst;
        let mut last_bytes = 0u64;
        let mut smoothed_speed = 0.0f64;

        while !rep_done.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(150));
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

            let rounded_pct = (pct * 10.0).round() / 10.0;
            let speed_bps = smoothed_speed.round() as u64;

            emit_json(json!({
                "v": 1,
                "type": "progress",
                "stage": "downloading",
                "percent": rounded_pct,
                "downloadedBytes": cur_bytes,
                "totalBytes": total_bytes,
                "speedBps": speed_bps,
                "etaSeconds": eta_seconds
            }));

            if let Some(ref lib) = rep_lib_dir {
                if !rep_vid.is_empty() {
                    sync_entry_progress(lib, &rep_vid, cur_bytes, total_bytes, rounded_pct, speed_bps, eta_seconds);
                }
            }
        }
    });

    let mut transfer_res: Result<(), String> = Ok(());

    // Helper for URL refresh
    let vid_for_refresh = video_id.clone();
    let quality_for_refresh = quality.clone();
    let make_url_refresher = move |is_video: bool| -> Arc<dyn Fn() -> Option<String> + Send + Sync> {
        let vid = vid_for_refresh.clone();
        let qid = quality_for_refresh.clone();
        Arc::new(move || {
            let watch_url = format!("https://www.youtube.com/watch?v={vid}");
            let visitor = http_get_text(&watch_url, WATCH_UA)
                .ok()
                .and_then(|h| extract_visitor_data(&h));
            let player = fetch_visionos_player(&vid, visitor.as_deref())?;
            let streaming = player.get("streamingData")?;
            let formats = streaming.get("formats").and_then(|f| f.as_array()).cloned().unwrap_or_default();
            let adaptive = streaming.get("adaptiveFormats").and_then(|f| f.as_array()).cloned().unwrap_or_default();
            let best_audio = pick_best_audio(&adaptive);
            let qualities = build_quality_options(&formats, &adaptive, best_audio.as_ref());
            let target_q = qualities.iter().find(|q| q.id == qid).or_else(|| qualities.first())?;
            if is_video {
                target_q.video_url.clone()
            } else {
                target_q.audio_url.clone()
            }
        })
    };

    if let Some(ref vurl) = video_url {
        let url_state = Arc::new(RwLock::new(vurl.clone()));
        let refresher = if !video_id.is_empty() {
            Some(make_url_refresher(true))
        } else {
            None
        };

        transfer_res = if let Some(vs) = v_size {
            download_stream_parallel(StreamDownloadParams {
                video_id: &video_id,
                stream_type: "video",
                dest: &video_part,
                total_size: vs,
                concurrency,
                global_downloaded: &global_downloaded,
                failed: &failed,
                url_state,
                url_refresher: refresher,
                on_progress: None,
            })
        } else {
            download_stream_sequential(StreamDownloadParams {
                video_id: &video_id,
                stream_type: "video",
                dest: &video_part,
                total_size: 0,
                concurrency: 1,
                global_downloaded: &global_downloaded,
                failed: &failed,
                url_state,
                url_refresher: refresher,
                on_progress: None,
            })
        };
    }

    if transfer_res.is_ok() {
        if let Some(ref aurl) = audio_url {
            let url_state = Arc::new(RwLock::new(aurl.clone()));
            let refresher = if !video_id.is_empty() {
                Some(make_url_refresher(false))
            } else {
                None
            };

            transfer_res = if let Some(asize) = a_size {
                download_stream_parallel(StreamDownloadParams {
                    video_id: &video_id,
                    stream_type: "audio",
                    dest: &audio_part,
                    total_size: asize,
                    concurrency,
                    global_downloaded: &global_downloaded,
                    failed: &failed,
                    url_state,
                    url_refresher: refresher,
                    on_progress: None,
                })
            } else {
                download_stream_sequential(StreamDownloadParams {
                    video_id: &video_id,
                    stream_type: "audio",
                    dest: &audio_part,
                    total_size: 0,
                    concurrency: 1,
                    global_downloaded: &global_downloaded,
                    failed: &failed,
                    url_state,
                    url_refresher: refresher,
                    on_progress: None,
                })
            };
        }
    }

    finished_transfer.store(true, Ordering::Relaxed);
    let _ = reporter.join();

    if let Err(ref e) = transfer_res {
        // Record paused or error state into library entry
        if let Some(ref lib) = library_dir {
            if !video_id.is_empty() {
                sync_entry_paused(lib, &video_id, e);
            }
        }
        return Err(format!("Download failed or paused: {e}"));
    }

    if video_url.is_some() || audio_url.is_some() {
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
                PartCheckpoint::cleanup(&video_part);
                PartCheckpoint::cleanup(&audio_part);

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
                PartCheckpoint::cleanup(&video_part);
            }
            (false, true) => {
                fs::rename(&audio_part, &output_path)
                    .map_err(|e| format!("rename audio failed: {e}"))?;
                PartCheckpoint::cleanup(&audio_part);
            }
            (false, false) => unreachable!(),
        }

        let final_size = fs::metadata(&output_path)
            .map(|m| m.len())
            .unwrap_or(total_bytes);

        // Fetch and save captions if not disabled
        let mut saved_captions_path: Option<String> = None;
        if !no_captions && !video_id.is_empty() {
            if let Some(ref lib) = library_dir {
                if let Some(ref p) = player_json {
                    if let Some(cpath) = fetch_and_save_captions(&video_id, &video_title, lib, p) {
                        saved_captions_path = Some(cpath.to_string_lossy().to_string());
                    }
                }
            }
        }

        // Mark library entry as ready
        if let Some(ref lib) = library_dir {
            if !video_id.is_empty() {
                sync_entry_ready(
                    lib,
                    &video_id,
                    &output_path,
                    saved_captions_path.as_deref(),
                    final_size,
                    is_audio_only,
                );
            }
        }

        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": final_size
        }));
        return Ok(());
    }

    // Fallback to yt-dlp if needed
    if !video_id.is_empty() {
        let size = fallback_yt_dlp(&video_id, &quality, &output_path)?;
        if let Some(ref lib) = library_dir {
            sync_entry_ready(
                lib,
                &video_id,
                &output_path,
                None,
                size,
                is_audio_only,
            );
        }
        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": size
        }));
        return Ok(());
    }

    Err("Download failed".to_string())
}
