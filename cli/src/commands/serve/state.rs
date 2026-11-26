// Media catalog scanning, digest caching, and host helpers live in ./catalog.rs.
pub use crate::commands::serve::catalog::{
    default_library_dir, derive_short_name, detect_lan_ip, now_secs, CatalogItem, MediaCatalog,
    ResolvedMedia,
};
use crate::commands::serve::catalog::{default_computer_name, url_encode};
use crate::commands::serve::crypto::{
    constant_time_eq, generate_hex_secret, generate_pair_code, sha256_bytes,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

pub const PAIR_TTL_SECS: u64 = 120;
pub const PAIR_MAX_FAILED_ATTEMPTS: u32 = 5;
pub use crate::commands::serve::port::MIRROR_PORT_START as DEFAULT_PORT;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairError {
    Locked,
    CodeExpired,
    InvalidCode { attempts_remaining: u32 },
    EntropyUnavailable(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub token_sha256: String,
    /// Legacy plaintext token accepted only during one-time migration on load; never written back.
    #[serde(default, skip_serializing)]
    token: Option<String>,
    pub paired_at: u64,
    pub last_seen_at: u64,
    pub synced_count: usize,
    pub total_count: usize,
    pub background: bool,
}

#[derive(Debug, Clone)]
pub struct PairIssuedDevice {
    pub device: PairedDevice,
    pub token: String,
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
    /// Last port that actually bound. `0` on files written before the window existed.
    #[serde(default)]
    pub port: u16,
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
    pub pair_locked: bool,
    pub devices: Vec<PairedDevice>,
}

impl MirrorState {
    pub fn load_or_init(
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
            Some(p) => {
                let migrated: Vec<PairedDevice> = p
                    .devices
                    .into_iter()
                    .filter_map(|mut dev| {
                        if dev.token_sha256.is_empty() {
                            if let Some(legacy) = dev.token.take().filter(|t| !t.is_empty()) {
                                dev.token_sha256 = sha256_bytes(legacy.as_bytes());
                            }
                        } else {
                            dev.token = None;
                        }
                        if dev.token_sha256.len() == 64 {
                            Some(dev)
                        } else {
                            None
                        }
                    })
                    .collect();
                (
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
                    migrated,
                )
            }
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
            pair_locked: false,
            devices,
        };
        state.rotate_code_at(now_secs())?;
        let _ = state.persist();
        Ok(state)
    }

    pub fn short_name(&self) -> String {
        derive_short_name(&self.server_name)
    }

    pub fn is_pair_locked(&self) -> bool {
        self.pair_locked
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
        self.pair_locked = false;
        self.pair_failed_attempts = 0;
        self.rotate_code_at(now)
    }

    /// Periodic ticker maintenance:
    /// - While locked, keeps pairing closed indefinitely until explicit desktop `reopen_pairing()`.
    /// - On normal 2-min code expiry, rotates the code without resetting prior failed attempts.
    pub fn ensure_fresh_code(&mut self) -> Result<bool, String> {
        self.ensure_fresh_code_at(now_secs())
    }

    pub fn ensure_fresh_code_at(&mut self, now: u64) -> Result<bool, String> {
        if self.pair_locked {
            return Ok(false);
        }
        if self.code.is_empty() || now >= self.code_expires_at {
            self.rotate_code_at(now)?;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn pair_url(&self) -> String {
        if self.code.is_empty() || self.pair_locked {
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
        library_count: usize,
    ) -> Result<PairIssuedDevice, PairError> {
        self.pair_device_at(now_secs(), code, device_name, device_id, library_count)
    }

    pub fn pair_device_at(
        &mut self,
        now: u64,
        code: &str,
        device_name: &str,
        device_id: Option<&str>,
        library_count: usize,
    ) -> Result<PairIssuedDevice, PairError> {
        if self.pair_locked {
            return Err(PairError::Locked);
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
                self.pair_locked = true;
                return Err(PairError::Locked);
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
        let token_sha256 = sha256_bytes(token.as_bytes());
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
            token_sha256,
            token: None,
            paired_at: now,
            last_seen_at: now,
            synced_count: 0,
            total_count: library_count,
            background: false,
        };
        self.devices.insert(0, dev.clone());
        self.pair_failed_attempts = 0;
        self.pair_locked = false;
        // One-use code: invalidate before rotating so the code can never be replayed.
        self.code.clear();
        self.code_expires_at = 0;
        let _ = self.rotate_code_at(now);
        let _ = self.persist();
        Ok(PairIssuedDevice { device: dev, token })
    }

    pub fn verify_token(&mut self, token: &str) -> Option<String> {
        let now = now_secs();
        let digest = sha256_bytes(token.as_bytes());
        let digest_bytes = digest.as_bytes();
        for d in &mut self.devices {
            if constant_time_eq(d.token_sha256.as_bytes(), digest_bytes) {
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

    pub fn snapshot(&self, library_count: usize) -> ServerSnapshot {
        let now = now_secs();
        let locked = self.pair_locked;
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
            pair_locked_until: None,
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
            port: self.port,
        };
        let body = serde_json::to_string_pretty(&persisted)
            .map_err(|e| format!("serialize mirror state: {e}"))?;

        let tmp_name = format!(
            ".{}.tmp.{}",
            self.state_file
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("mirror-state.json"),
            std::process::id()
        );
        let tmp_path = self.state_file.with_file_name(tmp_name);

        let mut opts = OpenOptions::new();
        opts.create(true).write(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut file = opts
            .open(&tmp_path)
            .map_err(|e| format!("open temp mirror state: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = file.set_permissions(fs::Permissions::from_mode(0o600));
        }
        file.write_all(body.as_bytes())
            .map_err(|e| format!("write temp mirror state: {e}"))?;
        let _ = file.sync_all();
        drop(file);

        fs::rename(&tmp_path, &self.state_file).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("rename mirror state: {e}")
        })
    }
}
