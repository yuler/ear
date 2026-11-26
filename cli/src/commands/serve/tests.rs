use super::*;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;

fn send_http(port: u16, raw_request: &str) -> (u16, String, Vec<u8>) {
    let mut sock = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let _ = sock.write_all(raw_request.as_bytes());
    let mut resp = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        match sock.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => resp.extend_from_slice(&buf[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::ConnectionReset && !resp.is_empty() => break,
            Err(e) => panic!("read HTTP response failed: {e}"),
        }
    }
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

    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let state_path = tmp.join("mirror-state.json");
    let cat = Arc::new(MediaCatalog::new(lib_dir));
    let st = Arc::new(Mutex::new(
        MirrorState::load_or_init(
            state_path.clone(),
            Some("Home MacBook Pro".to_string()),
            "127.0.0.1".to_string(),
            port,
        )
        .unwrap(),
    ));

    let initial_code = st.lock().unwrap().code.clone();
    let st_srv = Arc::clone(&st);
    let cat_srv = Arc::clone(&cat);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_srv = Arc::clone(&stop);
    listener.set_nonblocking(true).unwrap();

    let handle = thread::spawn(move || {
        let noop = |_s: ServerSnapshot| {};
        while !stop_srv.load(Ordering::Relaxed) {
            if let Ok((stream, _)) = listener.accept() {
                let _ = stream.set_nonblocking(false);
                http::handle_connection(stream, Arc::clone(&st_srv), Arc::clone(&cat_srv), &noop);
            } else {
                thread::sleep(Duration::from_millis(5));
            }
        }
    });

    // 1. Health check (must not expose wildcard CORS headers)
    let (status, head, body) = send_http(port, "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(status, 200);
    assert!(!head.to_ascii_lowercase().contains("access-control-allow-origin"));
    let health: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(health["ok"], true);
    assert_eq!(health["serverName"], "Home MacBook Pro");

    // 1b. Browser cross-origin requests are rejected with 403
    let (status, _, body) = send_http(
        port,
        "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example\r\n\r\n",
    );
    assert_eq!(status, 403);
    assert!(String::from_utf8_lossy(&body).contains("origin_not_allowed"));

    // 1c. Oversized header without newline returns 431 instead of allocating unbounded memory
    let huge_line = format!("GET /{} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n", "a".repeat(40 * 1024));
    let (status, _, body) = send_http(port, &huge_line);
    assert_eq!(status, 431);
    assert!(String::from_utf8_lossy(&body).contains("header_too_large"));

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

    // 3. Valid code pairs, rotates code, and persists hashed token with 0600 permissions
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

    // Persisted mirror-state.json must not contain the plaintext bearer token.
    let state_raw = fs::read_to_string(&state_path).unwrap();
    assert!(!state_raw.contains(&token));
    assert!(state_raw.contains("tokenSha256"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(&state_path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    // 4. Missing Authorization header returns 401 unpaired
    let (status, _, body) = send_http(port, "GET /v1/library HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(status, 401);
    assert!(String::from_utf8_lossy(&body).contains("unpaired"));

    // 5. Library listing with bearer token includes contentSha256
    let (status, _, body) = send_http(
        port,
        &format!(
            "GET /v1/library HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"
        ),
    );
    assert_eq!(status, 200);
    let lib: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(lib["items"].as_array().unwrap().len(), 1);
    assert_eq!(lib["items"][0]["videoId"], "abc12345678");
    assert_eq!(lib["items"][0]["sizeBytes"], 20);
    let sha = lib["items"][0]["contentSha256"].as_str().unwrap().to_string();
    assert_eq!(sha.len(), 64);

    // 6. Partial Range media download with matching If-Match (bytes=10-14 -> "abcde")
    let (status, head, body) = send_http(
        port,
        &format!(
            "GET /v1/videos/abc12345678/media HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nRange: bytes=10-14\r\nIf-Match: \"sha256:{sha}\"\r\n\r\n"
        ),
    );
    assert_eq!(status, 206);
    assert!(head.contains("Content-Range: bytes 10-14/20"));
    assert!(head.contains(&format!("ETag: \"sha256:{sha}\"")));
    assert_eq!(body, b"abcde");

    // 7. Conditional Range with stale If-Match returns 412 Precondition Failed
    let (status, _, body) = send_http(
        port,
        &format!(
            "GET /v1/videos/abc12345678/media HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nRange: bytes=0-4\r\nIf-Match: \"sha256:0000\"\r\n\r\n"
        ),
    );
    assert_eq!(status, 412);
    assert!(String::from_utf8_lossy(&body).contains("representation_changed"));

    // 8. Captions download
    let (status, _, body) = send_http(
        port,
        &format!(
            "GET /v1/videos/abc12345678/captions HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"
        ),
    );
    assert_eq!(status, 200);
    assert!(String::from_utf8_lossy(&body).contains("abc12345678"));

    // 9. Revoking device returns 401 unpaired
    assert!(st.lock().unwrap().remove_device(&device_id));
    let (status, _, body) = send_http(
        port,
        &format!(
            "GET /v1/library HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"
        ),
    );
    assert_eq!(status, 401);
    assert!(String::from_utf8_lossy(&body).contains("unpaired"));

    stop.store(true, Ordering::Relaxed);
    let _ = handle.join();
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn pairing_lockout_stays_locked_until_manual_recovery_and_migrates_legacy_tokens() {
    let tmp = std::env::temp_dir().join(format!(
        "ear-serve-lockout-{}-{}",
        std::process::id(),
        state::now_secs()
    ));
    fs::create_dir_all(&tmp).unwrap();
    let state_path = tmp.join("mirror-state.json");

    // Seed legacy plaintext token state to verify one-time migration to tokenSha256.
    let legacy_token = "legacy-secret-token-value-1234567890";
    fs::write(
        &state_path,
        serde_json::to_string(&json!({
            "serverId": "srv-legacy",
            "serverName": "Lockout Test Mac",
            "devices": [{
                "id": "ios-legacy",
                "name": "Old iPhone",
                "token": legacy_token,
                "pairedAt": 1,
                "lastSeenAt": 1,
                "syncedCount": 0,
                "totalCount": 0,
                "background": false
            }]
        }))
        .unwrap(),
    )
    .unwrap();

    let mut st = MirrorState::load_or_init(
        state_path.clone(),
        Some("Lockout Test Mac".to_string()),
        "127.0.0.1".to_string(),
        7890,
    )
    .unwrap();

    // Legacy token still authenticates via its migrated SHA-256 digest, and plaintext is gone from disk.
    assert_eq!(st.verify_token(legacy_token).as_deref(), Some("ios-legacy"));
    let persisted = fs::read_to_string(&state_path).unwrap();
    assert!(!persisted.contains(legacy_token));
    assert!(persisted.contains("tokenSha256"));
    st.devices.clear();

    let t0 = 1_700_000_000u64;
    st.reopen_pairing_at(t0).unwrap();
    let valid_code = st.code.clone();
    let wrong_code = if valid_code == "0000" { "9999" } else { "0000" };

    // Exhaust the aggregate attempt budget with wrong codes.
    for attempt in 1..state::PAIR_MAX_FAILED_ATTEMPTS {
        let err = st
            .pair_device_at(t0 + attempt as u64, wrong_code, "Attacker", None, 0)
            .unwrap_err();
        assert_eq!(
            err,
            state::PairError::InvalidCode {
                attempts_remaining: state::PAIR_MAX_FAILED_ATTEMPTS - attempt
            }
        );
        assert!(st.devices.is_empty());
    }

    // The Nth wrong attempt locks pairing indefinitely until explicit desktop reopen.
    let lock_time = t0 + state::PAIR_MAX_FAILED_ATTEMPTS as u64;
    let err = st
        .pair_device_at(lock_time, wrong_code, "Attacker", None, 0)
        .unwrap_err();
    assert_eq!(err, state::PairError::Locked);
    assert!(st.code.is_empty());
    assert!(st.is_pair_locked());

    // Even 10,000 seconds later, ticker and pair attempts must NOT auto-unlock.
    assert!(!st.ensure_fresh_code_at(lock_time + 10_000).unwrap());
    assert!(st.code.is_empty());
    assert_eq!(
        st.pair_device_at(lock_time + 10_000, &valid_code, "Late Client", None, 0)
            .unwrap_err(),
        state::PairError::Locked
    );
    assert!(st.devices.is_empty());

    // Explicit desktop reopen_pairing unlocks with a fresh code.
    st.reopen_pairing_at(lock_time + 10_001).unwrap();
    assert!(!st.is_pair_locked());
    let fresh_code = st.code.clone();
    assert_eq!(fresh_code.len(), 4);

    // One-use pairing succeeds once, then immediately invalidates the code.
    let issued = st
        .pair_device_at(lock_time + 10_002, &fresh_code, "Owner iPhone", None, 0)
        .unwrap();
    assert_eq!(issued.token.len(), 64);
    assert_eq!(st.devices.len(), 1);
    assert_ne!(st.code, fresh_code);
    assert!(st
        .pair_device_at(lock_time + 10_003, &fresh_code, "Replay", None, 0)
        .is_err());

    let _ = fs::remove_dir_all(&tmp);
}
