use serde::{Deserialize, Serialize};

pub const SUPPORTED_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_DISCOVER_BASE_URL: &str =
    "https://raw.githubusercontent.com/yuler/ear/main/api/discover/";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverItem {
    pub video_id: String,
    pub title: String,
    pub author: Option<String>,
    pub duration_ms: u64,
    pub language: String,
    pub level: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub duration_tier: u32,
    pub thumbnail_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawDiscoverItem {
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub duration_ms: Option<u64>,
    pub language: Option<String>,
    pub level: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverIndex {
    pub schema_version: u32,
    pub updated_at: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawDiscoverLanguageFile {
    pub items: Vec<RawDiscoverItem>,
}

pub fn calculate_duration_tier(duration_ms: u64) -> u32 {
    let minutes = duration_ms / (60 * 1000);
    if minutes < 7 {
        5
    } else if minutes < 15 {
        10
    } else if minutes < 25 {
        20
    } else {
        30
    }
}

pub fn validate_and_convert_item(raw: RawDiscoverItem) -> Result<DiscoverItem, String> {
    let video_id = raw
        .video_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Missing or empty videoId".to_string())?;

    let title = raw
        .title
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing or empty title for item {video_id}"))?;

    let duration_ms = raw
        .duration_ms
        .filter(|&d| d > 0)
        .ok_or_else(|| format!("Invalid durationMs for item {video_id}"))?;

    let language = raw
        .language
        .map(|s| s.trim().to_string())
        .filter(|s| s == "en" || s == "ja")
        .ok_or_else(|| format!("Invalid language for item {video_id} (must be 'en' or 'ja')"))?;

    let level = raw
        .level
        .map(|s| s.trim().to_string())
        .ok_or_else(|| format!("Missing level for item {video_id}"))?;

    let is_valid_level = match language.as_str() {
        "en" => matches!(level.as_str(), "A1" | "A2" | "B1" | "B2" | "C1"),
        "ja" => matches!(level.as_str(), "N5" | "N4" | "N3" | "N2" | "N1"),
        _ => false,
    };

    if !is_valid_level {
        return Err(format!(
            "Invalid level '{level}' for language '{language}' in item {video_id}"
        ));
    }

    let duration_tier = calculate_duration_tier(duration_ms);
    let thumbnail_url = format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg");

    Ok(DiscoverItem {
        video_id,
        title,
        author: raw
            .author
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        duration_ms,
        language,
        level,
        tags: raw.tags.unwrap_or_default(),
        description: raw
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        duration_tier,
        thumbnail_url,
    })
}

pub fn bundled_catalog() -> (DiscoverIndex, Vec<DiscoverItem>) {
    let index_str = include_str!("../../api/discover/index.json");
    let index: DiscoverIndex = serde_json::from_str(index_str).unwrap_or(DiscoverIndex {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        updated_at: "2026-11-11".to_string(),
        files: vec!["en.json".to_string(), "ja.json".to_string()],
    });

    let mut all_items = Vec::new();
    let en_str = include_str!("../../api/discover/en.json");
    if let Ok(en_file) = serde_json::from_str::<RawDiscoverLanguageFile>(en_str) {
        for item in en_file.items {
            if let Ok(conv) = validate_and_convert_item(item) {
                all_items.push(conv);
            }
        }
    }

    let ja_str = include_str!("../../api/discover/ja.json");
    if let Ok(ja_file) = serde_json::from_str::<RawDiscoverLanguageFile>(ja_str) {
        for item in ja_file.items {
            if let Ok(conv) = validate_and_convert_item(item) {
                all_items.push(conv);
            }
        }
    }

    (index, all_items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_duration_tier() {
        assert_eq!(calculate_duration_tier(3 * 60 * 1000), 5);
        assert_eq!(calculate_duration_tier(6 * 60 * 1000 + 59 * 1000), 5);
        assert_eq!(calculate_duration_tier(7 * 60 * 1000), 10);
        assert_eq!(calculate_duration_tier(14 * 60 * 1000), 10);
        assert_eq!(calculate_duration_tier(15 * 60 * 1000), 20);
        assert_eq!(calculate_duration_tier(24 * 60 * 1000), 20);
        assert_eq!(calculate_duration_tier(25 * 60 * 1000), 30);
        assert_eq!(calculate_duration_tier(40 * 60 * 1000), 30);
    }

    #[test]
    fn test_validate_and_convert_item() {
        let valid = RawDiscoverItem {
            video_id: Some("abc12345678".to_string()),
            title: Some("Sample Title".to_string()),
            author: Some("Sample Channel".to_string()),
            duration_ms: Some(300000),
            language: Some("en".to_string()),
            level: Some("A1".to_string()),
            tags: Some(vec!["#Tag".to_string()]),
            description: Some("Short description".to_string()),
        };
        let converted = validate_and_convert_item(valid).expect("Valid conversion");
        assert_eq!(converted.duration_tier, 5);
        assert_eq!(
            converted.thumbnail_url,
            "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg"
        );

        let invalid_level = RawDiscoverItem {
            video_id: Some("abc12345678".to_string()),
            title: Some("Sample".to_string()),
            author: None,
            duration_ms: Some(300000),
            language: Some("en".to_string()),
            level: Some("N1".to_string()), // N1 is invalid for en
            tags: None,
            description: None,
        };
        assert!(validate_and_convert_item(invalid_level).is_err());
    }

    #[test]
    fn test_curated_discover_json_files() {
        let index_str = include_str!("../../api/discover/index.json");
        let index: DiscoverIndex = serde_json::from_str(index_str).expect("Valid index.json");
        assert_eq!(index.schema_version, 1);
        assert!(!index.files.is_empty());

        let en_str = include_str!("../../api/discover/en.json");
        let en_file: RawDiscoverLanguageFile =
            serde_json::from_str(en_str).expect("Valid en.json");
        assert!(!en_file.items.is_empty());
        for item in en_file.items {
            let converted = validate_and_convert_item(item).expect("Valid en item");
            assert_eq!(converted.language, "en");
            assert!(!converted.thumbnail_url.is_empty());
        }

        let ja_str = include_str!("../../api/discover/ja.json");
        let ja_file: RawDiscoverLanguageFile =
            serde_json::from_str(ja_str).expect("Valid ja.json");
        assert!(!ja_file.items.is_empty());
        for item in ja_file.items {
            let converted = validate_and_convert_item(item).expect("Valid ja item");
            assert_eq!(converted.language, "ja");
            assert!(!converted.thumbnail_url.is_empty());
        }
    }
}
