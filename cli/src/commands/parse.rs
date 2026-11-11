use crate::emit::emit_json;
use crate::types::ParsedVideoPayload;
use crate::youtube::{
    build_quality_options, extract_video_id, extract_visitor_data, fetch_visionos_player,
    http_get_text, pick_best_audio, read_caption_tracks, extract_player_response, WATCH_UA,
};
use serde_json::{json, Value};

pub fn run(input: &str) -> Result<(), String> {
    let video_id =
        extract_video_id(input).ok_or_else(|| "Not a valid YouTube URL or video ID".to_string())?;

    emit_json(json!({
        "v": 1,
        "type": "progress",
        "stage": "connecting",
        "progress": 18,
        "message": format!("Connecting to YouTube ({video_id})...")
    }));

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
    let mut visitor_data: Option<String> = None;
    let mut watch_player: Option<Value> = None;

    if let Ok(html) = http_get_text(&watch_url, WATCH_UA) {
        visitor_data = extract_visitor_data(&html);
        watch_player = extract_player_response(&html);
    }

    emit_json(json!({
        "v": 1,
        "type": "progress",
        "stage": "player",
        "progress": 52,
        "message": "Extracting video resolutions & audio streams..."
    }));

    let vision_player = fetch_visionos_player(&video_id, visitor_data.as_deref());
    let _player = vision_player
        .as_ref()
        .or(watch_player.as_ref())
        .ok_or_else(|| "Failed to retrieve YouTube player response".to_string())?;

    emit_json(json!({
        "v": 1,
        "type": "progress",
        "stage": "tracks",
        "progress": 84,
        "message": "Inspecting Manual & CC subtitle tracks..."
    }));

    let details = vision_player
        .as_ref()
        .and_then(|p| p.get("videoDetails"))
        .or_else(|| watch_player.as_ref().and_then(|p| p.get("videoDetails")));

    let title = details
        .and_then(|d| d.get("title"))
        .and_then(|t| t.as_str())
        .unwrap_or(&video_id)
        .to_string();
    let author = details
        .and_then(|d| d.get("author"))
        .and_then(|a| a.as_str())
        .map(|a| a.to_string());
    let duration_ms = details
        .and_then(|d| d.get("lengthSeconds"))
        .and_then(|l| l.as_str())
        .and_then(|l| l.parse::<u64>().ok())
        .map(|sec| sec * 1000);

    let streaming = vision_player
        .as_ref()
        .and_then(|p| p.get("streamingData"))
        .or_else(|| watch_player.as_ref().and_then(|p| p.get("streamingData")));

    let formats = streaming
        .and_then(|s| s.get("formats"))
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let adaptive = streaming
        .and_then(|s| s.get("adaptiveFormats"))
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();

    let best_audio = pick_best_audio(&adaptive);
    let qualities = build_quality_options(&formats, &adaptive, best_audio.as_ref());

    // Default video stream: prefer 720p, else first video quality
    let default_video = qualities
        .iter()
        .find(|q| q.id == "720p")
        .or_else(|| qualities.iter().find(|q| q.mode == "video"));

    let mut caption_tracks = vision_player
        .as_ref()
        .map(read_caption_tracks)
        .unwrap_or_default();
    if caption_tracks.is_empty() {
        if let Some(wp) = watch_player.as_ref() {
            caption_tracks = read_caption_tracks(wp);
        }
    }

    let payload = ParsedVideoPayload {
        video_id: video_id.clone(),
        title,
        author,
        duration_ms,
        thumbnail_url: format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
        audio_url: best_audio.as_ref().map(|a| a.0.clone()),
        audio_mime_type: best_audio.as_ref().map(|a| a.1.clone()),
        video_url: default_video.and_then(|q| q.video_url.clone()),
        video_mime_type: default_video.map(|q| q.mime_type.clone()),
        qualities,
        caption_tracks,
    };

    emit_json(json!({
        "v": 1,
        "type": "result",
        "progress": 100,
        "video": payload
    }));
    Ok(())
}

