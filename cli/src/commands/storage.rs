use crate::commands::open::resolve_path;
use crate::emit::emit_json;
use serde_json::json;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiskSpace {
    pub available_bytes: u64,
    pub total_bytes: u64,
}

fn default_downloads_path() -> String {
    if let Ok(home) = env::var("HOME").or_else(|_| env::var("USERPROFILE")) {
        return Path::new(&home)
            .join("Downloads")
            .to_string_lossy()
            .into_owned();
    }
    ".".to_string()
}

/// Walk up from `path` until an existing directory/file is found so disk space
/// queries still succeed when the configured download folder has not been created yet.
pub fn nearest_existing_ancestor(path: &Path) -> PathBuf {
    let mut cur = path.to_path_buf();
    loop {
        if cur.exists() {
            return cur;
        }
        match cur.parent() {
            Some(parent) if parent != cur => cur = parent.to_path_buf(),
            _ => return PathBuf::from("."),
        }
    }
}

/// Parse POSIX `df -Pk <path>` output into `(available_bytes, total_bytes)`.
///
/// Format: `Filesystem 1024-blocks Used Available Capacity Mounted on`.
/// Locating the percentage column (`NN%`) anchors parsing even when the
/// filesystem name or mount point contains spaces.
pub fn parse_df_pk_output(stdout: &str) -> Option<DiskSpace> {
    let data_line = stdout
        .lines()
        .skip(1)
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    let tokens: Vec<&str> = data_line.split_whitespace().collect();
    for idx in 3..tokens.len() {
        let tok = tokens[idx];
        if tok.ends_with('%') && tok.len() >= 2 && tok[..tok.len() - 1].chars().all(|c| c.is_ascii_digit()) {
            let avail_kb: u64 = tokens[idx - 1].parse().ok()?;
            let _used_kb: u64 = tokens[idx - 2].parse().ok()?;
            let total_kb: u64 = tokens[idx - 3].parse().ok()?;
            if total_kb == 0 {
                return None;
            }
            return Some(DiskSpace {
                available_bytes: avail_kb.saturating_mul(1024),
                total_bytes: total_kb.saturating_mul(1024),
            });
        }
    }
    None
}

/// Parse two whitespace-separated byte integers (`available total`).
pub fn parse_byte_pair(stdout: &str) -> Option<DiskSpace> {
    let nums: Vec<u64> = stdout
        .split_whitespace()
        .filter_map(|t| t.parse::<u64>().ok())
        .collect();
    if nums.len() >= 2 && nums[1] > 0 {
        Some(DiskSpace {
            available_bytes: nums[0],
            total_bytes: nums[1],
        })
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn query_disk_space(path: &Path) -> Result<DiskSpace, String> {
    let existing = nearest_existing_ancestor(path);
    let out = Command::new("df")
        .args(["-Pk", "--"])
        .arg(&existing)
        .output()
        .map_err(|e| format!("Failed to run df: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("df failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_df_pk_output(&stdout)
        .ok_or_else(|| format!("Could not parse df output: {}", stdout.trim()))
}

#[cfg(target_os = "windows")]
fn query_disk_space(path: &Path) -> Result<DiskSpace, String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    let existing = nearest_existing_ancestor(path);
    let query_path = if existing.is_file() {
        existing.parent().unwrap_or(&existing)
    } else {
        &existing
    };
    let wide: Vec<u16> = query_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut avail: u64 = 0;
    let mut total: u64 = 0;
    let mut _total_free: u64 = 0;
    let ok = unsafe {
        GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut _total_free)
    };
    if ok == 0 {
        return Err(format!(
            "Failed to query Windows disk space: {}",
            std::io::Error::last_os_error()
        ));
    }
    if total == 0 {
        return Err("Disk reported zero total capacity".to_string());
    }
    Ok(DiskSpace {
        available_bytes: avail,
        total_bytes: total,
    })
}

pub fn run(args: &[String]) -> Result<(), String> {
    let raw = args
        .first()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(default_downloads_path);
    let resolved = resolve_path(&raw);
    let space = query_disk_space(Path::new(&resolved))?;

    emit_json(json!({
        "v": 1,
        "type": "storage",
        "path": resolved,
        "availableBytes": space.available_bytes,
        "totalBytes": space.total_bytes,
    }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_df_pk_linux_and_macos() {
        let linux = "\
Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/nvme0n1p2   490650680 180123456 285432100      39% /
";
        assert_eq!(
            parse_df_pk_output(linux),
            Some(DiskSpace {
                available_bytes: 285432100 * 1024,
                total_bytes: 490650680 * 1024,
            })
        );

        let macos = "\
Filesystem       1024-blocks       Used Available Capacity  Mounted on
/dev/disk3s1s1     482797652  110000000 220000000    34%    /Volumes/My Mac Disk
";
        assert_eq!(
            parse_df_pk_output(macos),
            Some(DiskSpace {
                available_bytes: 220000000 * 1024,
                total_bytes: 482797652 * 1024,
            })
        );
    }

    #[test]
    fn test_parse_df_pk_with_spaces_in_filesystem_name() {
        let output = "\
Filesystem     1024-blocks   Used Available Capacity Mounted on
my pool/data     1000000   400000    600000      40% /mnt/my drive
";
        assert_eq!(
            parse_df_pk_output(output),
            Some(DiskSpace {
                available_bytes: 600000 * 1024,
                total_bytes: 1000000 * 1024,
            })
        );
    }

    #[test]
    fn test_parse_byte_pair() {
        assert_eq!(
            parse_byte_pair("123456789 987654321\r\n"),
            Some(DiskSpace {
                available_bytes: 123456789,
                total_bytes: 987654321,
            })
        );
        assert_eq!(parse_byte_pair("invalid"), None);
    }

    #[test]
    fn test_nearest_existing_ancestor_falls_back_to_parent() {
        let nonexistent = Path::new("/tmp/ear-nonexistent-subdir-12345/nested");
        let ancestor = nearest_existing_ancestor(nonexistent);
        assert!(ancestor.exists());
    }

    #[test]
    fn test_query_disk_space_for_current_dir() {
        let space = query_disk_space(Path::new(".")).expect("disk space should succeed");
        assert!(space.total_bytes > 0);
        assert!(space.available_bytes <= space.total_bytes);
    }
}
