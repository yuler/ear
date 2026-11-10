use std::process::{Command, Stdio};

/// Open a file or directory with the desktop's default handler.
///
/// Prefer `gio open` on Linux — it returns immediately. Plain `xdg-open` often
/// blocks until the handler process exits, which freezes callers that wait on us
/// (e.g. nsh `process.run`).
pub fn run(target: &str) -> Result<(), String> {
    if target.is_empty() {
        return Err("Target path cannot be empty".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        return run_detached("open", &[target]);
    }

    #[cfg(target_os = "windows")]
    {
        return run_detached("explorer", &[target]);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if run_detached("gio", &["open", target]).is_ok() {
            return Ok(());
        }
        run_detached("xdg-open", &[target])
    }
}

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
