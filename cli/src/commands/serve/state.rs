// Media catalog scanning, digest caching, and host helpers live in ./catalog.rs.
pub use crate::commands::serve::catalog::{
    default_library_dir, derive_short_name, detect_lan_ip, now_secs, CatalogItem, MediaCatalog,
    ResolvedMedia,
};
use crate::commands::serve::catalog::{default_computer_name, url_encode};
use crate::commands::serve::crypto::{constant_time_eq, generate_hex_secret, generate_pair_code};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const PAIR_TTL_SECS: u64 = 120;
pub const PAIR_MAX_FAILED_ATTEMPTS: u32 = 5;
pub const PAIR_LOCKOUT_SECS: u64 = 300;
pub const DEFAULT_PORT: u16 = 7890;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairError {
    Locked { retry_after_secs: u64 },
    CodeExpired,
    InvalidCode { attempts_remaining: u32 },
    EntropyUnavailable(String),
}

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
    pub pair_locked: bool,
    pub pair_locked_until: Option<u64>,
    pub pair_attempts_remaining: u32,
    pub library_count: usize,
    pub devices: Vec<PublicDevice>,
}

pub struct MirrorState {
    pub server_id: String,
    pub server_name: String,
    pub host: String,
    pub port: u16,
    pub state_file: PathBuf,
    pub code: String,
    pub code_expires_at: u64,
    pub pair_failed_attempts: u32,
    pub pair_locked_until: Option<u64>,
    pub devices: Vec<PairedDevice>,
    catalog: MediaCatalog,
}

impl MirrorState {
    pub fn load_or_init(
        library_dir: PathBuf,
        state_file: PathBuf,
        server_name: Option<String>,
        host: String,
        port: u16,
    ) -> Result<Self, String> {
        let loaded = fs::read_to_string(&state_file)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistedMirrorState>(&raw).ok());

        let default_name = server_name
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(default_computer_name);

        let (server_id, resolved_name, devices) = match loaded {
            Some(p) => (
                if p.server_id.is_empty() {
                    generate_hex_secret(16)?
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
            None => (generate_hex_secret(16)?, default_name, Vec::new()),
        };

        let mut state = Self {
            server_id,
            server_name: resolved_name,
            host,
            port,
            state_file,
            code: String::new(),
            code_expires_at: 0,
            pair_failed_attempts: 0,
            pair_locked_until: None,
            devices,
            catalog: MediaCatalog::new(library_dir),
        };
        state.rotate_code_at(now_secs())?;
        let _ = state.persist();
        Ok(state)
    }

    pub fn short_name(&self) -> String {
        derive_short_name(&self.server_name)
    }

    pub fn is_pair_locked(&self, now: u64) -> bool {
        self.pair_locked_until.is_some_and(|until| now < until)
    }

    pub fn rotate_code(&mut self) -> Result<(), String> {
        self.rotate_code_at(now_secs())
    }

    pub fn rotate_code_at(&mut self, now: u64) -> Result<(), String> {
        self.code = generate_pair_code()?;
        self.code_expires_at = now + PAIR_TTL_SECS;
        Ok(())
    }

    /// Deliberate recovery / reopen invoked by the desktop owner (`refresh_code`).
    /// Clears any active pairing lockout, resets failed attempts, and rotates to a fresh CSPRNG code.
    pub fn reopen_pairing(&mut self) -> Result<(), String> {
        self.reopen_pairing_at(now_secs())
    }

    pub fn reopen_pairing_at(&mut self, now: u64) -> Result<(), String> {
        self.pair_locked_until = None;
        self.pair_failed_attempts = 0;
        self.rotate_code_at(now)
    }

    /// Periodic ticker maintenance:
    /// - While locked, keeps pairing closed until `pair_locked_until` elapses.
    /// - Once lockout elapses, resets attempt budget and rotates a fresh code.
    /// - On normal 2-min code expiry, rotates the code without resetting prior failed attempts.
    pub fn ensure_fresh_code(&mut self) -> Result<bool, String> {
        self.ensure_fresh_code_at(now_secs())
    }

    pub fn ensure_fresh_code_at(&mut self, now: u64) -> Result<bool, String> {
        if let Some(until) = self.pair_locked_until {
            if now < until {
                return Ok(false);
            }
            self.pair_locked_until = None;
            self.pair_failed_attempts = 0;
            self.rotate_code_at(now)?;
            return Ok(true);
        }
        if self.code.is_empty() || now >= self.code_expires_at {
            self.rotate_code_at(now)?;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn pair_url(&self) -> String {
        if self.code.is_empty() || self.is_pair_locked(now_secs()) {
            return String::new();
        }
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
    ) -> Result<PairedDevice, PairError> {
        self.pair_device_at(now_secs(), code, device_name, device_id)
    }

    pub fn pair_device_at(
        &mut self,
        now: u64,
        code: &str,
        device_name: &str,
        device_id: Option<&str>,
    ) -> Result<PairedDevice, PairError> {
        if let Some(until) = self.pair_locked_until {
            if now < until {
                return Err(PairError::Locked {
                    retry_after_secs: until.saturating_sub(now).max(1),
                });
            }
            self.pair_locked_until = None;
            self.pair_failed_attempts = 0;
            self.rotate_code_at(now)
                .map_err(PairError::EntropyUnavailable)?;
        }

        if self.code.is_empty() || now >= self.code_expires_at {
            self.rotate_code_at(now)
                .map_err(PairError::EntropyUnavailable)?;
            return Err(PairError::CodeExpired);
        }

        let submitted = code.trim();
        if !constant_time_eq(submitted.as_bytes(), self.code.as_bytes()) {
            self.pair_failed_attempts = self.pair_failed_attempts.saturating_add(1);
            if self.pair_failed_attempts >= PAIR_MAX_FAILED_ATTEMPTS {
                self.code.clear();
                self.code_expires_at = 0;
                self.pair_locked_until = Some(now + PAIR_LOCKOUT_SECS);
                return Err(PairError::Locked {
                    retry_after_secs: PAIR_LOCKOUT_SECS,
                });
            }
            let remaining = PAIR_MAX_FAILED_ATTEMPTS.saturating_sub(self.pair_failed_attempts);
            return Err(PairError::InvalidCode {
                attempts_remaining: remaining,
            });
        }

        let id = match device_id
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.len() <= 64)
        {
            Some(existing) => existing.to_owned(),
            None => format!(
                "ios-{}",
                generate_hex_secret(8).map_err(PairError::EntropyUnavailable)?
            ),
        };
        let token = generate_hex_secret(32).map_err(PairError::EntropyUnavailable)?;
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
        self.pair_failed_attempts = 0;
        self.pair_locked_until = None;
        // One-use code: invalidate before rotating so the code can never be replayed.
        self.code.clear();
        self.code_expires_at = 0;
        let _ = self.rotate_code_at(now);
        let _ = self.persist();
        Ok(dev)
    }

    pub fn verify_token(&mut self, token: &str) -> Option<String> {
        let now = now_secs();
        let token_bytes = token.as_bytes();
        for d in &mut self.devices {
            if constant_time_eq(d.token.as_bytes(), token_bytes) {
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
        let locked = self.is_pair_locked(now);
        let pair_attempts_remaining = if locked {
            0
        } else {
            PAIR_MAX_FAILED_ATTEMPTS.saturating_sub(self.pair_failed_attempts)
        };
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
            code: if locked { String::new() } else { self.code.clone() },
            code_expires_at: if locked { 0 } else { self.code_expires_at },
            pair_url: if locked { String::new() } else { self.pair_url() },
            pair_locked: locked,
            pair_locked_until: if locked { self.pair_locked_until } else { None },
            pair_attempts_remaining,
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
        self.catalog.scan()
    }

    pub fn resolve_media(&self, video_id: &str) -> Option<ResolvedMedia> {
        self.catalog.resolve_media(video_id)
    }

    pub fn resolve_captions(&self, video_id: &str) -> Option<PathBuf> {
        self.catalog.resolve_captions(video_id)
    }
}
