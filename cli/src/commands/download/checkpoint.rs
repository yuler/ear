use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_CHUNK_SIZE: u64 = 4 * 1024 * 1024; // 4 MiB

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PartCheckpoint {
    pub version: u32,
    pub video_id: String,
    pub stream_type: String,
    pub total_size: u64,
    pub chunk_size: u64,
    pub total_chunks: usize,
    pub completed_chunks: Vec<usize>,
    pub updated_at: u64,
}

impl PartCheckpoint {
    pub fn new(
        video_id: &str,
        stream_type: &str,
        total_size: u64,
        chunk_size: u64,
    ) -> Self {
        let chunk_size = if chunk_size == 0 {
            DEFAULT_CHUNK_SIZE
        } else {
            chunk_size
        };
        let total_chunks = if total_size == 0 {
            0
        } else {
            ((total_size + chunk_size - 1) / chunk_size) as usize
        };
        Self {
            version: 1,
            video_id: video_id.to_string(),
            stream_type: stream_type.to_string(),
            total_size,
            chunk_size,
            total_chunks,
            completed_chunks: Vec::new(),
            updated_at: now_millis(),
        }
    }

    pub fn meta_path_for(part_path: &Path) -> PathBuf {
        let mut name = part_path.file_name().unwrap_or_default().to_os_string();
        name.push(".meta");
        part_path.with_file_name(name)
    }

    pub fn load_or_init(
        part_path: &Path,
        video_id: &str,
        stream_type: &str,
        total_size: u64,
        chunk_size: u64,
    ) -> (Self, bool) {
        let meta_path = Self::meta_path_for(part_path);
        if part_path.exists() && meta_path.exists() {
            if let Ok(content) = fs::read_to_string(&meta_path) {
                if let Ok(ckpt) = serde_json::from_str::<PartCheckpoint>(&content) {
                    if ckpt.total_size == total_size
                        && ckpt.chunk_size == chunk_size
                        && ckpt.total_chunks > 0
                    {
                        return (ckpt, true);
                    }
                }
            }
        }
        (
            Self::new(video_id, stream_type, total_size, chunk_size),
            false,
        )
    }

    pub fn save(&mut self, part_path: &Path) -> Result<(), String> {
        self.updated_at = now_millis();
        let meta_path = Self::meta_path_for(part_path);
        let tmp_path = meta_path.with_extension("meta.tmp");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize checkpoint: {e}"))?;
        fs::write(&tmp_path, json)
            .map_err(|e| format!("Failed to write tmp checkpoint: {e}"))?;
        fs::rename(&tmp_path, &meta_path)
            .map_err(|e| format!("Failed to commit checkpoint: {e}"))?;
        Ok(())
    }

    pub fn cleanup(part_path: &Path) {
        let meta_path = Self::meta_path_for(part_path);
        let _ = fs::remove_file(&meta_path);
        let tmp_path = meta_path.with_extension("meta.tmp");
        let _ = fs::remove_file(&tmp_path);
    }

    pub fn mark_completed(&mut self, chunk_idx: usize) {
        if !self.completed_chunks.contains(&chunk_idx) {
            self.completed_chunks.push(chunk_idx);
        }
    }

    pub fn downloaded_bytes(&self) -> u64 {
        let mut seen = HashSet::new();
        let mut total = 0u64;
        let chunk_size = self.chunk_size;
        for &idx in &self.completed_chunks {
            if idx >= self.total_chunks || !seen.insert(idx) {
                continue;
            }
            if idx == self.total_chunks - 1 {
                let rem = self.total_size % chunk_size;
                total += if rem == 0 { chunk_size } else { rem };
            } else {
                total += chunk_size;
            }
        }
        total
    }

    pub fn missing_chunks(&self) -> Vec<(usize, u64, u64)> {
        let completed: HashSet<usize> = self.completed_chunks.iter().copied().collect();
        let mut out = Vec::new();
        let chunk_size = self.chunk_size;
        for idx in 0..self.total_chunks {
            if !completed.contains(&idx) {
                let start = idx as u64 * chunk_size;
                let end = (start + chunk_size - 1).min(self.total_size - 1);
                out.push((idx, start, end));
            }
        }
        out
    }

    pub fn is_complete(&self) -> bool {
        if self.total_chunks == 0 {
            return false;
        }
        let valid_unique: HashSet<usize> = self
            .completed_chunks
            .iter()
            .copied()
            .filter(|&idx| idx < self.total_chunks)
            .collect();
        valid_unique.len() == self.total_chunks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkpoint_chunk_division() {
        // 10 MiB total with 4 MiB chunk size -> 3 chunks
        let total_size = 10 * 1024 * 1024;
        let ckpt = PartCheckpoint::new("test_vid", "video", total_size, DEFAULT_CHUNK_SIZE);
        assert_eq!(ckpt.total_chunks, 3);

        let missing = ckpt.missing_chunks();
        assert_eq!(missing.len(), 3);
        assert_eq!(missing[0], (0, 0, 4 * 1024 * 1024 - 1));
        assert_eq!(missing[1], (1, 4 * 1024 * 1024, 8 * 1024 * 1024 - 1));
        assert_eq!(missing[2], (2, 8 * 1024 * 1024, 10 * 1024 * 1024 - 1));
    }

    #[test]
    fn test_checkpoint_downloaded_bytes() {
        let total_size = 10 * 1024 * 1024;
        let mut ckpt = PartCheckpoint::new("test_vid", "video", total_size, DEFAULT_CHUNK_SIZE);
        assert_eq!(ckpt.downloaded_bytes(), 0);

        ckpt.completed_chunks.push(0);
        assert_eq!(ckpt.downloaded_bytes(), 4 * 1024 * 1024);

        // Add last chunk (2 MiB remainder)
        ckpt.completed_chunks.push(2);
        assert_eq!(ckpt.downloaded_bytes(), 6 * 1024 * 1024);

        ckpt.completed_chunks.push(1);
        assert_eq!(ckpt.downloaded_bytes(), total_size);
        assert!(ckpt.is_complete());
    }

    #[test]
    fn test_checkpoint_deduplicated_completion() {
        let total_size = 10 * 1024 * 1024;
        let mut ckpt = PartCheckpoint::new("test_vid", "video", total_size, DEFAULT_CHUNK_SIZE);
        assert!(!ckpt.is_complete());

        ckpt.mark_completed(0);
        ckpt.mark_completed(0);
        assert_eq!(ckpt.completed_chunks, vec![0]);

        // Even if duplicate or out-of-range entries are present directly,
        // downloaded_bytes and is_complete must deduplicate valid indices.
        ckpt.completed_chunks.push(0);
        ckpt.completed_chunks.push(99);
        assert_eq!(ckpt.downloaded_bytes(), 4 * 1024 * 1024);
        assert!(!ckpt.is_complete());

        ckpt.mark_completed(1);
        assert!(!ckpt.is_complete());
        ckpt.mark_completed(2);
        assert_eq!(ckpt.downloaded_bytes(), total_size);
        assert!(ckpt.is_complete());
    }
}
