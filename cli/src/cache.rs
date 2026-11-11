use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::discover::DiscoverItem;

pub const CACHE_TTL_SECS: u64 = 24 * 60 * 60; // 24 hours

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverCachePayload {
    pub schema_version: u32,
    pub updated_at: String,
    pub cached_at: u64,
    pub items: Vec<DiscoverItem>,
}

pub fn get_cache_dir() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("ear").join("discover");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".cache").join("ear").join("discover");
    }
    PathBuf::from(".cache").join("ear").join("discover")
}

pub fn get_cache_file_path() -> PathBuf {
    get_cache_dir().join("cache.json")
}

pub fn current_time_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn read_cache() -> Option<DiscoverCachePayload> {
    let path = get_cache_file_path();
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn is_cache_valid(cache: &DiscoverCachePayload) -> bool {
    let now = current_time_secs();
    now >= cache.cached_at && (now - cache.cached_at) < CACHE_TTL_SECS
}

pub fn write_cache(payload: &DiscoverCachePayload) -> Result<(), String> {
    let dir = get_cache_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create cache dir: {e}"))?;
    let path = dir.join("cache.json");
    let json = serde_json::to_string_pretty(payload)
        .map_err(|e| format!("Failed to serialize cache: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Failed to write cache file: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_validity() {
        let now = current_time_secs();
        let fresh = DiscoverCachePayload {
            schema_version: 1,
            updated_at: "2026-11-11".to_string(),
            cached_at: now - 100,
            items: Vec::new(),
        };
        assert!(is_cache_valid(&fresh));

        let expired = DiscoverCachePayload {
            schema_version: 1,
            updated_at: "2026-11-11".to_string(),
            cached_at: now - (CACHE_TTL_SECS + 10),
            items: Vec::new(),
        };
        assert!(!is_cache_valid(&expired));
    }
}
