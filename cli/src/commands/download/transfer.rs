use crate::commands::download::checkpoint::{PartCheckpoint, DEFAULT_CHUNK_SIZE};
use crate::youtube::{parse_clen_from_url, VISIONOS_UA};
use std::fs::OpenOptions;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::FileExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;

pub fn probe_remote_size(url: &str) -> Option<u64> {
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

pub struct StreamDownloadParams<'a> {
    pub video_id: &'a str,
    pub stream_type: &'a str, // "video" | "audio"
    pub dest: &'a Path,
    pub total_size: u64,
    pub concurrency: usize,
    pub global_downloaded: &'a Arc<AtomicU64>,
    pub failed: &'a Arc<AtomicBool>,
    pub url_state: Arc<RwLock<String>>,
    pub url_refresher: Option<Arc<dyn Fn() -> Option<String> + Send + Sync>>,
    pub on_progress: Option<Arc<dyn Fn(u64, u64, f64, u64, Option<u64>) + Send + Sync>>,
}

#[cfg(unix)]
pub fn download_stream_parallel(params: StreamDownloadParams) -> Result<(), String> {
    let part_path = params.dest;
    let (mut checkpoint, resumed) = PartCheckpoint::load_or_init(
        part_path,
        params.video_id,
        params.stream_type,
        params.total_size,
        DEFAULT_CHUNK_SIZE,
    );

    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(part_path)
        .map_err(|e| format!("failed to open {}: {e}", part_path.display()))?;

    if !resumed || file.metadata().map(|m| m.len()).unwrap_or(0) != params.total_size {
        file.set_len(params.total_size)
            .map_err(|e| format!("failed to allocate {}: {e}", part_path.display()))?;
        checkpoint = PartCheckpoint::new(
            params.video_id,
            params.stream_type,
            params.total_size,
            DEFAULT_CHUNK_SIZE,
        );
        let _ = checkpoint.save(part_path);
    }

    let already_downloaded = checkpoint.downloaded_bytes();
    params.global_downloaded.fetch_add(already_downloaded, Ordering::Relaxed);

    if checkpoint.is_complete() {
        return Ok(());
    }

    let missing = checkpoint.missing_chunks();
    if missing.is_empty() {
        return Ok(());
    }

    let shared_file = Arc::new(file);
    let shared_checkpoint = Arc::new(Mutex::new(checkpoint));
    let next_chunk_idx = Arc::new(AtomicU64::new(0));
    let missing_chunks = Arc::new(missing);
    let worker_count = params.concurrency.clamp(1, 16).min(missing_chunks.len());
    let refresh_lock = Arc::new(Mutex::new(()));

    thread::scope(|s| {
        let mut handles = Vec::new();
        for _ in 0..worker_count {
            let file = Arc::clone(&shared_file);
            let ckpt_mutex = Arc::clone(&shared_checkpoint);
            let next_chunk = Arc::clone(&next_chunk_idx);
            let chunks = Arc::clone(&missing_chunks);
            let global_downloaded = Arc::clone(params.global_downloaded);
            let failed = Arc::clone(params.failed);
            let url_state = Arc::clone(&params.url_state);
            let refresher = params.url_refresher.clone();
            let refresh_lock = Arc::clone(&refresh_lock);
            let dest_buf = part_path.to_path_buf();

            handles.push(s.spawn(move || -> Result<(), String> {
                loop {
                    if failed.load(Ordering::Relaxed) {
                        return Err("aborted".to_string());
                    }
                    let item_idx = next_chunk.fetch_add(1, Ordering::SeqCst) as usize;
                    if item_idx >= chunks.len() {
                        break;
                    }

                    let (chunk_idx, start, end) = chunks[item_idx];
                    let range_arg = format!("{start}-{end}");
                    let expected_len = end - start + 1;

                    let mut attempts = 0;
                    let max_attempts = 4;
                    let mut chunk_succeeded = false;

                    while attempts < max_attempts {
                        if failed.load(Ordering::Relaxed) {
                            return Err("aborted".to_string());
                        }
                        attempts += 1;

                        let current_url = {
                            let r = url_state.read().unwrap();
                            r.clone()
                        };

                        let mut child = match Command::new("curl")
                            .args([
                                "-sS",
                                "-L",
                                "--fail",
                                "--connect-timeout",
                                "15",
                                "--max-time",
                                "120",
                                "-A",
                                VISIONOS_UA,
                                "-r",
                                &range_arg,
                                &current_url,
                            ])
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped())
                            .spawn()
                        {
                            Ok(c) => c,
                            Err(_) => {
                                thread::sleep(Duration::from_millis(500 * attempts as u64));
                                continue;
                            }
                        };

                        let mut stdout = match child.stdout.take() {
                            Some(s) => s,
                            None => {
                                let _ = child.kill();
                                continue;
                            }
                        };

                        let mut buf = [0u8; 64 * 1024];
                        let mut pos = start;
                        let mut read_failed = false;

                        loop {
                            match stdout.read(&mut buf) {
                                Ok(0) => break,
                                Ok(n) => {
                                    if let Err(_e) = file.write_all_at(&buf[..n], pos) {
                                        read_failed = true;
                                        break;
                                    }
                                    pos += n as u64;
                                    global_downloaded.fetch_add(n as u64, Ordering::Relaxed);
                                }
                                Err(_) => {
                                    read_failed = true;
                                    break;
                                }
                            }
                        }

                        let status = child.wait();
                        let success = status.map(|s| s.success()).unwrap_or(false)
                            && !read_failed
                            && (pos - start) == expected_len;

                        if success {
                            chunk_succeeded = true;
                            // Record chunk completion into checkpoint
                            if let Ok(mut ckpt) = ckpt_mutex.lock() {
                                ckpt.mark_completed(chunk_idx);
                                let _ = ckpt.save(&dest_buf);
                            }
                            break;
                        } else {
                            // If failed, revert the partially added bytes for this chunk
                            let written_for_chunk = pos - start;
                            if written_for_chunk > 0 {
                                global_downloaded.fetch_sub(written_for_chunk, Ordering::Relaxed);
                            }

                            // Check if URL might be expired (403), try refreshing URL (single-flight)
                            if let Some(ref refresh_fn) = refresher {
                                if let Ok(_guard) = refresh_lock.lock() {
                                    let latest_url =
                                        url_state.read().map(|r| r.clone()).unwrap_or_default();
                                    if latest_url == current_url {
                                        if let Some(new_url) = refresh_fn() {
                                            if let Ok(mut w) = url_state.write() {
                                                *w = new_url;
                                            }
                                        }
                                    }
                                }
                            }
                            thread::sleep(Duration::from_millis(400 * (1 << (attempts - 1))));
                        }
                    }

                    if !chunk_succeeded {
                        failed.store(true, Ordering::Relaxed);
                        return Err(format!("Chunk {chunk_idx} failed after {max_attempts} attempts"));
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
pub fn download_stream_parallel(params: StreamDownloadParams) -> Result<(), String> {
    download_stream_sequential(params)
}

pub fn download_stream_sequential(params: StreamDownloadParams) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(params.dest)
        .map_err(|e| format!("create {}: {e}", params.dest.display()))?;

    let current_url = {
        let r = params.url_state.read().unwrap();
        r.clone()
    };

    let mut child = Command::new("curl")
        .args(["-sS", "-L", "--fail", "-A", VISIONOS_UA, &current_url])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("curl spawn: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let mut buf = [0u8; 64 * 1024];

    loop {
        if params.failed.load(Ordering::Relaxed) {
            let _ = child.kill();
            return Err("aborted".to_string());
        }
        let n = stdout.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        params.global_downloaded.fetch_add(n as u64, Ordering::Relaxed);
    }

    let st = child.wait().map_err(|e| e.to_string())?;
    if !st.success() {
        params.failed.store(true, Ordering::Relaxed);
        return Err("curl download failed".to_string());
    }
    Ok(())
}
