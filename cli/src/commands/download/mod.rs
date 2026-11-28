pub mod checkpoint;
pub mod library_sync;
pub mod source;
pub mod transfer;

use crate::commands::download::checkpoint::PartCheckpoint;
use crate::commands::download::library_sync::{
    fetch_and_save_captions, get_default_downloads_dir, get_library_dir, sync_entry_error,
    sync_entry_paused, sync_entry_progress, sync_entry_ready, LibraryEntrySync,
};
use crate::commands::download::source::{fallback_yt_dlp, refresh_stream_url, resolve_streams};
use crate::commands::download::transfer::{
    download_stream_parallel, download_stream_sequential, probe_remote_size, StreamDownloadParams,
};
use crate::commands::ffmpeg_dep::{resolve_ffmpeg, FFMPEG_NOT_FOUND};
use crate::commands::probe::probe_video_dimensions;
use crate::emit::emit_json;
use crate::youtube::{extract_video_id, is_valid_id};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

pub fn run(args: &[String]) -> Result<(), String> {
    let mut video_id = String::new();
    let mut output_str = String::new();
    let mut video_url: Option<String> = None;
    let mut audio_url: Option<String> = None;
    let mut quality = "720p".to_string();
    let mut concurrency: usize = 4;
    let mut no_captions = false;
    let mut no_library_sync = false;
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
            "--no-library-sync" => {
                no_library_sync = true;
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

    if !video_id.is_empty() && !is_valid_id(&video_id) {
        return Err(format!("Invalid video ID: {video_id}"));
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
        output_str = dl_dir
            .join(format!("{base}.{ext}"))
            .to_string_lossy()
            .to_string();
    }

    let output_path = PathBuf::from(&output_str);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }

    let library_dir = if no_library_sync {
        None
    } else {
        library_dir_override.or_else(get_library_dir)
    };

    let resolved = resolve_streams(&video_id, &quality);
    let video_title = resolved.video_title;
    if video_url.is_none() {
        video_url = resolved.video_url;
    }
    if audio_url.is_none() {
        audio_url = resolved.audio_url;
    }
    let thumbnail_url = resolved.thumbnail_url;
    let player_json = resolved.player_json;
    let resolved_dims = resolved.video_width.zip(resolved.video_height);

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
            entry.video_path = if is_audio_only {
                None
            } else {
                Some(output_path.to_string_lossy().to_string())
            };
            entry.audio_path = if is_audio_only {
                Some(output_path.to_string_lossy().to_string())
            } else {
                None
            };
            if !is_audio_only {
                if let Some((w, h)) = resolved_dims {
                    entry.video_width = Some(w);
                    entry.video_height = Some(h);
                }
            }
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
                    sync_entry_progress(
                        lib,
                        &rep_vid,
                        cur_bytes,
                        total_bytes,
                        rounded_pct,
                        speed_bps,
                        eta_seconds,
                    );
                }
            }
        }
    });

    let mut transfer_res: Result<(), String> = Ok(());

    // Helper for URL refresh
    let vid_for_refresh = video_id.clone();
    let quality_for_refresh = quality.clone();
    let make_url_refresher =
        move |is_video: bool| -> Arc<dyn Fn() -> Option<String> + Send + Sync> {
            let vid = vid_for_refresh.clone();
            let qid = quality_for_refresh.clone();
            Arc::new(move || refresh_stream_url(&vid, &qid, is_video))
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
                let Some(ffmpeg_bin) = resolve_ffmpeg() else {
                    if let Some(ref lib) = library_dir {
                        if !video_id.is_empty() {
                            sync_entry_error(lib, &video_id, FFMPEG_NOT_FOUND);
                        }
                    }
                    return Err(FFMPEG_NOT_FOUND.to_string());
                };
                let st = Command::new(&ffmpeg_bin)
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
                    if let Some(ref lib) = library_dir {
                        if !video_id.is_empty() {
                            sync_entry_error(
                                lib,
                                &video_id,
                                "ffmpeg failed to mux video and audio",
                            );
                        }
                    }
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
        let final_dims = if is_audio_only {
            None
        } else {
            resolved_dims
                .or_else(|| probe_video_dimensions(&output_path).map(|d| (d.width, d.height)))
        };
        if let Some(ref lib) = library_dir {
            if !video_id.is_empty() {
                sync_entry_ready(
                    lib,
                    &video_id,
                    &output_path,
                    saved_captions_path.as_deref(),
                    final_size,
                    is_audio_only,
                    final_dims,
                );
            }
        }

        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": final_size,
            "videoWidth": final_dims.map(|d| d.0),
            "videoHeight": final_dims.map(|d| d.1)
        }));
        return Ok(());
    }

    // Fallback to yt-dlp if needed
    if !video_id.is_empty() {
        let size = fallback_yt_dlp(&video_id, &quality, &output_path)?;
        let mut saved_captions_path: Option<String> = None;
        if !no_captions {
            if let Some(ref lib) = library_dir {
                if let Some(ref p) = player_json {
                    if let Some(cpath) = fetch_and_save_captions(&video_id, &video_title, lib, p) {
                        saved_captions_path = Some(cpath.to_string_lossy().to_string());
                    }
                }
            }
        }
        let final_dims = if is_audio_only {
            None
        } else {
            resolved_dims
                .or_else(|| probe_video_dimensions(&output_path).map(|d| (d.width, d.height)))
        };
        if let Some(ref lib) = library_dir {
            sync_entry_ready(
                lib,
                &video_id,
                &output_path,
                saved_captions_path.as_deref(),
                size,
                is_audio_only,
                final_dims,
            );
        }
        emit_json(json!({
            "v": 1,
            "type": "done",
            "percent": 100.0,
            "path": output_path.to_string_lossy(),
            "sizeBytes": size,
            "videoWidth": final_dims.map(|d| d.0),
            "videoHeight": final_dims.map(|d| d.1)
        }));
        return Ok(());
    }

    Err("Download failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rejects_invalid_video_id_path_traversal() {
        let args = vec!["../../etc/passwd".to_string()];
        let err = run(&args).expect_err("path traversal video_id must be rejected");
        assert!(
            err.contains("Invalid video ID"),
            "unexpected error message: {err}"
        );
    }

    #[test]
    fn test_rejects_invalid_video_id_flag() {
        let args = vec!["--video-id".to_string(), "../bad".to_string()];
        let err = run(&args).expect_err("invalid --video-id must be rejected");
        assert!(
            err.contains("Invalid video ID"),
            "unexpected error message: {err}"
        );
    }

    #[test]
    fn test_no_library_sync_does_not_create_library_entry() {
        let temp_dir = std::env::temp_dir().join(format!(
            "ear_no_sync_{}",
            crate::commands::download::library_sync::now_millis()
        ));
        let args = vec![
            "--video-id".to_string(),
            "dQw4w9WgXcQ".to_string(),
            "--library-dir".to_string(),
            temp_dir.to_string_lossy().to_string(),
            "--no-library-sync".to_string(),
            "--output".to_string(),
            temp_dir.join("test.mp4").to_string_lossy().to_string(),
        ];
        let _ = run(&args);
        let entry_file = temp_dir.join("dQw4w9WgXcQ.json");
        assert!(
            !entry_file.exists(),
            "entry file must not be created when --no-library-sync is active"
        );
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
