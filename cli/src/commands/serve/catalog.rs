use crate::commands::serve::crypto::sha256_file;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub video_id: String,
    pub title: String,
    pub thumbnail_url: String,
    pub url: Option<String>,
    pub site: Option<String>,
    pub duration_ms: Option<u64>,
    pub video_width: Option<u32>,
    pub video_height: Option<u32>,
    pub size_bytes: u64,
    pub content_sha256: String,
    pub quality: Option<String>,
    pub subtitle_label: Option<String>,
    pub subtitle_is_auto: Option<bool>,
    pub media_ext: String,
    pub mime_type: String,
    pub has_captions: bool,
    pub created_at: Option<u64>,
    pub updated_at: u64,
}

#[derive(Debug, Clone)]
pub struct ResolvedMedia {
    pub path: PathBuf,
    pub mime_type: String,
    pub ext: String,
    pub size_bytes: u64,
    pub content_sha256: String,
}

type DigestCacheEntry = (u64, u128, String);

pub struct MediaCatalog {
    pub library_dir: PathBuf,
    digest_cache: Mutex<HashMap<PathBuf, DigestCacheEntry>>,
}

impl MediaCatalog {
    pub fn new(library_dir: PathBuf) -> Self {
        Self {
            library_dir,
            digest_cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn scan(&self) -> Vec<CatalogItem> {
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
            if matches!(state, "downloading" | "pending" | "paused" | "error") {
                continue;
            }
            let Some(media) = self.resolve_media_for_value(&val) else {
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
            let url = val
                .get("url")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);
            let site = val
                .get("site")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);
            let duration_ms = val.get("durationMs").and_then(|v| v.as_u64());
            let video_width = val
                .get("videoWidth")
                .and_then(|v| v.as_u64())
                .and_then(|n| u32::try_from(n).ok())
                .filter(|&n| n > 0);
            let video_height = val
                .get("videoHeight")
                .and_then(|v| v.as_u64())
                .and_then(|n| u32::try_from(n).ok())
                .filter(|&n| n > 0);
            let quality = val
                .get("quality")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);
            let subtitle_label = val
                .get("subtitleLabel")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);
            let subtitle_is_auto = val.get("subtitleIsAuto").and_then(|v| v.as_bool());
            let created_at = val.get("createdAt").and_then(|v| v.as_u64());
            let updated_at = val
                .get("updatedAt")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(|| now_secs() * 1000);
            let has_captions = self.resolve_captions_path(video_id, &val).is_some();

            items.push(CatalogItem {
                video_id: video_id.to_string(),
                title,
                thumbnail_url,
                url,
                site,
                duration_ms,
                video_width,
                video_height,
                size_bytes: media.size_bytes,
                content_sha256: media.content_sha256,
                quality,
                subtitle_label,
                subtitle_is_auto,
                media_ext: media.ext,
                mime_type: media.mime_type,
                has_captions,
                created_at,
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
        self.resolve_media_for_value(&val)
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

    fn cached_file_sha256(&self, path: &Path, len: u64, modified_nanos: u128) -> Option<String> {
        if let Ok(cache) = self.digest_cache.lock() {
            if let Some((c_len, c_mod, digest)) = cache.get(path) {
                if *c_len == len && *c_mod == modified_nanos {
                    return Some(digest.clone());
                }
            }
        }
        let digest = sha256_file(path).ok()?;
        if let Ok(mut cache) = self.digest_cache.lock() {
            cache.insert(path.to_path_buf(), (len, modified_nanos, digest.clone()));
        }
        Some(digest)
    }

    fn resolve_media_for_value(&self, val: &serde_json::Value) -> Option<ResolvedMedia> {
        for key in ["videoPath", "audioPath"] {
            if let Some(p) = val.get(key).and_then(|v| v.as_str()) {
                let pb = PathBuf::from(p);
                if let Ok(meta) = fs::metadata(&pb) {
                    if meta.is_file() && meta.len() > 0 {
                        let modified_nanos = meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_nanos())
                            .unwrap_or(0);
                        let content_sha256 =
                            self.cached_file_sha256(&pb, meta.len(), modified_nanos)?;
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
                            content_sha256,
                        });
                    }
                }
            }
        }
        None
    }
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

pub use super::lan::detect_lan_ip;

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
