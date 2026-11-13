use crate::commands::captions::parse_json3_cues;
use crate::types::CaptionTrackInfo;
use crate::youtube::{http_get_text, read_caption_tracks, WATCH_UA};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn get_default_downloads_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(&home).join("Downloads");
        if p.exists() {
            return p;
        }
    }
    PathBuf::from(".")
}

pub fn get_library_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("EAR_LIBRARY_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }

    if let Ok(dir) = std::env::var("EAR_DATA_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir).join("library"));
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        #[cfg(target_os = "macos")]
        {
            let mac_dir = PathBuf::from(&home).join("Library/Application Support/dev.yuler.ear/library");
            return Some(mac_dir);
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(app_data) = std::env::var("APPDATA") {
                return Some(PathBuf::from(app_data).join("dev.yuler.ear").join("library"));
            }
        }

        let xdg_data = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(&home).join(".local/share"));

        let primary = xdg_data.join("dev.yuler.ear").join("library");
        let fallback = xdg_data.join("ear").join("library");
        if primary.exists() || !fallback.exists() {
            return Some(primary);
        }
        return Some(fallback);
    }
    None
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntrySync {
    pub video_id: String,
    pub url: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub site: String,
    pub state: String, // "downloading" | "paused" | "ready" | "error"
    pub captions_path: Option<String>,
    pub video_path: Option<String>,
    pub audio_path: Option<String>,
    pub video_url: Option<String>,
    pub audio_url: Option<String>,
    pub audio_mime_type: Option<String>,
    pub duration_ms: Option<u64>,
    pub quality: Option<String>,
    pub subtitle_label: Option<String>,
    pub subtitle_is_auto: Option<bool>,
    pub size_bytes: Option<u64>,
    pub downloaded_bytes: Option<u64>,
    pub percent: Option<f64>,
    pub speed_bps: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub note: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl LibraryEntrySync {
    pub fn entry_file(library_dir: &Path, video_id: &str) -> PathBuf {
        library_dir.join(format!("{video_id}.json"))
    }

    pub fn load_or_new(
        library_dir: &Path,
        video_id: &str,
        title: &str,
        quality: &str,
        thumbnail_url: Option<String>,
    ) -> Self {
        let path = Self::entry_file(library_dir, video_id);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(entry) = serde_json::from_str::<LibraryEntrySync>(&content) {
                    return entry;
                }
            }
        }
        let now = now_millis();
        Self {
            video_id: video_id.to_string(),
            url: format!("https://www.youtube.com/watch?v={video_id}"),
            title: title.to_string(),
            thumbnail_url: thumbnail_url.or_else(|| {
                Some(format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"))
            }),
            site: "YouTube".to_string(),
            state: "downloading".to_string(),
            captions_path: None,
            video_path: None,
            audio_path: None,
            video_url: None,
            audio_url: None,
            audio_mime_type: None,
            duration_ms: None,
            quality: Some(quality.to_string()),
            subtitle_label: None,
            subtitle_is_auto: None,
            size_bytes: None,
            downloaded_bytes: Some(0),
            percent: Some(0.0),
            speed_bps: Some(0),
            eta_seconds: None,
            note: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn save(&mut self, library_dir: &Path) -> Result<(), String> {
        self.updated_at = now_millis();
        let _ = fs::create_dir_all(library_dir);
        let path = Self::entry_file(library_dir, &self.video_id);
        let tmp = path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize library entry: {e}"))?;
        fs::write(&tmp, content)
            .map_err(|e| format!("Failed to write tmp entry: {e}"))?;
        fs::rename(&tmp, &path)
            .map_err(|e| format!("Failed to commit library entry: {e}"))?;
        Ok(())
    }
}

pub fn append_to_archive(library_dir: &Path, video_id: &str, media_path: Option<&str>, captions_path: Option<&str>) {
    let archive_path = library_dir.join("archive.jsonl");
    let record = json!({
        "k": ["youtube", video_id],
        "p": media_path,
        "captions": captions_path
    });
    let line = format!("{}\n", record);

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&archive_path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn sync_entry_progress(
    library_dir: &Path,
    video_id: &str,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
    speed_bps: u64,
    eta_seconds: Option<u64>,
) {
    let path = LibraryEntrySync::entry_file(library_dir, video_id);
    if let Some(mut entry) = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<LibraryEntrySync>(&c).ok())
    {
        entry.downloaded_bytes = Some(downloaded_bytes);
        if total_bytes > 0 {
            entry.size_bytes = Some(total_bytes);
        }
        entry.percent = Some(percent);
        entry.speed_bps = Some(speed_bps);
        entry.eta_seconds = eta_seconds;
        entry.state = "downloading".to_string();
        let _ = entry.save(library_dir);
    }
}

pub fn sync_entry_paused(library_dir: &Path, video_id: &str, note: &str) {
    let path = LibraryEntrySync::entry_file(library_dir, video_id);
    if let Some(mut entry) = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<LibraryEntrySync>(&c).ok())
    {
        entry.state = "paused".to_string();
        entry.note = Some(note.to_string());
        let _ = entry.save(library_dir);
    }
}

pub fn sync_entry_error(library_dir: &Path, video_id: &str, note: &str) {
    let path = LibraryEntrySync::entry_file(library_dir, video_id);
    if let Some(mut entry) = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<LibraryEntrySync>(&c).ok())
    {
        entry.state = "error".to_string();
        entry.note = Some(note.to_string());
        let _ = entry.save(library_dir);
    }
}

pub fn sync_entry_ready(
    library_dir: &Path,
    video_id: &str,
    final_media_path: &Path,
    captions_path: Option<&str>,
    final_size: u64,
    is_audio: bool,
) {
    let path = LibraryEntrySync::entry_file(library_dir, video_id);
    if let Some(mut entry) = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<LibraryEntrySync>(&c).ok())
    {
        entry.state = "ready".to_string();
        entry.size_bytes = Some(final_size);
        entry.downloaded_bytes = Some(final_size);
        entry.percent = Some(100.0);
        entry.speed_bps = Some(0);
        entry.eta_seconds = Some(0);
        entry.note = None;
        if is_audio {
            entry.audio_path = Some(final_media_path.to_string_lossy().to_string());
        } else {
            entry.video_path = Some(final_media_path.to_string_lossy().to_string());
        }
        if let Some(cp) = captions_path {
            entry.captions_path = Some(cp.to_string());
        }
        let _ = entry.save(library_dir);

        let media_str = final_media_path.to_string_lossy();
        append_to_archive(library_dir, video_id, Some(&media_str), captions_path);
    }
}

pub fn select_best_caption_track(tracks: &[CaptionTrackInfo], title: &str) -> Option<CaptionTrackInfo> {
    if tracks.is_empty() {
        return None;
    }

    // Check if title has Japanese characters
    let is_japanese_title = title.chars().any(|c| {
        ('\u{3040}'..='\u{309F}').contains(&c) || ('\u{30A0}'..='\u{30FF}').contains(&c)
    });

    if is_japanese_title {
        // Prefer Japanese track
        if let Some(t) = tracks.iter().find(|t| t.language_code.starts_with("ja") && t.kind.is_none()) {
            return Some(t.clone());
        }
        if let Some(t) = tracks.iter().find(|t| t.language_code.starts_with("ja")) {
            return Some(t.clone());
        }
    }

    // Prefer English manual track (kind is None or not asr)
    if let Some(t) = tracks.iter().find(|t| t.language_code.starts_with("en") && t.kind.is_none()) {
        return Some(t.clone());
    }

    // Next prefer any English track
    if let Some(t) = tracks.iter().find(|t| t.language_code.starts_with("en")) {
        return Some(t.clone());
    }

    // Fallback to first track
    tracks.first().cloned()
}

pub fn fetch_and_save_captions(
    video_id: &str,
    title: &str,
    library_dir: &Path,
    player: &Value,
) -> Option<PathBuf> {
    let tracks = read_caption_tracks(player);
    let chosen_track = select_best_caption_track(&tracks, title)?;
    let base_url = &chosen_track.base_url;
    let track_url = format!("{base_url}&fmt=json3");

    let raw_json = http_get_text(&track_url, WATCH_UA).ok()?;
    let cues = parse_json3_cues(&raw_json).ok()?;
    if cues.is_empty() {
        return None;
    }

    // Build merged sentences from cues
    let mut sentences = Vec::new();
    let mut current_text = String::new();
    let mut sent_start = 0u64;
    let mut sent_end;
    let mut sent_idx = 0;

    for (i, cue) in cues.iter().enumerate() {
        if current_text.is_empty() {
            sent_start = cue.start_ms;
        } else {
            current_text.push(' ');
        }
        current_text.push_str(&cue.text);
        sent_end = cue.end_ms;

        let trimmed = cue.text.trim();
        let ends_punct = trimmed.ends_with('.') || trimmed.ends_with('?') || trimmed.ends_with('!');
        let too_long = (sent_end - sent_start) >= 6000;
        let is_last = i == cues.len() - 1;

        if ends_punct || too_long || is_last {
            sent_idx += 1;
            sentences.push(json!({
                "id": format!("s_{sent_idx}"),
                "startMs": sent_start.saturating_sub(150),
                "endMs": sent_end + 150,
                "text": current_text.trim()
            }));
            current_text.clear();
        }
    }

    let entry_folder = library_dir.join(video_id);
    let _ = fs::create_dir_all(&entry_folder);
    let cap_file = entry_folder.join("captions.json");

    let payload = json!({
        "videoId": video_id,
        "title": title,
        "track": {
            "name": chosen_track.name,
            "languageCode": chosen_track.language_code,
            "kind": chosen_track.kind,
            "vssId": chosen_track.vss_id
        },
        "cues": cues,
        "sentences": sentences
    });

    if let Ok(formatted) = serde_json::to_string_pretty(&payload) {
        if fs::write(&cap_file, formatted).is_ok() {
            return Some(cap_file);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_best_caption_track_english_manual() {
        let tracks = vec![
            CaptionTrackInfo {
                track_id: "en:asr".to_string(),
                language_code: "en".to_string(),
                name: "English (auto)".to_string(),
                kind: Some("asr".to_string()),
                base_url: "http://auto".to_string(),
                vss_id: Some("a.en".to_string()),
                is_auto: true,
            },
            CaptionTrackInfo {
                track_id: "en:manual".to_string(),
                language_code: "en".to_string(),
                name: "English".to_string(),
                kind: None,
                base_url: "http://manual".to_string(),
                vss_id: Some(".en".to_string()),
                is_auto: false,
            },
        ];
        let chosen = select_best_caption_track(&tracks, "English Video").unwrap();
        assert_eq!(chosen.base_url, "http://manual");
        assert!(chosen.kind.is_none());
    }

    #[test]
    fn test_select_best_caption_track_japanese() {
        let tracks = vec![
            CaptionTrackInfo {
                track_id: "en:manual".to_string(),
                language_code: "en".to_string(),
                name: "English".to_string(),
                kind: None,
                base_url: "http://en".to_string(),
                vss_id: None,
                is_auto: false,
            },
            CaptionTrackInfo {
                track_id: "ja:manual".to_string(),
                language_code: "ja".to_string(),
                name: "Japanese".to_string(),
                kind: None,
                base_url: "http://ja".to_string(),
                vss_id: None,
                is_auto: false,
            },
        ];
        // Japanese title
        let chosen = select_best_caption_track(&tracks, "日本語の練習").unwrap();
        assert_eq!(chosen.base_url, "http://ja");
    }
}

