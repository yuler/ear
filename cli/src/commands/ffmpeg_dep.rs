use std::path::{Path, PathBuf};
use std::process::Command;

use super::doctor::LinuxDistro;

pub const FFMPEG_NOT_FOUND: &str = "ffmpeg not found";

pub fn ffmpeg_install_command(os: &str, distro: &LinuxDistro) -> String {
    match os {
        "macos" => "brew install ffmpeg".to_string(),
        "windows" => "winget install -e --id Gyan.FFmpeg".to_string(),
        _ => distro.ffmpeg_install_cmd(),
    }
}

/// `path_hit` is an ffmpeg already found on PATH. Otherwise look in the
/// well-known macOS Homebrew locations, which a Dock-launched app often
/// cannot see.
pub fn resolve_ffmpeg_from(
    os: &str,
    path_hit: Option<PathBuf>,
    exists: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    if let Some(path) = path_hit {
        return Some(path);
    }
    let candidates: &[&str] = match os {
        "macos" => &["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
        _ => &[],
    };
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|path| exists(path))
}

pub fn which_ffmpeg() -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let out = Command::new(finder).arg("ffmpeg").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().map(str::trim).find(|line| !line.is_empty())?;
    Some(PathBuf::from(line))
}

pub fn resolve_ffmpeg() -> Option<PathBuf> {
    resolve_ffmpeg_from(std::env::consts::OS, which_ffmpeg(), |path| path.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::doctor::{DistroFamily, LinuxDistro};
    use std::path::Path;

    fn arch() -> LinuxDistro {
        LinuxDistro {
            id: "arch".to_string(),
            name: "Arch Linux".to_string(),
            family: DistroFamily::Arch,
        }
    }

    #[test]
    fn resolve_prefers_path_hit_over_homebrew_locations() {
        let found = resolve_ffmpeg_from("macos", Some(PathBuf::from("/usr/bin/ffmpeg")), |_| false);
        assert_eq!(found, Some(PathBuf::from("/usr/bin/ffmpeg")));
    }

    #[test]
    fn resolve_uses_homebrew_path_when_missing_from_path() {
        let found = resolve_ffmpeg_from("macos", None, |p: &Path| {
            p == Path::new("/opt/homebrew/bin/ffmpeg")
        });
        assert_eq!(found, Some(PathBuf::from("/opt/homebrew/bin/ffmpeg")));
    }

    #[test]
    fn resolve_checks_usr_local_after_homebrew() {
        let found = resolve_ffmpeg_from("macos", None, |p: &Path| {
            p == Path::new("/usr/local/bin/ffmpeg")
        });
        assert_eq!(found, Some(PathBuf::from("/usr/local/bin/ffmpeg")));
    }

    #[test]
    fn resolve_is_none_when_absent() {
        assert_eq!(resolve_ffmpeg_from("macos", None, |_| false), None);
        assert_eq!(resolve_ffmpeg_from("linux", None, |_| false), None);
    }

    #[test]
    fn install_command_follows_the_host_os() {
        let distro = arch();
        assert_eq!(
            ffmpeg_install_command("macos", &distro),
            "brew install ffmpeg"
        );
        assert_eq!(
            ffmpeg_install_command("windows", &distro),
            "winget install -e --id Gyan.FFmpeg"
        );
        assert_eq!(
            ffmpeg_install_command("linux", &distro),
            "sudo pacman -S ffmpeg"
        );
    }

    #[test]
    fn missing_ffmpeg_error_is_distinct_from_a_mux_failure() {
        assert_eq!(FFMPEG_NOT_FOUND, "ffmpeg not found");
        assert!(!FFMPEG_NOT_FOUND.contains("mux"));
    }
}
