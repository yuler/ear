use crate::commands::serve::state::{MirrorState, ServerSnapshot};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const MAX_HEADER_BYTES: usize = 32 * 1024;
const MAX_BODY_BYTES: usize = 256 * 1024;

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
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
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(60)));

    let Some(req) = read_request(&mut stream) else {
        return;
    };

    let clean_path = req.path.split('?').next().unwrap_or(&req.path);
    match (req.method.as_str(), clean_path) {
        ("OPTIONS", _) => {
            let _ = write_empty(&mut stream, 204, "No Content");
        }
        ("GET", "/v1/health") => {
            let guard = state.lock().unwrap();
            let body = json!({
                "ok": true,
                "serverId": guard.server_id,
                "serverName": guard.server_name,
                "shortName": guard.short_name(),
                "version": env!("CARGO_PKG_VERSION"),
                "transport": "lan",
            });
            let _ = write_json(&mut stream, 200, "OK", &body);
        }
        ("POST", "/v1/pair") => handle_pair(&mut stream, &req, &state, on_change),
        ("GET", "/v1/library") => handle_library(&mut stream, &req, &state),
        ("POST", "/v1/device/status") => handle_device_status(&mut stream, &req, &state, on_change),
        ("POST", "/v1/unpair") => handle_unpair(&mut stream, &req, &state, on_change),
        ("GET", p) if p.starts_with("/v1/videos/") => {
            handle_video_asset(&mut stream, &req, p, &state);
        }
        _ => {
            let _ = write_json(&mut stream, 404, "Not Found", &json!({ "error": "not_found" }));
        }
    }
}

fn handle_pair(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
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
    let (result, snap) = {
        let mut guard = state.lock().unwrap();
        let res = guard.pair_device(
            &payload.code,
            payload.device_name.as_deref().unwrap_or("iPhone"),
            payload.device_id.as_deref(),
        );
        let snapshot = guard.snapshot();
        (res, snapshot)
    };
    match result {
        Ok(device) => {
            on_change(snap.clone());
            let body = json!({
                "serverId": snap.server_id,
                "serverName": snap.server_name,
                "shortName": snap.short_name,
                "deviceId": device.id,
                "token": device.token,
                "transport": "lan",
            });
            let _ = write_json(stream, 200, "OK", &body);
        }
        Err(err) => {
            if err == "code_expired" {
                on_change(snap);
            }
            let _ = write_json(stream, 401, "Unauthorized", &json!({ "error": err }));
        }
    }
}

fn handle_library(stream: &mut TcpStream, req: &HttpRequest, state: &Arc<Mutex<MirrorState>>) {
    let Some(_device_id) = require_auth(stream, req, state) else {
        return;
    };
    let (server_id, server_name, short_name, items) = {
        let guard = state.lock().unwrap();
        (
            guard.server_id.clone(),
            guard.server_name.clone(),
            guard.short_name(),
            guard.scan_catalog(),
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
    let snap = {
        let mut guard = state.lock().unwrap();
        guard.update_device_status(
            &device_id,
            payload.synced_count,
            payload.total_count,
            payload.background.unwrap_or(false),
        );
        guard.snapshot()
    };
    on_change(snap);
    let _ = write_json(stream, 200, "OK", &json!({ "ok": true }));
}

fn handle_unpair(
    stream: &mut TcpStream,
    req: &HttpRequest,
    state: &Arc<Mutex<MirrorState>>,
    on_change: &(dyn Fn(ServerSnapshot) + Send + Sync),
) {
    let Some(device_id) = require_auth(stream, req, state) else {
        return;
    };
    let snap = {
        let mut guard = state.lock().unwrap();
        guard.remove_device(&device_id);
        guard.snapshot()
    };
    on_change(snap);
    let _ = write_json(stream, 200, "OK", &json!({ "ok": true }));
}

fn handle_video_asset(
    stream: &mut TcpStream,
    req: &HttpRequest,
    path: &str,
    state: &Arc<Mutex<MirrorState>>,
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
            let cap_path = {
                let guard = state.lock().unwrap();
                guard.resolve_captions(video_id)
            };
            let Some(p) = cap_path else {
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
            let media = {
                let guard = state.lock().unwrap();
                guard.resolve_media(video_id)
            };
            let Some(m) = media else {
                let _ = write_json(stream, 404, "Not Found", &json!({ "error": "no_media" }));
                return;
            };
            let _ = stream_file_with_range(
                stream,
                &m.path,
                &m.mime_type,
                m.size_bytes,
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
    let auth = req.headers.get("authorization").map(String::as_str)?;
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
    range_header: Option<&str>,
) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    let (status, reason, start, end) = match range_header {
        Some(hdr) => match parse_byte_range(hdr, total) {
            Some((s, e)) => (206, "Partial Content", s, e),
            None => {
                let resp = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                stream.write_all(resp.as_bytes())?;
                return Ok(());
            }
        },
        None => (200, "OK", 0, total.saturating_sub(1)),
    };

    let len = if total == 0 { 0 } else { end - start + 1 };
    let mut head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nAccept-Ranges: bytes\r\nContent-Length: {len}\r\nConnection: close\r\n"
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
        let to_read = (remaining as usize).min(buf.len());
        let n = file.read(&mut buf[..to_read])?;
        if n == 0 {
            break;
        }
        stream.write_all(&buf[..n])?;
        remaining -= n as u64;
    }
    stream.flush()
}

fn read_request(stream: &mut TcpStream) -> Option<HttpRequest> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).ok()? == 0 {
        return None;
    }
    let mut parts = request_line.trim_end().split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut headers = HashMap::new();
    let mut header_bytes = request_line.len();
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).ok()?;
        if n == 0 {
            break;
        }
        header_bytes += n;
        if header_bytes > MAX_HEADER_BYTES {
            return None;
        }
        let trimmed = line.trim_end_matches(&['\r', '\n'][..]);
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_len = headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    if content_len > MAX_BODY_BYTES {
        return None;
    }
    let mut body = vec![0u8; content_len];
    if content_len > 0 {
        reader.read_exact(&mut body).ok()?;
    }

    Some(HttpRequest {
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
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, Range\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(bytes)?;
    stream.flush()
}

fn write_empty(stream: &mut TcpStream, status: u16, reason: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, Range\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(head.as_bytes())?;
    stream.flush()
}
