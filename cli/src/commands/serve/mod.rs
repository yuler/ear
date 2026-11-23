pub mod http;
pub mod state;

use crate::emit::emit_json;
use serde::Deserialize;
use serde_json::json;
use state::{default_library_dir, detect_lan_ip, MirrorState, ServerSnapshot, DEFAULT_PORT};
use std::io::{self, BufRead};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug, Default)]
struct ServeOptions {
    port: u16,
    host: Option<String>,
    name: Option<String>,
    library_dir: Option<PathBuf>,
    state_file: Option<PathBuf>,
    control_stdin: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlCommand {
    cmd: String,
    device_id: Option<String>,
}

pub fn run(args: &[String]) -> Result<(), String> {
    let opts = parse_args(args)?;
    let library_dir = opts.library_dir.unwrap_or_else(default_library_dir);
    let state_file = opts.state_file.unwrap_or_else(|| {
        library_dir
            .parent()
            .unwrap_or(&library_dir)
            .join("mirror-state.json")
    });

    let listener = TcpListener::bind(("0.0.0.0", opts.port))
        .map_err(|e| format!("Failed to bind mirror server on port {}: {e}", opts.port))?;
    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read bound port: {e}"))?
        .port();
    let advertised_host = opts.host.unwrap_or_else(detect_lan_ip);

    let mirror_state = Arc::new(Mutex::new(MirrorState::load_or_init(
        library_dir,
        state_file,
        opts.name,
        advertised_host,
        actual_port,
    )));
    let running = Arc::new(AtomicBool::new(true));

    let emit_snapshot = Arc::new(|snap: ServerSnapshot| {
        emit_json(json!({
            "v": 1,
            "type": "state",
            "state": snap,
        }));
    });

    let initial = mirror_state.lock().unwrap().snapshot();
    emit_json(json!({
        "v": 1,
        "type": "ready",
        "state": initial,
    }));

    // Background ticker rotates the 4-digit pairing code every 2 minutes.
    {
        let st = Arc::clone(&mirror_state);
        let run_flag = Arc::clone(&running);
        let emit_cb = Arc::clone(&emit_snapshot);
        thread::spawn(move || {
            while run_flag.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(1));
                let rotated = {
                    let mut guard = st.lock().unwrap();
                    if guard.ensure_fresh_code() {
                        Some(guard.snapshot())
                    } else {
                        None
                    }
                };
                if let Some(snap) = rotated {
                    emit_cb(snap);
                }
            }
        });
    }

    // Optional NDJSON control loop on stdin (used by Desktop app).
    if opts.control_stdin {
        let st = Arc::clone(&mirror_state);
        let run_flag = Arc::clone(&running);
        let emit_cb = Arc::clone(&emit_snapshot);
        thread::spawn(move || {
            let stdin = io::stdin();
            for line in stdin.lock().lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(cmd) = serde_json::from_str::<ControlCommand>(trimmed) else {
                    continue;
                };
                match cmd.cmd.as_str() {
                    "refresh_code" => {
                        let snap = {
                            let mut guard = st.lock().unwrap();
                            guard.rotate_code();
                            guard.snapshot()
                        };
                        emit_cb(snap);
                    }
                    "remove_device" => {
                        if let Some(id) = cmd.device_id.as_deref() {
                            let snap = {
                                let mut guard = st.lock().unwrap();
                                guard.remove_device(id);
                                guard.snapshot()
                            };
                            emit_cb(snap);
                        }
                    }
                    "status" => {
                        let snap = st.lock().unwrap().snapshot();
                        emit_cb(snap);
                    }
                    "stop" => {
                        run_flag.store(false, Ordering::Relaxed);
                        break;
                    }
                    _ => {}
                }
            }
            run_flag.store(false, Ordering::Relaxed);
        });
    }

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set nonblocking accept: {e}"))?;

    while running.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((stream, _peer)) => {
                let _ = stream.set_nonblocking(false);
                let st = Arc::clone(&mirror_state);
                let emit_cb = Arc::clone(&emit_snapshot);
                thread::spawn(move || {
                    http::handle_connection(stream, st, emit_cb.as_ref());
                });
            }
            Err(err) if err.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => {
                thread::sleep(Duration::from_millis(50));
            }
        }
    }

    Ok(())
}

fn parse_args(args: &[String]) -> Result<ServeOptions, String> {
    let mut opts = ServeOptions {
        port: DEFAULT_PORT,
        ..Default::default()
    };
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                let raw = args.get(i + 1).ok_or("--port requires a value")?;
                opts.port = raw.parse::<u16>().map_err(|_| format!("Invalid port: {raw}"))?;
                i += 2;
            }
            "--host" => {
                opts.host = Some(args.get(i + 1).ok_or("--host requires a value")?.clone());
                i += 2;
            }
            "--name" => {
                opts.name = Some(args.get(i + 1).ok_or("--name requires a value")?.clone());
                i += 2;
            }
            "--library-dir" => {
                opts.library_dir = Some(PathBuf::from(
                    args.get(i + 1).ok_or("--library-dir requires a value")?,
                ));
                i += 2;
            }
            "--state-file" => {
                opts.state_file = Some(PathBuf::from(
                    args.get(i + 1).ok_or("--state-file requires a value")?,
                ));
                i += 2;
            }
            "--control-stdin" => {
                opts.control_stdin = true;
                i += 1;
            }
            other => return Err(format!("Unknown serve argument: {other}")),
        }
    }
    Ok(opts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn send_http(port: u16, raw_request: &str) -> (u16, String, Vec<u8>) {
        let mut sock = TcpStream::connect(("127.0.0.1", port)).unwrap();
        sock.write_all(raw_request.as_bytes()).unwrap();
        let mut resp = Vec::new();
        sock.read_to_end(&mut resp).unwrap();
        let sep = resp
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("HTTP header separator");
        let head = String::from_utf8_lossy(&resp[..sep]).to_string();
        let status = head
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap()
            .parse::<u16>()
            .unwrap();
        (status, head, resp[sep + 4..].to_vec())
    }

    #[test]
    fn parse_byte_range_handles_standard_ranges() {
        assert_eq!(http::parse_byte_range("bytes=0-9", 100), Some((0, 9)));
        assert_eq!(http::parse_byte_range("bytes=50-", 100), Some((50, 99)));
        assert_eq!(http::parse_byte_range("bytes=0-500", 100), Some((0, 99)));
        assert_eq!(http::parse_byte_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(http::parse_byte_range("bytes=100-120", 100), None);
    }

    #[test]
    fn end_to_end_pair_catalog_range_and_revoke() {
        let tmp = std::env::temp_dir().join(format!(
            "ear-serve-test-{}-{}",
            std::process::id(),
            state::now_secs()
        ));
        let lib_dir = tmp.join("library");
        let vid_dir = lib_dir.join("abc12345678");
        fs::create_dir_all(&vid_dir).unwrap();

        let media_path = tmp.join("abc12345678.mp4");
        fs::write(&media_path, b"0123456789abcdefghij").unwrap();
        let cap_path = vid_dir.join("captions.json");
        fs::write(&cap_path, r#"{"videoId":"abc12345678","cues":[]}"#).unwrap();
        fs::write(
            lib_dir.join("abc12345678.json"),
            serde_json::to_string(&json!({
                "videoId": "abc12345678",
                "title": "Test Lesson",
                "state": "ready",
                "videoPath": media_path.to_string_lossy(),
                "captionsPath": cap_path.to_string_lossy(),
                "durationMs": 60000
            }))
            .unwrap(),
        )
        .unwrap();

        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let st = Arc::new(Mutex::new(MirrorState::load_or_init(
            lib_dir,
            tmp.join("mirror-state.json"),
            Some("Home MacBook Pro".to_string()),
            "127.0.0.1".to_string(),
            port,
        )));

        let initial_code = st.lock().unwrap().code.clone();
        let st_srv = Arc::clone(&st);
        let stop = Arc::new(AtomicBool::new(false));
        let stop_srv = Arc::clone(&stop);
        listener.set_nonblocking(true).unwrap();

        let handle = thread::spawn(move || {
            let noop = |_s: ServerSnapshot| {};
            while !stop_srv.load(Ordering::Relaxed) {
                if let Ok((stream, _)) = listener.accept() {
                    let _ = stream.set_nonblocking(false);
                    http::handle_connection(stream, Arc::clone(&st_srv), &noop);
                } else {
                    thread::sleep(Duration::from_millis(5));
                }
            }
        });

        // 1. Health check
        let (status, _, body) = send_http(port, "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
        assert_eq!(status, 200);
        let health: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(health["ok"], true);
        assert_eq!(health["serverName"], "Home MacBook Pro");

        // 2. Wrong code rejected
        let bad_body = r#"{"code":"0000","deviceName":"Test iPhone"}"#;
        let (status, _, _) = send_http(
            port,
            &format!(
                "POST /v1/pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {}\r\n\r\n{}",
                bad_body.len(),
                bad_body
            ),
        );
        assert_eq!(status, 401);

        // 3. Valid code pairs & rotates code
        let pair_body = format!(r#"{{"code":"{initial_code}","deviceName":"Test iPhone"}}"#);
        let (status, _, body) = send_http(
            port,
            &format!(
                "POST /v1/pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {}\r\n\r\n{}",
                pair_body.len(),
                pair_body
            ),
        );
        assert_eq!(status, 200);
        let paired: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let token = paired["token"].as_str().unwrap().to_string();
        let device_id = paired["deviceId"].as_str().unwrap().to_string();
        assert_ne!(st.lock().unwrap().code, initial_code);

        // 4. Library listing with bearer token
        let (status, _, body) = send_http(
            port,
            &format!("GET /v1/library HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"),
        );
        assert_eq!(status, 200);
        let lib: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(lib["items"].as_array().unwrap().len(), 1);
        assert_eq!(lib["items"][0]["videoId"], "abc12345678");
        assert_eq!(lib["items"][0]["sizeBytes"], 20);

        // 5. Partial Range media download (bytes=10-14 -> "abcde")
        let (status, head, body) = send_http(
            port,
            &format!(
                "GET /v1/videos/abc12345678/media HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nRange: bytes=10-14\r\n\r\n"
            ),
        );
        assert_eq!(status, 206);
        assert!(head.contains("Content-Range: bytes 10-14/20"));
        assert_eq!(body, b"abcde");

        // 6. Captions download
        let (status, _, body) = send_http(
            port,
            &format!(
                "GET /v1/videos/abc12345678/captions HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        assert_eq!(status, 200);
        assert!(String::from_utf8_lossy(&body).contains("abc12345678"));

        // 7. Revoking device returns 401 unpaired
        assert!(st.lock().unwrap().remove_device(&device_id));
        let (status, _, body) = send_http(
            port,
            &format!("GET /v1/library HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"),
        );
        assert_eq!(status, 401);
        assert!(String::from_utf8_lossy(&body).contains("unpaired"));

        stop.store(true, Ordering::Relaxed);
        let _ = handle.join();
        let _ = fs::remove_dir_all(&tmp);
    }
}
