use crate::types::{CaptionTrackInfo, VideoQualityOption};
use serde_json::{json, Value};
use std::process::Command;

pub const WATCH_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
pub const VISIONOS_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

pub fn extract_video_id(input: &str) -> Option<String> {
    let raw = input.trim();
    if is_valid_id(raw) {
        return Some(raw.to_string());
    }

    for marker in ["v=", "youtu.be/", "/embed/", "/shorts/", "/live/"] {
        if let Some(idx) = raw.find(marker) {
            let start = idx + marker.len();
            let rest = &raw[start..];
            let candidate: String = rest.chars().take(11).collect();
            if is_valid_id(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

pub(crate) fn is_valid_id(s: &str) -> bool {
    s.len() == 11
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn slice_balanced_object(source: &str, start: usize) -> Option<&str> {
    let bytes = source.as_bytes();
    if bytes.get(start).copied() != Some(b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escape = false;
    for (offset, &ch) in bytes[start..].iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
            } else if ch == b'\\' {
                escape = true;
            } else if ch == b'"' {
                in_string = false;
            }
            continue;
        }
        if ch == b'"' {
            in_string = true;
            continue;
        }
        if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(&source[start..=start + offset]);
            }
        }
    }
    None
}

pub(crate) fn extract_player_response(html: &str) -> Option<Value> {
    for marker in ["var ytInitialPlayerResponse", "ytInitialPlayerResponse"] {
        if let Some(idx) = html.find(marker) {
            if let Some(eq_rel) = html[idx..].find('=') {
                let mut i = idx + eq_rel + 1;
                let bytes = html.as_bytes();
                while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                if let Some(json_str) = slice_balanced_object(html, i) {
                    if let Ok(val) = serde_json::from_str::<Value>(json_str) {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

pub(crate) fn extract_visitor_data(html: &str) -> Option<String> {
    let marker = "\"VISITOR_DATA\":\"";
    if let Some(idx) = html.find(marker) {
        let rest = &html[idx + marker.len()..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    let marker_spaced = "\"VISITOR_DATA\": \"";
    if let Some(idx) = html.find(marker_spaced) {
        let rest = &html[idx + marker_spaced.len()..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    None
}

pub(crate) fn http_get_text(url: &str, user_agent: &str) -> Result<String, String> {
    let out = Command::new("curl")
        .args([
            "-sS",
            "-L",
            "--proto",
            "=https",
            "--fail",
            "--max-time",
            "20",
            "-A",
            user_agent,
            "-H",
            "Accept-Language: en-US,en;q=0.9",
            url,
        ])
        .output()
        .map_err(|e| format!("failed to execute curl: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "HTTP GET failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub(crate) fn fetch_visionos_player(video_id: &str, visitor_data: Option<&str>) -> Option<Value> {
    let body = json!({
        "context": {
            "client": {
                "clientName": "VISIONOS",
                "clientVersion": "1.02",
                "deviceMake": "Apple",
                "deviceModel": "RealityDevice17,1",
                "userAgent": VISIONOS_UA,
                "osName": "visionOS",
                "osVersion": "26.5.23O471",
                "hl": "en",
                "timeZone": "UTC",
                "utcOffsetMinutes": 0
            }
        },
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "-L",
        "--fail",
        "--max-time",
        "20",
        "-X",
        "POST",
        "https://www.youtube.com/youtubei/v1/player",
        "-H",
        "Content-Type: application/json",
        "-H",
        &format!("User-Agent: {VISIONOS_UA}"),
        "-H",
        "Origin: https://www.youtube.com",
        "-H",
        "X-YouTube-Client-Name: 101",
        "-H",
        "X-YouTube-Client-Version: 1.02",
    ]);
    if let Some(visitor) = visitor_data {
        let clean: String = visitor.chars().filter(|&c| c != '\r' && c != '\n').collect();
        if !clean.is_empty() {
            cmd.arg("-H").arg(format!("X-Goog-Visitor-Id: {clean}"));
        }
    }
    cmd.arg("-d").arg(body.to_string());

    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let val: Value = serde_json::from_slice(&out.stdout).ok()?;
    let status = val
        .get("playabilityStatus")
        .and_then(|s| s.get("status"))
        .and_then(|s| s.as_str());
    if let Some(st) = status {
        if st != "OK" {
            return None;
        }
    }
    Some(val)
}

pub fn parse_clen_from_url(url: &str) -> Option<u64> {
    for part in url.split(&['?', '&'][..]) {
        if let Some(val) = part.strip_prefix("clen=") {
            if let Ok(n) = val.parse::<u64>() {
                if n > 0 {
                    return Some(n);
                }
            }
        }
    }
    None
}

pub(crate) fn format_content_length(fmt: &Value) -> Option<u64> {
    if let Some(s) = fmt.get("contentLength").and_then(|v| v.as_str()) {
        if let Ok(n) = s.parse::<u64>() {
            if n > 0 {
                return Some(n);
            }
        }
    }
    if let Some(n) = fmt.get("contentLength").and_then(|v| v.as_u64()) {
        if n > 0 {
            return Some(n);
        }
    }
    fmt.get("url")
        .and_then(|u| u.as_str())
        .and_then(parse_clen_from_url)
}

pub fn is_original_or_default_audio(fmt: &Value) -> bool {
    let Some(track) = fmt.get("audioTrack") else {
        return true;
    };
    if track
        .get("audioIsDefault")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return true;
    }
    let is_auto_dubbed = track
        .get("isAutoDubbed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if is_auto_dubbed {
        return false;
    }
    if let Some(name) = track.get("displayName").and_then(|v| v.as_str()) {
        if name.to_lowercase().contains("original") {
            return true;
        }
    }
    false
}

pub fn pick_best_audio(adaptive: &[Value]) -> Option<(String, String, Option<u64>)> {
    let mut candidates: Vec<&Value> = adaptive
        .iter()
        .filter(|f| {
            f.get("url").and_then(|u| u.as_str()).is_some()
                && f.get("mimeType")
                    .and_then(|m| m.as_str())
                    .map(|m| m.starts_with("audio/"))
                    .unwrap_or(false)
        })
        .collect();

    if candidates.is_empty() {
        return None;
    }

    // Prefer original / default audio track over auto-dubbed tracks
    let orig: Vec<&Value> = candidates
        .iter()
        .copied()
        .filter(|f| is_original_or_default_audio(f))
        .collect();
    if !orig.is_empty() {
        candidates = orig;
    }

    // Prefer audio/mp4 (M4A)
    let mp4: Vec<&Value> = candidates
        .iter()
        .copied()
        .filter(|f| {
            f.get("mimeType")
                .and_then(|m| m.as_str())
                .map(|m| m.contains("mp4"))
                .unwrap_or(false)
        })
        .collect();
    if !mp4.is_empty() {
        candidates = mp4;
    }

    candidates.sort_by(|a, b| {
        let ba = a.get("bitrate").and_then(|v| v.as_u64()).unwrap_or(0);
        let bb = b.get("bitrate").and_then(|v| v.as_u64()).unwrap_or(0);
        bb.cmp(&ba)
    });

    let best = candidates[0];
    let url = best.get("url")?.as_str()?.to_string();
    let mime = best.get("mimeType")?.as_str()?.to_string();
    let size = format_content_length(best);
    Some((url, mime, size))
}

pub fn build_quality_options(
    formats: &[Value],
    adaptive: &[Value],
    best_audio: Option<&(String, String, Option<u64>)>,
) -> Vec<VideoQualityOption> {
    let mut out: Vec<VideoQualityOption> = Vec::new();
    let audio_url = best_audio.map(|a| a.0.clone());
    let audio_size = best_audio.and_then(|a| a.2);

    // Collect MP4 H.264 (avc1) video streams by height (1080, 720, 480, 360, 240)
    let target_heights = [1080u32, 720, 480, 360, 240];
    for &th in &target_heights {
        let mut matching: Vec<&Value> = adaptive
            .iter()
            .chain(formats.iter())
            .filter(|f| {
                let Some(url) = f.get("url").and_then(|u| u.as_str()) else {
                    return false;
                };
                if url.is_empty() {
                    return false;
                }
                let mime = f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
                if !mime.starts_with("video/mp4") {
                    return false;
                }
                let h = f.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                h == th
            })
            .collect();

        if matching.is_empty() {
            continue;
        }

        // Prefer avc1 (H.264) for maximum WebKitGTK / macOS / Windows playback compatibility
        matching.sort_by(|a, b| {
            let a_avc = a
                .get("mimeType")
                .and_then(|m| m.as_str())
                .map(|m| m.contains("avc1"))
                .unwrap_or(false);
            let b_avc = b
                .get("mimeType")
                .and_then(|m| m.as_str())
                .map(|m| m.contains("avc1"))
                .unwrap_or(false);
            match b_avc.cmp(&a_avc) {
                std::cmp::Ordering::Equal => {
                    let ba = a.get("bitrate").and_then(|v| v.as_u64()).unwrap_or(0);
                    let bb = b.get("bitrate").and_then(|v| v.as_u64()).unwrap_or(0);
                    bb.cmp(&ba)
                }
                other => other,
            }
        });

        let chosen = matching[0];
        let v_url = chosen
            .get("url")
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();
        let mime = chosen
            .get("mimeType")
            .and_then(|m| m.as_str())
            .unwrap_or("video/mp4")
            .to_string();
        let fps = chosen
            .get("fps")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let v_size = format_content_length(chosen);
        let has_muxed_audio = chosen.get("audioQuality").and_then(|v| v.as_str()).is_some()
            || mime.contains("mp4a");
        let combined_size = match (v_size, audio_size, has_muxed_audio) {
            (Some(vs), _, true) => Some(vs),
            (Some(vs), Some(asize), false) => Some(vs + asize),
            (Some(vs), None, false) => Some(vs),
            _ => None,
        };
        let label = format!("{th}p");
        out.push(VideoQualityOption {
            id: label.clone(),
            label,
            mode: "video".to_string(),
            height: Some(th),
            fps,
            video_url: Some(v_url),
            audio_url: if has_muxed_audio {
                None
            } else {
                audio_url.clone()
            },
            mime_type: mime,
            ext: "mp4".to_string(),
            size_bytes: combined_size,
        });
    }

    if let Some((a_url, a_mime, a_size)) = best_audio {
        let ext = if a_mime.contains("webm") {
            "webm"
        } else {
            "m4a"
        };
        out.push(VideoQualityOption {
            id: "audio".to_string(),
            label: "Audio (M4A)".to_string(),
            mode: "audio".to_string(),
            height: None,
            fps: None,
            video_url: None,
            audio_url: Some(a_url.clone()),
            mime_type: a_mime.clone(),
            ext: ext.to_string(),
            size_bytes: *a_size,
        });
    }

    out
}

pub fn read_caption_tracks(player: &Value) -> Vec<CaptionTrackInfo> {
    let Some(tracks) = player
        .get("captions")
        .and_then(|c| c.get("playerCaptionsTracklistRenderer"))
        .and_then(|r| r.get("captionTracks"))
        .and_then(|t| t.as_array())
    else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for t in tracks {
        let Some(base_url) = t.get("baseUrl").and_then(|u| u.as_str()) else {
            continue;
        };
        let language_code = t
            .get("languageCode")
            .and_then(|l| l.as_str())
            .unwrap_or("")
            .to_string();
        let kind = t
            .get("kind")
            .and_then(|k| k.as_str())
            .filter(|k| !k.is_empty())
            .map(|k| k.to_string());
        let vss_id = t
            .get("vssId")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string());
        let name = t
            .get("name")
            .and_then(|n| {
                n.get("simpleText")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        n.get("runs").and_then(|r| r.as_array()).map(|runs| {
                            runs.iter()
                                .filter_map(|run| run.get("text").and_then(|tx| tx.as_str()))
                                .collect::<Vec<_>>()
                                .join("")
                        })
                    })
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| language_code.clone());

        let is_auto = kind.as_deref() == Some("asr")
            || vss_id
                .as_deref()
                .map(|v| v.starts_with("a."))
                .unwrap_or(false)
            || name.to_lowercase().contains("auto-generated");

        let track_id = vss_id.clone().unwrap_or_else(|| {
            format!(
                "{}:{}",
                language_code,
                if is_auto { "asr" } else { "manual" }
            )
        });

        out.push(CaptionTrackInfo {
            track_id,
            language_code,
            name,
            base_url: base_url.to_string(),
            kind,
            vss_id,
            is_auto,
        });
    }

    // Sort so manual tracks appear first, and English tracks appear at the top of each group
    out.sort_by(|a, b| {
        let a_en = a.language_code == "en" || a.language_code.starts_with("en-");
        let b_en = b.language_code == "en" || b.language_code.starts_with("en-");
        match (a_en, b_en) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.is_auto.cmp(&b.is_auto),
        }
    });

    out
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_video_id() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=Jyh11qBQ66Q"),
            Some("Jyh11qBQ66Q".to_string())
        );
        assert_eq!(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ?t=12"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_video_id("b-6XR0rflJw"),
            Some("b-6XR0rflJw".to_string())
        );
        assert_eq!(extract_video_id("not-a-url"), None);
    }

    #[test]
    fn test_manual_vs_asr_caption_tracks() {
        let player = json!({
            "captions": {
                "playerCaptionsTracklistRenderer": {
                    "captionTracks": [
                        {
                            "baseUrl": "https://example.com/asr-en",
                            "name": { "simpleText": "English (auto-generated)" },
                            "languageCode": "en",
                            "kind": "asr",
                            "vssId": "a.en"
                        },
                        {
                            "baseUrl": "https://example.com/manual-en",
                            "name": { "simpleText": "English" },
                            "languageCode": "en",
                            "vssId": ".en"
                        },
                        {
                            "baseUrl": "https://example.com/manual-ja",
                            "name": { "simpleText": "Japanese" },
                            "languageCode": "ja",
                            "vssId": ".ja"
                        }
                    ]
                }
            }
        });
        let tracks = read_caption_tracks(&player);
        assert_eq!(tracks.len(), 3);
        // Manual English should be sorted first
        assert_eq!(tracks[0].track_id, ".en");
        assert!(!tracks[0].is_auto);
        assert_eq!(tracks[1].track_id, "a.en");
        assert!(tracks[1].is_auto);
        assert_eq!(tracks[2].track_id, ".ja");
        assert!(!tracks[2].is_auto);
    }

    #[test]
    fn test_pick_best_audio_ignores_auto_dubbed() {
        let adaptive = vec![
            json!({
                "itag": 140,
                "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"",
                "bitrate": 135000,
                "contentLength": "26630317",
                "url": "https://example.com/arabic-dub.m4a",
                "audioTrack": {
                    "displayName": "Arabic",
                    "audioIsDefault": false,
                    "isAutoDubbed": true
                }
            }),
            json!({
                "itag": 140,
                "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"",
                "bitrate": 131000,
                "contentLength": "26628815",
                "url": "https://example.com/english-orig.m4a",
                "audioTrack": {
                    "displayName": "English (US) original",
                    "audioIsDefault": true
                }
            }),
        ];
        let picked = pick_best_audio(&adaptive).expect("should pick audio");
        assert_eq!(picked.0, "https://example.com/english-orig.m4a");
        assert_eq!(picked.2, Some(26628815));
    }
}

