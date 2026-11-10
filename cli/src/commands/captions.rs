use crate::youtube::{http_get_text, WATCH_UA};
use std::io::{self, Write};

pub fn run(base_url: &str) -> Result<(), String> {
    let url = if base_url.contains("fmt=json3") {
        base_url.to_string()
    } else if base_url.contains('?') {
        format!("{base_url}&fmt=json3")
    } else {
        format!("{base_url}?fmt=json3")
    };
    let text = http_get_text(&url, WATCH_UA)?;
    if text.trim().is_empty() {
        return Err("Captions response is empty".to_string());
    }
    print!("{text}");
    let _ = io::stdout().flush();
    Ok(())
}

