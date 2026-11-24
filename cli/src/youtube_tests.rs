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

#[test]
fn test_build_quality_options_handles_portrait_videos() {
    let adaptive = vec![
        json!({
            "itag": 137,
            "width": 1080,
            "height": 1920,
            "qualityLabel": "1080p",
            "mimeType": "video/mp4; codecs=\"avc1.640028\"",
            "bitrate": 2400000,
            "contentLength": "30000000",
            "url": "https://example.com/1080-avc1.mp4"
        }),
        json!({
            "itag": 136,
            "width": 720,
            "height": 1280,
            "qualityLabel": "720p",
            "mimeType": "video/mp4; codecs=\"avc1.4D401F\"",
            "bitrate": 1200000,
            "contentLength": "15000000",
            "url": "https://example.com/720-avc1.mp4"
        }),
        json!({
            "itag": 788,
            "width": 608,
            "height": 1080,
            "qualityLabel": "480p",
            "mimeType": "video/mp4; codecs=\"av01.0.04M.08\"",
            "bitrate": 700000,
            "contentLength": "9000000",
            "url": "https://example.com/608x1080-av01.mp4"
        }),
        json!({
            "itag": 135,
            "width": 480,
            "height": 854,
            "qualityLabel": "480p",
            "mimeType": "video/mp4; codecs=\"avc1.4D401F\"",
            "bitrate": 650000,
            "contentLength": "8000000",
            "url": "https://example.com/480-avc1.mp4"
        }),
        json!({
            "itag": 134,
            "width": 360,
            "height": 640,
            "qualityLabel": "360p",
            "mimeType": "video/mp4; codecs=\"avc1.4D401E\"",
            "bitrate": 400000,
            "contentLength": "5000000",
            "url": "https://example.com/360-avc1.mp4"
        }),
    ];
    let best_audio = (
        "https://example.com/audio.m4a".to_string(),
        "audio/mp4; codecs=\"mp4a.40.2\"".to_string(),
        Some(1_800_000u64),
    );

    let qualities = build_quality_options(&[], &adaptive, Some(&best_audio));
    let ids: Vec<&str> = qualities.iter().map(|q| q.id.as_str()).collect();
    assert_eq!(ids, vec!["1080p", "720p", "480p", "360p", "audio"]);
    assert_eq!(
        qualities[0].video_url.as_deref(),
        Some("https://example.com/1080-avc1.mp4")
    );
    assert_eq!(
        qualities[2].video_url.as_deref(),
        Some("https://example.com/480-avc1.mp4")
    );

    // Fallback without qualityLabel uses min(width, height)
    let no_label_portrait = json!({ "width": 720, "height": 1280 });
    assert_eq!(format_quality_tier(&no_label_portrait), Some(720));
    let no_label_landscape = json!({ "width": 1920, "height": 1080 });
    assert_eq!(format_quality_tier(&no_label_landscape), Some(1080));
    let label_60fps = json!({ "width": 1080, "height": 1920, "qualityLabel": "1080p60" });
    assert_eq!(format_quality_tier(&label_60fps), Some(1080));
}
