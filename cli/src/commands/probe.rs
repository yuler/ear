use crate::emit::emit_json;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoDimensions {
    pub width: u32,
    pub height: u32,
}

const MAX_MOOV_BYTES: u64 = 16 * 1024 * 1024;

fn read_be_u32(buf: &[u8], offset: usize) -> Option<u32> {
    let slice: [u8; 4] = buf.get(offset..offset + 4)?.try_into().ok()?;
    Some(u32::from_be_bytes(slice))
}

fn read_be_i32(buf: &[u8], offset: usize) -> Option<i32> {
    let slice: [u8; 4] = buf.get(offset..offset + 4)?.try_into().ok()?;
    Some(i32::from_be_bytes(slice))
}

fn read_be_u64(buf: &[u8], offset: usize) -> Option<u64> {
    let slice: [u8; 8] = buf.get(offset..offset + 8)?.try_into().ok()?;
    Some(u64::from_be_bytes(slice))
}

/// Parse display `(width, height)` from a `tkhd` (TrackHeaderBox) payload,
/// swapping dimensions when the 3x3 transformation matrix rotates by 90°/270°.
fn parse_tkhd_dimensions(payload: &[u8]) -> Option<VideoDimensions> {
    let version = *payload.first()?;
    let matrix_offset = match version {
        0 => 40,
        1 => 52,
        _ => return None,
    };
    let width_offset = matrix_offset + 36;
    let height_offset = width_offset + 4;
    if payload.len() < height_offset + 4 {
        return None;
    }

    let raw_w = read_be_u32(payload, width_offset)? >> 16;
    let raw_h = read_be_u32(payload, height_offset)? >> 16;
    if raw_w == 0 || raw_h == 0 {
        return None;
    }

    let a = read_be_i32(payload, matrix_offset)?;
    let b = read_be_i32(payload, matrix_offset + 4)?;
    let c = read_be_i32(payload, matrix_offset + 12)?;
    let d = read_be_i32(payload, matrix_offset + 16)?;

    let rotated_90_or_270 = a == 0 && d == 0 && b != 0 && c != 0;
    let (width, height) = if rotated_90_or_270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };
    Some(VideoDimensions { width, height })
}

fn iter_child_boxes(data: &[u8], mut f: impl FnMut([u8; 4], &[u8]) -> bool) {
    let mut pos = 0usize;
    while pos + 8 <= data.len() {
        let Some(size32) = read_be_u32(data, pos) else {
            break;
        };
        let box_type: [u8; 4] = [data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]];
        let (box_size, header_len): (usize, usize) = if size32 == 1 {
            let Some(size64) = read_be_u64(data, pos + 8) else {
                break;
            };
            let Ok(sz) = usize::try_from(size64) else {
                break;
            };
            (sz, 16)
        } else if size32 == 0 {
            (data.len() - pos, 8)
        } else {
            (size32 as usize, 8)
        };

        if box_size < header_len || pos + box_size > data.len() {
            break;
        }
        let payload = &data[pos + header_len..pos + box_size];
        if f(box_type, payload) {
            return;
        }
        pos += box_size;
    }
}

/// Extract display dimensions from an MP4 `moov` box payload.
pub fn parse_moov_dimensions(moov_payload: &[u8]) -> Option<VideoDimensions> {
    let mut found = None;
    iter_child_boxes(moov_payload, |box_type, payload| {
        if &box_type != b"trak" {
            return false;
        }
        iter_child_boxes(payload, |inner_type, inner_payload| {
            if &inner_type == b"tkhd" {
                if let Some(dims) = parse_tkhd_dimensions(inner_payload) {
                    found = Some(dims);
                    return true;
                }
            }
            false
        });
        found.is_some()
    });
    found
}

/// Fast pure-Rust MP4/M4V/MOV dimension probe that seeks past `mdat` without reading media bytes.
pub fn probe_mp4_dimensions(path: &Path) -> Option<VideoDimensions> {
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    let mut pos = 0u64;
    let mut header = [0u8; 8];

    while pos + 8 <= file_len {
        file.seek(SeekFrom::Start(pos)).ok()?;
        file.read_exact(&mut header).ok()?;
        let size32 = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let box_type = [header[4], header[5], header[6], header[7]];

        let (box_size, header_len): (u64, u64) = if size32 == 1 {
            let mut ext = [0u8; 8];
            file.read_exact(&mut ext).ok()?;
            (u64::from_be_bytes(ext), 16)
        } else if size32 == 0 {
            (file_len.saturating_sub(pos), 8)
        } else {
            (size32 as u64, 8)
        };

        if box_size < header_len || pos + box_size > file_len {
            break;
        }

        if &box_type == b"moov" {
            let payload_len = box_size - header_len;
            if payload_len > MAX_MOOV_BYTES {
                return None;
            }
            let mut buf = vec![0u8; payload_len as usize];
            file.read_exact(&mut buf).ok()?;
            return parse_moov_dimensions(&buf);
        }

        pos = pos.checked_add(box_size)?;
    }

    None
}

/// Parse `ffprobe -of json` output for video stream width, height, and optional rotation.
pub fn parse_ffprobe_json(stdout: &str) -> Option<VideoDimensions> {
    let val: Value = serde_json::from_str(stdout).ok()?;
    let stream = val.get("streams")?.as_array()?.first()?;
    let raw_w = stream.get("width")?.as_u64()? as u32;
    let raw_h = stream.get("height")?.as_u64()? as u32;
    if raw_w == 0 || raw_h == 0 {
        return None;
    }

    let rotation = stream
        .get("side_data_list")
        .and_then(|list| list.as_array())
        .and_then(|arr| {
            arr.iter()
                .find_map(|item| item.get("rotation").and_then(|r| r.as_i64()))
        })
        .unwrap_or(0);
    let abs_rot = rotation.unsigned_abs() % 360;
    let (width, height) = if abs_rot == 90 || abs_rot == 270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };
    Some(VideoDimensions { width, height })
}

fn probe_with_ffprobe(path: &Path) -> Option<VideoDimensions> {
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:stream_side_data=rotation",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_ffprobe_json(&String::from_utf8_lossy(&out.stdout))
}

/// Probe display `(width, height)` for a local video file: instant MP4 parser first, then ffprobe.
pub fn probe_video_dimensions(path: &Path) -> Option<VideoDimensions> {
    if !path.is_file() {
        return None;
    }
    probe_mp4_dimensions(path).or_else(|| probe_with_ffprobe(path))
}

pub fn run(args: &[String]) -> Result<(), String> {
    let results: Vec<Value> = args
        .iter()
        .filter(|p| !p.trim().is_empty())
        .map(|raw| {
            let dims = probe_video_dimensions(Path::new(raw));
            json!({
                "path": raw,
                "width": dims.map(|d| d.width),
                "height": dims.map(|d| d.height),
            })
        })
        .collect();

    emit_json(json!({
        "v": 1,
        "type": "probe",
        "results": results,
    }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_box(box_type: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let size = (8 + payload.len()) as u32;
        let mut out = Vec::with_capacity(size as usize);
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend_from_slice(payload);
        out
    }

    fn make_tkhd(width: u32, height: u32, matrix: [i32; 9]) -> Vec<u8> {
        let mut payload = vec![0u8; 84];
        for (idx, val) in matrix.iter().enumerate() {
            let offset = 40 + idx * 4;
            payload[offset..offset + 4].copy_from_slice(&val.to_be_bytes());
        }
        payload[76..80].copy_from_slice(&(width << 16).to_be_bytes());
        payload[80..84].copy_from_slice(&(height << 16).to_be_bytes());
        make_box(b"tkhd", &payload)
    }

    fn identity_matrix() -> [i32; 9] {
        [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]
    }

    fn rotate_90_matrix() -> [i32; 9] {
        [0, 0x00010000, 0, -0x00010000, 0, 0, 0, 0, 0x40000000]
    }

    fn make_mp4(tracks: Vec<Vec<u8>>, moov_after_mdat: bool) -> Vec<u8> {
        let ftyp = make_box(b"ftyp", b"isom\0\0\x02\0isom");
        let mdat = make_box(b"mdat", &[0u8; 64]);
        let mut moov_body = Vec::new();
        for tkhd in tracks {
            moov_body.extend_from_slice(&make_box(b"trak", &tkhd));
        }
        let moov = make_box(b"moov", &moov_body);

        let mut file = Vec::new();
        file.extend_from_slice(&ftyp);
        if moov_after_mdat {
            file.extend_from_slice(&mdat);
            file.extend_from_slice(&moov);
        } else {
            file.extend_from_slice(&moov);
            file.extend_from_slice(&mdat);
        }
        file
    }

    #[test]
    fn test_probe_mp4_landscape_portrait_and_rotation() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("ear_probe_test_{stamp}"));
        fs::create_dir_all(&dir).unwrap();

        // Audio track (0x0) followed by landscape video track (1920x1080)
        let landscape_path = dir.join("landscape.mp4");
        fs::write(
            &landscape_path,
            make_mp4(
                vec![
                    make_tkhd(0, 0, identity_matrix()),
                    make_tkhd(1920, 1080, identity_matrix()),
                ],
                false,
            ),
        )
        .unwrap();
        assert_eq!(
            probe_mp4_dimensions(&landscape_path),
            Some(VideoDimensions {
                width: 1920,
                height: 1080
            })
        );

        // Portrait video (720x1280) with moov located after mdat
        let portrait_path = dir.join("portrait.mp4");
        fs::write(
            &portrait_path,
            make_mp4(vec![make_tkhd(720, 1280, identity_matrix())], true),
        )
        .unwrap();
        assert_eq!(
            probe_mp4_dimensions(&portrait_path),
            Some(VideoDimensions {
                width: 720,
                height: 1280
            })
        );

        // Landscape encoded (1920x1080) rotated 90° -> portrait display (1080x1920)
        let rotated_path = dir.join("rotated.mp4");
        fs::write(
            &rotated_path,
            make_mp4(vec![make_tkhd(1920, 1080, rotate_90_matrix())], false),
        )
        .unwrap();
        assert_eq!(
            probe_mp4_dimensions(&rotated_path),
            Some(VideoDimensions {
                width: 1080,
                height: 1920
            })
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_ffprobe_json_handles_rotation() {
        let plain = r#"{"streams":[{"width":1280,"height":720}]}"#;
        assert_eq!(
            parse_ffprobe_json(plain),
            Some(VideoDimensions {
                width: 1280,
                height: 720
            })
        );

        let rotated = r#"{"streams":[{"width":1920,"height":1080,"side_data_list":[{"rotation":-90}]}]}"#;
        assert_eq!(
            parse_ffprobe_json(rotated),
            Some(VideoDimensions {
                width: 1080,
                height: 1920
            })
        );
    }
}
