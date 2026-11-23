use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PAIR_TTL_SECS: u64 = 120;
pub const DEFAULT_PORT: u16 = 7890;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub token: String,
    pub paired_at: u64,
    pub last_seen_at: u64,
    pub synced_count: usize,
    pub total_count: usize,
    pub background: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicDevice {
    pub id: String,
    pub name: String,
    pub paired_at: u64,
    pub last_seen_at: u64,
    pub synced_count: usize,
    pub total_count: usize,
    pub background: bool,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedMirrorState {
    pub server_id: String,
    pub server_name: String,
    pub devices: Vec<PairedDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub video_id: String,
    pub title: String,
    pub thumbnail_url: String,
    pub duration_ms: Option<u64>,
    pub size_bytes: u64,
    pub quality: Option<String>,
    pub media_ext: String,
    pub mime_type: String,
    pub has_captions: bool,
    pub updated_at: u64,
}

#[derive(Debug, Clone)]
pub struct ResolvedMedia {
    pub path: PathBuf,
    pub mime_type: String,
    pub ext: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSnapshot {
    pub server_id: String,
    pub server_name: String,
    pub short_name: String,
    pub host: String,
    pub port: u16,
    pub code: String,
    pub code_expires_at: u64,
    pub pair_url: String,
    pub library_count: usize,
    pub devices: Vec<PublicDevice>,
}

pub struct MirrorState {
    pub server_id: String,
    pub server_name: String,
    pub host: String,
    pub port: u16,
    pub library_dir: PathBuf,
    pub state_file: PathBuf,
    pub code: String,
    pub code_expires_at: u64,
    pub devices: Vec<PairedDevice>,
    nonce: u64,
}

impl MirrorState {
    pub fn load_or_init(
        library_dir: PathBuf,
        state_file: PathBuf,
        server_name: Option<String>,
        host: String,
        port: u16,
    ) -> Self {
        let loaded = fs::read_to_string(&state_file)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistedMirrorState>(&raw).ok());

        let now = now_secs();
        let default_name = server_name
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(default_computer_name);

        let (server_id, resolved_name, devices) = match loaded {
            Some(p) => (
                if p.server_id.is_empty() {
                    generate_hex(16, now, 1)
                } else {
                    p.server_id
                },
                if p.server_name.trim().is_empty() {
                    default_name
                } else {
                    p.server_name
                },
                p.devices,
            ),
            None => (generate_hex(16, now, 1), default_name, Vec::new()),
        };

        let mut state = Self {
            server_id,
            server_name: resolved_name,
            host,
            port,
            library_dir,
            state_file,
            code: String::new(),
            code_expires_at: 0,
            devices,
            nonce: 2,
        };
        state.rotate_code();
        let _ = state.persist();
        state
    }

    pub fn short_name(&self) -> String {
        derive_short_name(&self.server_name)
    }

    pub fn rotate_code(&mut self) {
        self.nonce = self.nonce.wrapping_add(1);
        self.code = generate_pair_code(now_nanos(), self.nonce);
        self.code_expires_at = now_secs() + PAIR_TTL_SECS;
    }

    pub fn ensure_fresh_code(&mut self) -> bool {
        if now_secs() >= self.code_expires_at {
            self.rotate_code();
            return true;
        }
        false
    }

    pub fn pair_url(&self) -> String {
        format!(
            "ear://pair?transport=lan&host={}&port={}&code={}&name={}",
            url_encode(&self.host),
            self.port,
            self.code,
            url_encode(&self.server_name)
        )
    }

    pub fn pair_device(
        &mut self,
        code: &str,
        device_name: &str,
        device_id: Option<&str>,
    ) -> Result<PairedDevice, &'static str> {
        let now = now_secs();
        if now >= self.code_expires_at {
            self.rotate_code();
            return Err("code_expired");
        }
        if code.trim() != self.code {
            return Err("invalid_code");
        }

        self.nonce = self.nonce.wrapping_add(1);
        let id = device_id
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.len() <= 64)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("ios-{}", generate_hex(8, now_nanos(), self.nonce)));
        self.nonce = self.nonce.wrapping_add(1);
        let token = generate_hex(32, now_nanos(), self.nonce);
        let clean_name = {
            let trimmed = device_name.trim();
            if trimmed.is_empty() {
                "iPhone".to_string()
            } else {
                trimmed.chars().take(64).collect()
            }
        };

        self.devices.retain(|d| d.id != id);
        let dev = PairedDevice {
            id,
            name: clean_name,
            token,
            paired_at: now,
            last_seen_at: now,
            synced_count: 0,
            total_count: self.scan_catalog().len(),
            background: false,
        };
        self.devices.insert(0, dev.clone());
        self.rotate_code();
        let _ = self.persist();
        Ok(dev)
    }

    pub fn verify_token(&mut self, token: &str) -> Option<String> {
        let now = now_secs();
        for d in &mut self.devices {
            if d.token == token {
                d.last_seen_at = now;
                return Some(d.id.clone());
            }
        }
        None
    }

    pub fn update_device_status(
        &mut self,
        device_id: &str,
        synced_count: usize,
        total_count: usize,
        background: bool,
    ) -> bool {
        let now = now_secs();
        for d in &mut self.devices {
            if d.id == device_id {
                d.synced_count = synced_count;
                d.total_count = total_count;
                d.background = background;
                d.last_seen_at = now;
                let _ = self.persist();
                return true;
            }
        }
        false
    }

    pub fn remove_device(&mut self, device_id: &str) -> bool {
        let before = self.devices.len();
        self.devices.retain(|d| d.id != device_id);
        let removed = self.devices.len() != before;
        if removed {
            let _ = self.persist();
        }
        removed
    }

    pub fn snapshot(&self) -> ServerSnapshot {
        let now = now_secs();
        let library_count = self.scan_catalog().len();
        let devices = self
            .devices
            .iter()
            .map(|d| PublicDevice {
                id: d.id.clone(),
                name: d.name.clone(),
                paired_at: d.paired_at,
                last_seen_at: d.last_seen_at,
                synced_count: d.synced_count,
                total_count: if d.total_count > 0 {
                    d.total_count
                } else {
                    library_count
                },
                background: d.background,
                online: now.saturating_sub(d.last_seen_at) <= 60,
            })
            .collect();
        ServerSnapshot {
            server_id: self.server_id.clone(),
            server_name: self.server_name.clone(),
            short_name: self.short_name(),
            host: self.host.clone(),
            port: self.port,
            code: self.code.clone(),
            code_expires_at: self.code_expires_at,
            pair_url: self.pair_url(),
            library_count,
            devices,
        }
    }

    pub fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.state_file.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create state dir: {e}"))?;
        }
        let persisted = PersistedMirrorState {
            server_id: self.server_id.clone(),
            server_name: self.server_name.clone(),
            devices: self.devices.clone(),
        };
        let body = serde_json::to_string_pretty(&persisted)
            .map_err(|e| format!("serialize mirror state: {e}"))?;
        fs::write(&self.state_file, body).map_err(|e| format!("write mirror state: {e}"))
    }

    pub fn scan_catalog(&self) -> Vec<CatalogItem> {
        let Ok(entries) = fs::read_dir(&self.library_dir) else {
            return Vec::new();
        };
        let mut items = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !file_name.ends_with(".json") || file_name == "index.json" {
                continue;
            }
            let Ok(raw) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
                continue;
            };
            let Some(video_id) = val.get("videoId").and_then(|v| v.as_str()) else {
                continue;
            };
            if !is_safe_video_id(video_id) {
                continue;
            }
            let state = val.get("state").and_then(|v| v.as_str()).unwrap_or("");
            if state == "downloading" || state == "pending" || state == "paused" || state == "error"
            {
                continue;
            }
            let Some(media) = resolve_media_for_value(&val) else {
                continue;
            };
            let title = val
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(video_id)
                .to_string();
            let thumbnail_url = val
                .get("thumbnailUrl")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"));
            let duration_ms = val.get("durationMs").and_then(|v| v.as_u64());
            let quality = val
                .get("quality")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned);
            let updated_at = val
                .get("updatedAt")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(|| now_secs() * 1000);
            let has_captions = self.resolve_captions_path(video_id, &val).is_some();

            items.push(CatalogItem {
                video_id: video_id.to_string(),
                title,
                thumbnail_url,
                duration_ms,
                size_bytes: media.size_bytes,
                quality,
                media_ext: media.ext,
                mime_type: media.mime_type,
                has_captions,
                updated_at,
            });
        }
        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        items
    }

    pub fn resolve_media(&self, video_id: &str) -> Option<ResolvedMedia> {
        if !is_safe_video_id(video_id) {
            return None;
        }
        let meta_path = self.library_dir.join(format!("{video_id}.json"));
        let raw = fs::read_to_string(meta_path).ok()?;
        let val = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
        resolve_media_for_value(&val)
    }

    pub fn resolve_captions(&self, video_id: &str) -> Option<PathBuf> {
        if !is_safe_video_id(video_id) {
            return None;
        }
        let meta_path = self.library_dir.join(format!("{video_id}.json"));
        let val = fs::read_to_string(meta_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .unwrap_or(serde_json::Value::Null);
        self.resolve_captions_path(video_id, &val)
    }

    fn resolve_captions_path(&self, video_id: &str, val: &serde_json::Value) -> Option<PathBuf> {
        if let Some(p) = val.get("captionsPath").and_then(|v| v.as_str()) {
            let pb = PathBuf::from(p);
            if pb.is_file() {
                return Some(pb);
            }
        }
        let fallback = self.library_dir.join(video_id).join("captions.json");
        if fallback.is_file() {
            return Some(fallback);
        }
        None
    }
}

fn resolve_media_for_value(val: &serde_json::Value) -> Option<ResolvedMedia> {
    for key in ["videoPath", "audioPath"] {
        if let Some(p) = val.get(key).and_then(|v| v.as_str()) {
            let pb = PathBuf::from(p);
            if let Ok(meta) = fs::metadata(&pb) {
                if meta.is_file() && meta.len() > 0 {
                    let ext = pb
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or(if key == "videoPath" { "mp4" } else { "m4a" })
                        .to_ascii_lowercase();
                    let mime_type = mime_for_ext(&ext).to_string();
                    return Some(ResolvedMedia {
                        path: pb,
                        mime_type,
                        ext,
                        size_bytes: meta.len(),
                    });
                }
            }
        }
    }
    None
}

pub fn is_safe_video_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id != "index"
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "m4a" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "opus" | "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

pub fn detect_lan_ip() -> String {
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip();
                if !ip.is_loopback() && !ip.is_unspecified() {
                    return ip.to_string();
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

pub fn default_computer_name() -> String {
    for key in ["EAR_COMPUTER_NAME", "COMPUTERNAME", "HOSTNAME"] {
        if let Ok(val) = std::env::var(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    if let Ok(raw) = fs::read_to_string("/etc/hostname") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "Ear Desktop".to_string()
}

pub fn derive_short_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "Desktop".to_string();
    }
    trimmed
        .split_whitespace()
        .next()
        .unwrap_or(trimmed)
        .chars()
        .take(12)
        .collect()
}

pub fn default_library_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("EAR_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir).join("library");
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    #[cfg(target_os = "macos")]
    {
        Path::new(&home)
            .join("Library")
            .join("Application Support")
            .join("dev.yuler.ear")
            .join("library")
    }
    #[cfg(not(target_os = "macos"))]
    {
        Path::new(&home)
            .join(".local")
            .join("share")
            .join("dev.yuler.ear")
            .join("library")
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn now_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

fn generate_pair_code(seed: u64, nonce: u64) -> String {
    let mut h = DefaultHasher::new();
    seed.hash(&mut h);
    nonce.hash(&mut h);
    std::process::id().hash(&mut h);
    let n = 1000 + (h.finish() % 9000);
    format!("{n:04}")
}

fn generate_hex(bytes: usize, seed: u64, nonce: u64) -> String {
    let mut out = String::with_capacity(bytes * 2);
    let mut state = seed ^ nonce.rotate_left(17) ^ (std::process::id() as u64);
    for i in 0..bytes {
        let mut h = DefaultHasher::new();
        state.hash(&mut h);
        (i as u64).hash(&mut h);
        state = h.finish();
        out.push_str(&format!("{:02x}", (state & 0xff) as u8));
    }
    out
}

pub fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
