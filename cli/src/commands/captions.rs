use crate::emit::emit_json;
use crate::types::CaptionCue;
use crate::youtube::{
    extract_player_response, extract_video_id, extract_visitor_data, fetch_visionos_player,
    http_get_text, read_caption_tracks, WATCH_UA,
};
use serde::Deserialize;
use serde_json::json;
use std::io::{self, Write};

#[derive(Deserialize)]
struct Json3Seg {
    utf8: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Json3Event {
    t_start_ms: Option<u64>,
    d_duration_ms: Option<u64>,
    segs: Option<Vec<Json3Seg>>,
}

#[derive(Deserialize)]
struct Json3Root {
    events: Option<Vec<Json3Event>>,
}

pub fn parse_json3_cues(raw_json: &str) -> Result<Vec<CaptionCue>, String> {
    let root: Json3Root = serde_json::from_str(raw_json)
        .map_err(|e| format!("Failed to parse timedtext json3: {e}"))?;

    let events = root.events.unwrap_or_default();
    let mut cues = Vec::new();

    for ev in events {
        let segs = match ev.segs {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };

        let mut combined = String::new();
        for s in segs {
            if let Some(txt) = s.utf8 {
                combined.push_str(&txt);
            }
        }

        let normalized = combined
            .replace('\n', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        if normalized.is_empty() {
            continue;
        }

        let start_ms = ev.t_start_ms.unwrap_or(0);
        let end_ms = start_ms + ev.d_duration_ms.unwrap_or(0);

        cues.push(CaptionCue {
            start_ms,
            end_ms,
            text: normalized,
        });
    }

    Ok(cues)
}

fn format_timestamp(ms: u64, is_srt: bool) -> String {
    let total_sec = ms / 1000;
    let millis = ms % 1000;
    let s = total_sec % 60;
    let m = (total_sec / 60) % 60;
    let h = total_sec / 3600;
    let sep = if is_srt { ',' } else { '.' };
    format!("{h:02}:{m:02}:{s:02}{sep}{millis:03}")
}

pub fn cues_to_srt(cues: &[CaptionCue]) -> String {
    let mut out = String::new();
    for (i, cue) in cues.iter().enumerate() {
        let idx = i + 1;
        let start = format_timestamp(cue.start_ms, true);
        let end = format_timestamp(cue.end_ms, true);
        out.push_str(&format!("{idx}\n{start} --> {end}\n{}\n\n", cue.text));
    }
    out
}

pub fn cues_to_vtt(cues: &[CaptionCue]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (i, cue) in cues.iter().enumerate() {
        let idx = i + 1;
        let start = format_timestamp(cue.start_ms, false);
        let end = format_timestamp(cue.end_ms, false);
        out.push_str(&format!("{idx}\n{start} --> {end}\n{}\n\n", cue.text));
    }
    out
}

pub fn run(args: &[String]) -> Result<(), String> {
    let mut target_input = String::new();
    let mut format = "json".to_string(); // "json" | "srt" | "vtt" | "raw"
    let mut lang: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--format" | "-f" => {
                i += 1;
                if let Some(f) = args.get(i) {
                    format = f.to_lowercase();
                }
            }
            "--lang" | "-l" => {
                i += 1;
                lang = args.get(i).cloned();
            }
            arg if !arg.starts_with('-') && target_input.is_empty() => {
                target_input = arg.to_string();
            }
            _ => {}
        }
        i += 1;
    }

    if target_input.is_empty() {
        return Err("Usage: ear captions <URL|VIDEO_ID|TRACK_URL> [--format json|srt|vtt|raw] [--lang <code>]".to_string());
    }

    let caption_url = if target_input.contains("timedtext") || target_input.contains("api/timedtext") {
        target_input
    } else if let Some(video_id) = extract_video_id(&target_input) {
        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
        let mut visitor_data: Option<String> = None;
        let mut watch_player = None;
        if let Ok(html) = http_get_text(&watch_url, WATCH_UA) {
            visitor_data = extract_visitor_data(&html);
            watch_player = extract_player_response(&html);
        }
        let vision_player = fetch_visionos_player(&video_id, visitor_data.as_deref());
        let mut tracks = vision_player.as_ref().map(read_caption_tracks).unwrap_or_default();
        if tracks.is_empty() {
            if let Some(wp) = watch_player.as_ref() {
                tracks = read_caption_tracks(wp);
            }
        }
        if tracks.is_empty() {
            return Err(format!("No caption tracks found for video {video_id}"));
        }

        let selected = if let Some(ref req_lang) = lang {
            tracks.iter().find(|t| t.language_code.eq_ignore_ascii_case(req_lang))
        } else {
            // Prefer manual English first, then auto English, then any manual, then first available
            tracks.iter().find(|t| (t.language_code == "en" || t.language_code.starts_with("en-")) && !t.is_auto)
                .or_else(|| tracks.iter().find(|t| t.language_code == "en" || t.language_code.starts_with("en-")))
                .or_else(|| tracks.iter().find(|t| !t.is_auto))
                .or_else(|| tracks.first())
        };

        let Some(track) = selected else {
            return Err(format!("No matching caption track found for video {video_id}"));
        };
        track.base_url.clone()
    } else {
        return Err(format!("Not a valid video ID or caption URL: {target_input}"));
    };

    let url = if caption_url.contains("fmt=json3") {
        caption_url
    } else if caption_url.contains('?') {
        format!("{caption_url}&fmt=json3")
    } else {
        format!("{caption_url}?fmt=json3")
    };

    let text = http_get_text(&url, WATCH_UA)?;
    if text.trim().is_empty() {
        return Err("Captions response is empty".to_string());
    }

    match format.as_str() {
        "raw" => {
            print!("{text}");
            let _ = io::stdout().flush();
            Ok(())
        }
        "srt" => {
            let cues = parse_json3_cues(&text)?;
            print!("{}", cues_to_srt(&cues));
            let _ = io::stdout().flush();
            Ok(())
        }
        "vtt" => {
            let cues = parse_json3_cues(&text)?;
            print!("{}", cues_to_vtt(&cues));
            let _ = io::stdout().flush();
            Ok(())
        }
        _ => {
            let cues = parse_json3_cues(&text)?;
            emit_json(json!({
                "v": 1,
                "type": "captions",
                "cues": cues
            }));
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_json3_cues() {
        let sample = r#"{
            "events": [
                {
                    "tStartMs": 1000,
                    "dDurationMs": 2500,
                    "segs": [
                        { "utf8": "Hello " },
                        { "utf8": "world!" }
                    ]
                },
                {
                    "tStartMs": 4000,
                    "dDurationMs": 1500,
                    "segs": [
                        { "utf8": "Next sentence." }
                    ]
                }
            ]
        }"#;
        let cues = parse_json3_cues(sample).expect("valid cues");
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].start_ms, 1000);
        assert_eq!(cues[0].end_ms, 3500);
        assert_eq!(cues[0].text, "Hello world!");

        let srt = cues_to_srt(&cues);
        assert!(srt.contains("00:00:01,000 --> 00:00:03,500"));
        assert!(srt.contains("Hello world!"));

        let vtt = cues_to_vtt(&cues);
        assert!(vtt.starts_with("WEBVTT"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:03.500"));
    }
}

