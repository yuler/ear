use crate::commands::serve::catalog::MediaCatalog;
use crate::commands::serve::state::{MirrorState, PairError, ServerSnapshot};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_HEADER_BYTES: usize = 32 * 1024;
const MAX_BODY_BYTES: usize = 256 * 1024;
const HEADER_READ_DEADLINE: Duration = Duration::from_secs(10);
const BODY_READ_DEADLINE: Duration = Duration::from_secs(15);

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

enum HttpReadError {
    Eof,
    BadRequest,
    HeaderTooLarge,
    BodyTooLarge,
    Timeout,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequestBody {
    code: String,
    device_name: Option<String>,
    device_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStatusBody {
    synced_count: usize,
    total_count: usize,
    background: Option<bool>,
}

pub fn handle_connection(
    mut stream: TcpStream,
    state: Arc<Mutex<MirrorState>>,
    catalog: Arc<MediaCatalog>,
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let _ = stream.set_write_timeout(Some(Duration::from_secs(60)));

    let req = match read_request(&mut stream) {
        Ok(req) => req,
        Err(HttpReadError::Eof) => return,
        Err(HttpReadError::HeaderTooLarge) => {
            let _ = write_json(
                &mut stream,
                431,
                "Request Header Fields Too Large",
                &json!({ "error": "header_too_large" }),
            );
            return;
        }
        Err(HttpReadError::BodyTooLarge) => {
            let _ = write_json(
                &mut stream,
                413,
                "Payload Too Large",
                &json!({ "error": "body_too_large" }),
            );
            return;
        }
        Err(HttpReadError::Timeout) => {
            let _ = write_json(
                &mut stream,
                408,
                "Request Timeout",
                &json!({ "error": "request_timeout" }),
            );
            return;
        }
        Err(HttpReadError::BadRequest) => {
            let _ = write_json(
                &mut stream,
                400,
                "Bad Request",
                &json!({ "error": "bad_request" }),
            );
            return;
        }
    };

    // Native iOS mirror clients never send browser Origin headers; reject browser CSRF/LAN probing.
    if req.headers.contains_key("origin") {
        let _ = write_json(
            &mut stream,
            403,
            "Forbidden",
            &json!({ "error": "origin_not_allowed" }),
        );
        return;
    }

    let clean_path = req.path.split('?').next().unwrap_or(&req.path);
    match (req.method.as_str(), clean_path) {
        ("GET", "/v1/health") => {
            let body = {
                let guard = state.lock().unwrap();
                json!({
                    "ok": true,
                    "serverId": guard.server_id,
                    "serverName": guard.server_name,
                    "shortName": guard.short_name(),
                    "version": env!("CARGO_PKG_VERSION"),
                    "transport": "lan",
                })
            };
            let _ = write_json(&mut stream, 200, "OK", &body);
        }
        ("POST", "/v1/pair") => handle_pair(&mut stream, &req, &state, &catalog, on_change),
        ("GET", "/v1/library") => handle_library(&mut stream, &req, &state, &catalog),
        ("POST", "/v1/device/status") => {
            handle_device_status(&mut stream, &req, &state, &catalog, on_change);
        }
        ("POST", "/v1/unpair") => handle_unpair(&mut stream, &req, &state, &catalog, on_change),
        ("GET", p) if p.starts_with("/v1/videos/") => {
            handle_video_asset(&mut stream, &req, p, &state, &catalog);
        }
        _ => {
            let _ = write_json(&mut stream, 404, "Not Found", &json!({ "error": "not_found" }));
        }
    }
}

pub fn write_service_unavailable(stream: &mut TcpStream) {
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let _ = write_json(
        stream,
        503,
        "Service Unavailable",
        &json!({ "error": "too_many_connections" }),
    );
}

fn handle_pair(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
    catalog: &Arc<MediaCatalog>,
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let Ok(payload) = serde_json::from_slice::<PairRequestBody>(&req.body) else {
        let _ = write_json(
            stream,
            400,
            "Bad Request",
            &json!({ "error": "invalid_json" }),
        );
        return;
    };
    let library_count = catalog.scan().len();
    let (result, snap) = {
        let mut guard = state.lock().unwrap();
        let res = guard.pair_device(
            &payload.code,
            payload.device_name.as_deref().unwrap_or("iPhone"),
            payload.device_id.as_deref(),
            library_count,
        );
        let snapshot = guard.snapshot(library_count);
        (res, snapshot)
    };
    match result {
        Ok(issued) => {
            on_change(snap.clone());
            let body = json!({
                "serverId": snap.server_id,
                "serverName": snap.server_name,
                "shortName": snap.short_name,
                "deviceId": issued.device.id,
                "token": issued.token,
                "transport": "lan",
            });
            let _ = write_json(stream, 200, "OK", &body);
        }
        Err(PairError::Locked) => {
            on_change(snap);
            let _ = write_json(
                stream,
                429,
                "Too Many Requests",
                &json!({ "error": "pair_locked" }),
            );
        }
        Err(PairError::CodeExpired) => {
            on_change(snap);
            let _ = write_json(
                stream,
                401,
                "Unauthorized",
                &json!({ "error": "code_expired" }),
            );
        }
        Err(PairError::InvalidCode { attempts_remaining }) => {
            on_change(snap);
            let _ = write_json(
                stream,
                401,
                "Unauthorized",
                &json!({ "error": "invalid_code", "attemptsRemaining": attempts_remaining }),
            );
        }
        Err(PairError::EntropyUnavailable(_)) => {
            let _ = write_json(
                stream,
                503,
                "Service Unavailable",
                &json!({ "error": "entropy_unavailable" }),
            );
        }
    }
}

fn handle_library(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
    catalog: &Arc<MediaCatalog>,
) {
    let Some(_device_id) = require_auth(stream, req, state) else {
        return;
    };
    let items = catalog.scan();
    let (server_id, server_name, short_name) = {
        let guard = state.lock().unwrap();
        (
            guard.server_id.clone(),
            guard.server_name.clone(),
            guard.short_name(),
        )
    };
    let body = json!({
        "serverId": server_id,
        "serverName": server_name,
        "shortName": short_name,
        "items": items,
    });
    let _ = write_json(stream, 200, "OK", &body);
}

fn handle_device_status(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
    catalog: &Arc<MediaCatalog>,
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let Some(device_id) = require_auth(stream, req, state) else {
        return;
    };
    let Ok(payload) = serde_json::from_slice::<DeviceStatusBody>(&req.body) else {
        let _ = write_json(
            stream,
            400,
            "Bad Request",
            &json!({ "error": "invalid_json" }),
        );
        return;
    };
    let library_count = catalog.scan().len();
    let snap = {
        let mut guard = state.lock().unwrap();
        guard.update_device_status(
            &device_id,
            payload.synced_count,
            payload.total_count,
            payload.background.unwrap_or(false),
        );
        guard.snapshot(library_count)
    };
    on_change(snap);
    let _ = write_json(stream, 200, "OK", &json!({ "ok": true }));
}

fn handle_unpair(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
    catalog: &Arc<MediaCatalog>,
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let Some(device_id) = require_auth(stream, req, state) else {
        return;
    };
    let library_count = catalog.scan().len();
    let snap = {
        let mut guard = state.lock().unwrap();
        guard.remove_device(&device_id);
        guard.snapshot(library_count)
    };
    on_change(snap);
    let _ = write_json(stream, 200, "OK", &json!({ "ok": true }));
}

fn handle_video_asset(
    stream: &mut TcpStream,
    req: &HttpRequest,
    path: &str,
    state: &Arc<Mutex<MirrorState>>,
    catalog: &Arc<MediaCatalog>,
) {
    let Some(_device_id) = require_auth(stream, req, state) else {
        return;
    };
    let rest = &path["/v1/videos/".len()..];
    let parts: Vec<&str> = rest.split('/').collect();
    if parts.len() != 2 {
        let _ = write_json(stream, 404, "Not Found", &json!({ "error": "not_found" }));
        return;
    }
    let (video_id, kind) = (parts[0], parts[1]);
    match kind {
        "captions" => {
            let Some(p) = catalog.resolve_captions(video_id) else {
                let _ = write_json(stream, 404, "Not Found", &json!({ "error": "no_captions" }));
                return;
            };
            let Ok(bytes) = std::fs::read(p) else {
                let _ = write_json(
                    stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": "read_failed" }),
                );
                return;
            };
            let _ = write_bytes(stream, 200, "OK", "application/json; charset=utf-8", &bytes);
        }
        "media" => {
            let Some(m) = catalog.resolve_media(video_id) else {
                let _ = write_json(stream, 404, "Not Found", &json!({ "error": "no_media" }));
                return;
            };
            let etag = format!("\"sha256:{}\"", m.content_sha256);
            if let Some(if_match) = req.headers.get("if-match").map(String::as_str) {
                let matched = if_match
                    .split(',')
                    .map(str::trim)
                    .any(|tag| tag == "*" || tag == etag);
                if !matched {
                    let _ = write_json(
                        stream,
                        412,
                        "Precondition Failed",
                        &json!({ "error": "representation_changed" }),
                    );
                    return;
                }
            }
            let _ = stream_file_with_range(
                stream,
                &m.path,
                &m.mime_type,
                m.size_bytes,
                &etag,
                &m.content_sha256,
                req.headers.get("range").map(String::as_str),
            );
        }
        _ => {
            let _ = write_json(stream, 404, "Not Found", &json!({ "error": "not_found" }));
        }
    }
}

fn require_auth(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
) -> Option<String> {
    let auth = req
        .headers
        .get("authorization")
        .map(String::as_str)
        .unwrap_or("");
    let token = auth.strip_prefix("Bearer ").map(str::trim).unwrap_or("");
    if token.is_empty() {
        let _ = write_json(
            stream,
            401,
            "Unauthorized",
            &json!({ "error": "unpaired" }),
        );
        return None;
    }
    let verified = {
        let mut guard = state.lock().unwrap();
        guard.verify_token(token)
    };
    if verified.is_none() {
        let _ = write_json(
            stream,
            401,
            "Unauthorized",
            &json!({ "error": "unpaired" }),
        );
    }
    verified
}

pub fn parse_byte_range(header: &str, total: u64) -> Option<(u64, u64)> {
    if total == 0 {
        return None;
    }
    let spec = header.trim().strip_prefix("bytes=")?;
    let first = spec.split(',').next()?.trim();
    let (start_s, end_s) = first.split_once('-')?;
    if start_s.is_empty() {
        let suffix: u64 = end_s.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = total.saturating_sub(suffix);
        return Some((start, total - 1));
    }
    let start: u64 = start_s.parse().ok()?;
    if start >= total {
        return None;
    }
    let end = if end_s.is_empty() {
        total - 1
    } else {
        end_s.parse::<u64>().ok()?.min(total - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

fn stream_file_with_range(
    stream: &mut TcpStream,
    path: &std::path::Path,
    mime: &str,
    total: u64,
    etag: &str,
    content_sha256: &str,
    range_header: Option<&str>,
) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    let (status, reason, start, end) = match range_header {
        Some(hdr) => match parse_byte_range(hdr, total) {
            Some((s, e)) => (206, "Partial Content", s, e),
            None => {
                let resp = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total}\r\nETag: {etag}\r\nX-Ear-Content-Sha256: {content_sha256}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                stream.write_all(resp.as_bytes())?;
                return Ok(());
            }
        },
        None => (200, "OK", 0, total.saturating_sub(1)),
    };

    let len = if total == 0 { 0 } else { end - start + 1 };
    let mut head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nAccept-Ranges: bytes\r\nETag: {etag}\r\nX-Ear-Content-Sha256: {content_sha256}\r\nContent-Length: {len}\r\nConnection: close\r\n"
    );
    if status == 206 {
        head.push_str(&format!("Content-Range: bytes {start}-{end}/{total}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;

    if len == 0 {
        return Ok(());
    }
    file.seek(SeekFrom::Start(start))?;
    let mut remaining = len;
    let mut buf = [0u8; 64 * 1024];
    while remaining > 0 {
        let to_read = remaining.min(buf.len() as u64) as usize;
        let n = file.read(&mut buf[..to_read])?;
        if n == 0 {
            break;
        }
        stream.write_all(&buf[..n])?;
        remaining -= n as u64;
    }
    stream.flush()
}

fn find_header_end(buf: &[u8]) -> Option<(usize, usize)> {
    for i in 0..buf.len() {
        if i + 4 <= buf.len() && &buf[i..i + 4] == b"\r\n\r\n" {
            return Some((i, i + 4));
        }
        if i + 2 <= buf.len() && &buf[i..i + 2] == b"\n\n" {
            return Some((i, i + 2));
        }
    }
    None
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, HttpReadError> {
    let head_deadline = Instant::now() + HEADER_READ_DEADLINE;
    let mut raw = Vec::with_capacity(1024);
    let mut chunk = [0u8; 4096];

    let (head_end, body_start) = loop {
        if let Some(pos) = find_header_end(&raw) {
            break pos;
        }
        if raw.len() >= MAX_HEADER_BYTES {
            return Err(HttpReadError::HeaderTooLarge);
        }
        let now = Instant::now();
        if now >= head_deadline {
            return Err(HttpReadError::Timeout);
        }
        let _ = stream.set_read_timeout(Some(head_deadline.saturating_duration_since(now)));
        let max_to_read = (MAX_HEADER_BYTES + 4 - raw.len()).min(chunk.len());
        match stream.read(&mut chunk[..max_to_read]) {
            Ok(0) => {
                return if raw.is_empty() {
                    Err(HttpReadError::Eof)
                } else {
                    Err(HttpReadError::BadRequest)
                };
            }
            Ok(n) => raw.extend_from_slice(&chunk[..n]),
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                return Err(HttpReadError::Timeout);
            }
            Err(_) => return Err(HttpReadError::Eof),
        }
    };

    if head_end > MAX_HEADER_BYTES {
        return Err(HttpReadError::HeaderTooLarge);
    }

    let head_str = std::str::from_utf8(&raw[..head_end]).map_err(|_| HttpReadError::BadRequest)?;
    let mut lines = head_str.split('\n');
    let request_line = lines
        .next()
        .ok_or(HttpReadError::BadRequest)?
        .trim_end_matches('\r');
    let mut parts = request_line.split_whitespace();
    let method = parts.next().ok_or(HttpReadError::BadRequest)?.to_string();
    let path = parts.next().ok_or(HttpReadError::BadRequest)?.to_string();
    if parts.next().is_none() {
        return Err(HttpReadError::BadRequest);
    }

    let mut headers = HashMap::new();
    for line in lines {
        let trimmed = line.trim_end_matches('\r');
        if trimmed.is_empty() {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_len = match headers.get("content-length") {
        Some(v) => v.parse::<usize>().map_err(|_| HttpReadError::BadRequest)?,
        None => 0,
    };
    if content_len > MAX_BODY_BYTES {
        return Err(HttpReadError::BodyTooLarge);
    }

    let mut body = Vec::with_capacity(content_len);
    let already = &raw[body_start..];
    let take_initial = already.len().min(content_len);
    body.extend_from_slice(&already[..take_initial]);

    let body_deadline = Instant::now() + BODY_READ_DEADLINE;
    while body.len() < content_len {
        let now = Instant::now();
        if now >= body_deadline {
            return Err(HttpReadError::Timeout);
        }
        let _ = stream.set_read_timeout(Some(body_deadline.saturating_duration_since(now)));
        let want = (content_len - body.len()).min(chunk.len());
        match stream.read(&mut chunk[..want]) {
            Ok(0) => return Err(HttpReadError::BadRequest),
            Ok(n) => body.extend_from_slice(&chunk[..n]),
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                return Err(HttpReadError::Timeout);
            }
            Err(_) => return Err(HttpReadError::Eof),
        }
    }

    Ok(HttpRequest {
        method,
        path,
        headers,
        body,
    })
}

fn write_json(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    value: &serde_json::Value,
) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(value).unwrap_or_default();
    write_bytes(stream, status, reason, "application/json; charset=utf-8", &bytes)
}

fn write_bytes(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    bytes: &[u8],
) -> std::io::Result<()> {
    let mut buf = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        bytes.len()
    )
    .into_bytes();
    buf.extend_from_slice(bytes);
    stream.write_all(&buf)?;
    stream.flush()
}
