use std::env;
use std::path::Path;
use std::process::{Command, Stdio};

/// Open or reveal a file or directory with the desktop's native file manager / handler.
///
/// Supports all desktop platforms:
/// - macOS: `open -R <file>` to reveal in Finder, `open <dir>` for folders.
/// - Windows: `explorer /select,<file>` to reveal in File Explorer, `explorer <dir>` for folders.
/// - Linux: FreeDesktop D-Bus ShowItems (Nautilus/Files, Dolphin, etc.),
///   nautilus/dolphin/cosmic-files --select, with fallback to gio open / xdg-open.
pub fn run(target: &str) -> Result<(), String> {
    let raw = target.trim();
    if raw.is_empty() {
        return Err("Target path cannot be empty".to_string());
    }

    // Strip optional flag like --reveal or -r if passed
    let clean_target = if let Some(stripped) = raw.strip_prefix("--reveal ") {
        stripped.trim()
    } else if let Some(stripped) = raw.strip_prefix("-r ") {
        stripped.trim()
    } else {
        raw
    };

    // If target is an HTTP/HTTPS URL, open with the default browser
    if clean_target.starts_with("http://") || clean_target.starts_with("https://") {
        return open_url(clean_target);
    }

    let resolved = resolve_path(clean_target);
    let path = Path::new(&resolved);

    #[cfg(target_os = "macos")]
    {
        open_macos(path)
    }

    #[cfg(target_os = "windows")]
    {
        open_windows(path)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        open_linux(path)
    }
}

pub fn resolve_path(raw: &str) -> String {
    // Strip file:// prefix if present
    let no_scheme = raw.strip_prefix("file://").unwrap_or(raw);

    // Expand ~ / ~/
    if no_scheme == "~" {
        if let Ok(home) = env::var("HOME").or_else(|_| env::var("USERPROFILE")) {
            return home;
        }
    } else if let Some(rest) = no_scheme.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME").or_else(|_| env::var("USERPROFILE")) {
            return format!("{home}/{rest}");
        }
    }
    no_scheme.to_string()
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_detached("open", &[url])
    }
    #[cfg(target_os = "windows")]
    {
        run_detached("explorer", &[url])
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if run_linux_command("gio", &["open", url]).is_ok() {
            return Ok(());
        }
        run_linux_command("xdg-open", &[url])
    }
}

#[cfg(target_os = "macos")]
fn open_macos(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    if path.is_file() {
        if run_detached("open", &["-R", &path_str]).is_ok() {
            return Ok(());
        }
    }
    run_detached("open", &[&path_str])
}

#[cfg(target_os = "windows")]
fn open_windows(path: &Path) -> Result<(), String> {
    let win_path = path.to_string_lossy().replace('/', "\\");
    if path.is_file() {
        let select_arg = format!("/select,{win_path}");
        if run_detached("explorer", &[&select_arg]).is_ok() {
            return Ok(());
        }
    }
    run_detached("explorer", &[&win_path])
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn open_linux(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let is_file = path.is_file();

    if is_file {
        // 1. Try FreeDesktop D-Bus ShowItems (supported by GNOME Files / Nautilus, KDE Dolphin, Nemo, Thunar, etc.)
        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let file_url = format!("file://{}", abs_path.to_string_lossy());

        // Try gdbus first
        let gdbus_arg = format!("['{file_url}']");
        if run_linux_command(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.freedesktop.FileManager1",
                "--object-path",
                "/org/freedesktop/FileManager1",
                "--method",
                "org.freedesktop.FileManager1.ShowItems",
                &gdbus_arg,
                "",
            ],
        )
        .is_ok()
        {
            return Ok(());
        }

        // Try dbus-send
        let dbus_arg = format!("array:string:{file_url}");
        if run_linux_command(
            "dbus-send",
            &[
                "--session",
                "--dest=org.freedesktop.FileManager1",
                "--type=method_call",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
                &dbus_arg,
                "string:",
            ],
        )
        .is_ok()
        {
            return Ok(());
        }

        // 2. Try direct file manager binaries with --select
        if run_linux_command("nautilus", &["--select", &path_str]).is_ok() {
            return Ok(());
        }
        if run_linux_command("dolphin", &["--select", &path_str]).is_ok() {
            return Ok(());
        }
        if run_linux_command("cosmic-files", &[&path_str]).is_ok() {
            return Ok(());
        }

        // 3. Fall back to opening the parent folder
        if let Some(parent) = path.parent() {
            let parent_str = parent.to_string_lossy();
            if run_linux_command("gio", &["open", &parent_str]).is_ok() {
                return Ok(());
            }
            if run_linux_command("xdg-open", &[&parent_str]).is_ok() {
                return Ok(());
            }
        }
    }

    // Target is a directory or fallback
    if run_linux_command("gio", &["open", &path_str]).is_ok() {
        return Ok(());
    }
    if run_linux_command("xdg-open", &[&path_str]).is_ok() {
        return Ok(());
    }
    if run_linux_command("nautilus", &[&path_str]).is_ok() {
        return Ok(());
    }
    run_linux_command("dolphin", &[&path_str])
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn run_linux_command(program: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    inject_desktop_env(&mut cmd);

    // If it's a CLI tool that exits synchronously (like gdbus, dbus-send):
    if program == "gdbus" || program == "dbus-send" {
        let status = cmd.status().map_err(|e| format!("{program} error: {e}"))?;
        if status.success() {
            return Ok(());
        } else {
            return Err(format!("{program} exited with {status}"));
        }
    }

    // For file managers, spawn detached so it returns immediately
    cmd.spawn()
        .map_err(|e| format!("Failed to spawn {program}: {e}"))?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn inject_desktop_env(cmd: &mut Command) {
    if env::var("XDG_RUNTIME_DIR").is_err() {
        if let Ok(out) = Command::new("id").arg("-u").output() {
            if let Ok(uid_str) = String::from_utf8(out.stdout) {
                let uid = uid_str.trim();
                let user_run = format!("/run/user/{uid}");
                if Path::new(&user_run).exists() {
                    cmd.env("XDG_RUNTIME_DIR", &user_run);
                    if env::var("DBUS_SESSION_BUS_ADDRESS").is_err() {
                        let bus = format!("{user_run}/bus");
                        if Path::new(&bus).exists() {
                            cmd.env("DBUS_SESSION_BUS_ADDRESS", format!("unix:path={bus}"));
                        }
                    }
                }
            }
        }
    }
    if env::var("DISPLAY").is_err() {
        cmd.env("DISPLAY", ":0");
    }
    if env::var("WAYLAND_DISPLAY").is_err() {
        if let Ok(runtime) = env::var("XDG_RUNTIME_DIR") {
            if Path::new(&format!("{runtime}/wayland-0")).exists() {
                cmd.env("WAYLAND_DISPLAY", "wayland-0");
            } else if Path::new(&format!("{runtime}/wayland-1")).exists() {
                cmd.env("WAYLAND_DISPLAY", "wayland-1");
            }
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn run_detached(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to open via {program}: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_path_strips_file_scheme() {
        assert_eq!(
            resolve_path("file:///home/user/test.mp4"),
            "/home/user/test.mp4"
        );
    }

    #[test]
    fn test_resolve_path_expands_tilde() {
        let resolved = resolve_path("~/Downloads/video.mp4");
        assert!(!resolved.starts_with("~/"));
        assert!(resolved.ends_with("/Downloads/video.mp4"));
    }

    #[test]
    fn test_run_empty_target_errors() {
        assert!(run("").is_err());
        assert!(run("   ").is_err());
    }
}
