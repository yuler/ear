use crate::youtube::{
    build_quality_options, extract_player_response, extract_visitor_data, fetch_visionos_player,
    http_get_text, pick_best_audio, read_caption_tracks, WATCH_UA,
};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct ResolvedStreams {
    pub video_title: String,
    pub video_url: Option<String>,
    pub audio_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub player_json: Option<serde_json::Value>,
}

pub fn streaming_has_formats(streaming: &serde_json::Value) -> bool {
    let f_len = streaming
        .get("formats")
        .and_then(|f| f.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let a_len = streaming
        .get("adaptiveFormats")
        .and_then(|f| f.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    f_len > 0 || a_len > 0
}

pub fn player_has_formats(player: &serde_json::Value) -> bool {
    player
        .get("streamingData")
        .map(streaming_has_formats)
        .unwrap_or(false)
}

pub fn resolve_streams(video_id: &str, requested_quality: &str) -> ResolvedStreams {
    let mut video_title = video_id.to_string();
    let mut video_url = None;
    let mut audio_url = None;
    let mut thumbnail_url = None;
    let mut player_json = None;

    if !video_id.is_empty() {
        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
        let watch_html = http_get_text(&watch_url, WATCH_UA).ok();
        let visitor = watch_html.as_deref().and_then(extract_visitor_data);
        let vision_player = fetch_visionos_player(video_id, visitor.as_deref());
        let watch_player = watch_html.as_deref().and_then(extract_player_response);

        let details = vision_player
            .as_ref()
            .and_then(|p| p.get("videoDetails"))
            .or_else(|| watch_player.as_ref().and_then(|p| p.get("videoDetails")));
        if let Some(t) = details.and_then(|d| d.get("title")).and_then(|t| t.as_str()) {
            video_title = t.to_string();
        }

        let streaming_player = if vision_player.as_ref().map(player_has_formats).unwrap_or(false) {
            vision_player.as_ref()
        } else if watch_player.as_ref().map(player_has_formats).unwrap_or(false) {
            watch_player.as_ref()
        } else {
            vision_player.as_ref().or(watch_player.as_ref())
        };

        if let Some(player) = streaming_player {
            let streaming = player.get("streamingData");
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

            if let Some(q) = qualities
                .iter()
                .find(|q| q.id == requested_quality)
                .or_else(|| qualities.first())
            {
                video_url = q.video_url.clone();
                audio_url = q.audio_url.clone();
            }
        }
        thumbnail_url = Some(format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"));

        let has_captions = |p: &serde_json::Value| -> bool { !read_caption_tracks(p).is_empty() };
        player_json = if vision_player.as_ref().map(&has_captions).unwrap_or(false) {
            vision_player
        } else if watch_player.as_ref().map(&has_captions).unwrap_or(false) {
            watch_player
        } else {
            vision_player.or(watch_player)
        };
    }

    ResolvedStreams {
        video_title,
        video_url,
        audio_url,
        thumbnail_url,
        player_json,
    }
}

pub fn refresh_stream_url(
    video_id: &str,
    requested_quality: &str,
    is_video: bool,
) -> Option<String> {
    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
    let watch_html = http_get_text(&watch_url, WATCH_UA).ok();
    let visitor = watch_html.as_deref().and_then(extract_visitor_data);
    let vision_player = fetch_visionos_player(video_id, visitor.as_deref());
    let watch_player = watch_html.as_deref().and_then(extract_player_response);

    let streaming = vision_player
        .as_ref()
        .and_then(|p| p.get("streamingData"))
        .filter(|s| streaming_has_formats(s))
        .or_else(|| watch_player.as_ref().and_then(|p| p.get("streamingData")))?;

    let formats = streaming
        .get("formats")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let adaptive = streaming
        .get("adaptiveFormats")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let best_audio = pick_best_audio(&adaptive);
    let qualities = build_quality_options(&formats, &adaptive, best_audio.as_ref());
    let target_q = qualities
        .iter()
        .find(|q| q.id == requested_quality)
        .or_else(|| qualities.first())?;
    if is_video {
        target_q.video_url.clone()
    } else {
        target_q.audio_url.clone()
    }
}

pub fn fallback_yt_dlp(video_id: &str, quality: &str, output_path: &Path) -> Result<u64, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let format_selector = match quality {
        "audio" => "bestaudio[ext=m4a]/bestaudio".to_string(),
        q if q.ends_with('p') => {
            let height = q.trim_end_matches('p');
            format!(
                "bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best"
            )
        }
        _ => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"
            .to_string(),
    };

    let mut child = Command::new("yt-dlp")
        .args([
            "--newline",
            "--progress",
            "--no-playlist",
            "--no-warnings",
            "-f",
            &format_selector,
            "--merge-output-format",
            if quality == "audio" { "m4a" } else { "mp4" },
            "-o",
            &output_path.to_string_lossy(),
            &url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("yt-dlp fallback failed to start: {e}"))?;

    let st = child.wait().map_err(|e| e.to_string())?;
    if !st.success() || !output_path.exists() {
        return Err("yt-dlp failed to download media".to_string());
    }
    let meta = fs::metadata(output_path).map_err(|e| e.to_string())?;
    Ok(meta.len())
}
