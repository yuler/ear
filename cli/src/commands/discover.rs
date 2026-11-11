use serde_json::json;

use crate::cache::{
    current_time_secs, is_cache_valid, read_cache, write_cache, DiscoverCachePayload,
};
use crate::discover::{
    bundled_catalog, validate_and_convert_item, DiscoverIndex, DiscoverItem,
    RawDiscoverLanguageFile, DEFAULT_DISCOVER_BASE_URL, SUPPORTED_SCHEMA_VERSION,
};
use crate::emit::emit_json;
use crate::youtube::http_get_text;

pub fn run(args: &[String]) -> Result<(), String> {
    let refresh = args.iter().any(|a| a == "--refresh" || a == "-r");

    // In local repo development, local api/discover/ files always take precedence over cache
    if std::env::var("EAR_DISCOVER_URL").is_err() {
        if let Some((index, items)) = load_local_repo_catalog() {
            emit_json(json!({
                "type": "result",
                "schemaVersion": index.schema_version,
                "updatedAt": index.updated_at,
                "fromCache": false,
                "items": items
            }));
            return Ok(());
        }
    }

    let cached = read_cache();

    if !refresh {
        if let Some(ref cache) = cached {
            if is_cache_valid(cache) {
                emit_json(json!({
                    "type": "result",
                    "schemaVersion": cache.schema_version,
                    "updatedAt": cache.updated_at,
                    "fromCache": true,
                    "items": cache.items
                }));
                return Ok(());
            }
        }
    }

    match fetch_and_aggregate() {
        Ok((index, items)) => {
            let payload = DiscoverCachePayload {
                schema_version: index.schema_version,
                updated_at: index.updated_at.clone(),
                cached_at: current_time_secs(),
                items: items.clone(),
            };
            let _ = write_cache(&payload);

            emit_json(json!({
                "type": "result",
                "schemaVersion": index.schema_version,
                "updatedAt": index.updated_at,
                "fromCache": false,
                "items": items
            }));
            Ok(())
        }
        Err(_fetch_err) => {
            // Fallback to old cache if available
            if let Some(cache) = cached {
                emit_json(json!({
                    "type": "result",
                    "schemaVersion": cache.schema_version,
                    "updatedAt": cache.updated_at,
                    "fromCache": true,
                    "items": cache.items
                }));
                Ok(())
            } else {
                let (index, items) = bundled_catalog();
                emit_json(json!({
                    "type": "result",
                    "schemaVersion": index.schema_version,
                    "updatedAt": index.updated_at,
                    "fromCache": false,
                    "items": items
                }));
                Ok(())
            }
        }
    }
}

fn get_base_url() -> String {
    if let Ok(val) = std::env::var("EAR_DISCOVER_URL") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            if trimmed.ends_with('/') {
                return trimmed.to_string();
            } else {
                return format!("{trimmed}/");
            }
        }
    }
    DEFAULT_DISCOVER_BASE_URL.to_string()
}

fn load_local_repo_catalog() -> Option<(DiscoverIndex, Vec<DiscoverItem>)> {
    let local_paths = ["api/discover", "../api/discover"];
    for dir in &local_paths {
        let index_path = std::path::Path::new(dir).join("index.json");
        if let Ok(index_content) = std::fs::read_to_string(&index_path) {
            if let Ok(index) = serde_json::from_str::<DiscoverIndex>(&index_content) {
                let mut all_items = Vec::new();
                for file in &index.files {
                    let file_path = std::path::Path::new(dir).join(file);
                    if let Ok(content) = std::fs::read_to_string(&file_path) {
                        if let Ok(lang_file) =
                            serde_json::from_str::<RawDiscoverLanguageFile>(&content)
                        {
                            for raw_item in lang_file.items {
                                if let Ok(item) = validate_and_convert_item(raw_item) {
                                    all_items.push(item);
                                }
                            }
                        }
                    }
                }
                if !all_items.is_empty() {
                    return Some((index, all_items));
                }
            }
        }
    }
    None
}

fn fetch_and_aggregate() -> Result<(DiscoverIndex, Vec<DiscoverItem>), String> {
    if std::env::var("EAR_DISCOVER_URL").is_err() {
        if let Some(local) = load_local_repo_catalog() {
            return Ok(local);
        }
    }

    let base_url = get_base_url();
    let index_url = format!("{base_url}index.json");

    let index_text = http_get_text(&index_url, "ear-cli/discover")
        .map_err(|e| format!("Failed to fetch discover index ({index_url}): {e}"))?;

    let index: DiscoverIndex = serde_json::from_str(&index_text)
        .map_err(|e| format!("Failed to parse discover index.json: {e}"))?;

    if index.schema_version > SUPPORTED_SCHEMA_VERSION {
        return Err(format!(
            "Discover schemaVersion {} is newer than supported version {}. Please update ear.",
            index.schema_version, SUPPORTED_SCHEMA_VERSION
        ));
    }

    let mut all_items = Vec::new();

    for file in &index.files {
        let file_url = format!("{base_url}{file}");
        match http_get_text(&file_url, "ear-cli/discover") {
            Ok(content) => match serde_json::from_str::<RawDiscoverLanguageFile>(&content) {
                Ok(lang_file) => {
                    for raw_item in lang_file.items {
                        match validate_and_convert_item(raw_item) {
                            Ok(item) => all_items.push(item),
                            Err(warn_msg) => {
                                emit_json(json!({
                                    "type": "warning",
                                    "message": warn_msg
                                }));
                            }
                        }
                    }
                }
                Err(err) => {
                    emit_json(json!({
                        "type": "warning",
                        "message": format!("Failed to parse language file {file}: {err}")
                    }));
                }
            },
            Err(err) => {
                emit_json(json!({
                    "type": "warning",
                    "message": format!("Failed to fetch language file {file}: {err}")
                }));
            }
        }
    }

    Ok((index, all_items))
}
