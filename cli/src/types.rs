use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoQualityOption {
    pub id: String,
    pub label: String,
    pub mode: String, // "video" | "audio"
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub video_url: Option<String>,
    pub audio_url: Option<String>,
    pub mime_type: String,
    pub ext: String,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionTrackInfo {
    pub track_id: String,
    pub language_code: String,
    pub name: String,
    pub base_url: String,
    pub kind: Option<String>,
    pub vss_id: Option<String>,
    pub is_auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedVideoPayload {
    pub video_id: String,
    pub title: String,
    pub author: Option<String>,
    pub duration_ms: Option<u64>,
    pub thumbnail_url: String,
    pub audio_url: Option<String>,
    pub audio_mime_type: Option<String>,
    pub video_url: Option<String>,
    pub video_mime_type: Option<String>,
    pub qualities: Vec<VideoQualityOption>,
    pub caption_tracks: Vec<CaptionTrackInfo>,
}
