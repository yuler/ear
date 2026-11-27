// Integration and security regression tests live in ./tests.rs.
pub mod catalog;
pub mod crypto;
pub mod lan;
pub mod http;
pub mod port;
pub mod state;
#[cfg(test)]
mod tests;

use crate::emit::emit_json;
use catalog::MediaCatalog;
use port::{bind_mirror_port, remembered_port};
use serde::Deserialize;
use serde_json::json;
use state::{default_library_dir, detect_lan_ip, MirrorState, ServerSnapshot};
use std::io::{self, BufRead};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const MAX_CONCURRENT_CONNECTIONS: usize = 64;

#[derive(Debug, Default)]
struct ServeOptions {
    /// Set only when the user passed `--port`. Absent means probe the window.
    port: Option<u16>,
    host: Option<String>,
    name: Option<String>,
    library_dir: Option<PathBuf>,
    state_file: Option<PathBuf>,
    control_stdin: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlCommand {
    cmd: String,
    device_id: Option<String>,
}

struct ActiveConnectionGuard {
    counter: Arc<AtomicUsize>,
}

impl ActiveConnectionGuard {
    fn try_acquire(counter: &Arc<AtomicUsize>, max: usize) -> Option<Self> {
        let mut cur = counter.load(Ordering::Acquire);
        loop {
            if cur >= max {
                return None;
            }
            match counter.compare_exchange_weak(cur, cur + 1, Ordering::AcqRel, Ordering::Acquire) {
                Ok(_) => {
                    return Some(Self {
                        counter: Arc::clone(counter),
                    });
                }
                Err(actual) => cur = actual,
            }
        }
    }
}

impl Drop for ActiveConnectionGuard {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

pub fn run(args: &[String]) -> Result<(), String> {
    let opts = parse_args(args)?;
    let library_dir = opts.library_dir.unwrap_or_else(default_library_dir);
    let state_file = opts.state_file.unwrap_or_else(|| {
        library_dir
            .parent()
            .unwrap_or(&library_dir)
            .join("mirror-state.json")
    });

    let remembered = if opts.port.is_none() {
        remembered_port(&state_file)
    } else {
        None
    };
    let (listener, actual_port) = bind_mirror_port(opts.port, remembered)?;
    let advertised_host = opts.host.unwrap_or_else(detect_lan_ip);

    let catalog = Arc::new(MediaCatalog::new(library_dir));
    let mirror_state = Arc::new(Mutex::new(MirrorState::load_or_init(
        state_file,
        opts.name,
        advertised_host,
        actual_port,
    )?));
    let running = Arc::new(AtomicBool::new(true));
    let active_connections = Arc::new(AtomicUsize::new(0));

    let emit_snapshot = Arc::new(|snap: ServerSnapshot| {
        emit_json(json!({
            "v": 1,
            "type": "state",
            "state": snap,
        }));
    });

    let initial_count = catalog.scan().len();
    let initial = mirror_state.lock().unwrap().snapshot(initial_count);
    emit_json(json!({
        "v": 1,
        "type": "ready",
        "state": initial,
    }));

    // Background ticker rotates the 4-digit pairing code every 2 minutes (while unlocked).
    {
        let st = Arc::clone(&mirror_state);
        let cat = Arc::clone(&catalog);
        let run_flag = Arc::clone(&running);
        let emit_cb = Arc::clone(&emit_snapshot);
        thread::spawn(move || {
            while run_flag.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(1));
                let rotated = {
                    let mut guard = st.lock().unwrap();
                    guard.ensure_fresh_code().unwrap_or(false)
                };
                if rotated {
                    let count = cat.scan().len();
                    let snap = st.lock().unwrap().snapshot(count);
                    emit_cb(snap);
                }
            }
        });
    }

    // Optional NDJSON control loop on stdin (used by Desktop app).
    if opts.control_stdin {
        let st = Arc::clone(&mirror_state);
        let cat = Arc::clone(&catalog);
        let run_flag = Arc::clone(&running);
        let emit_cb = Arc::clone(&emit_snapshot);
        thread::spawn(move || {
            let stdin = io::stdin();
            for line in stdin.lock().lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(cmd) = serde_json::from_str::<ControlCommand>(trimmed) else {
                    continue;
                };
                match cmd.cmd.as_str() {
                    "refresh_code" => {
                        let ok = {
                            let mut guard = st.lock().unwrap();
                            guard.reopen_pairing().is_ok()
                        };
                        if ok {
                            let count = cat.scan().len();
                            let snap = st.lock().unwrap().snapshot(count);
                            emit_cb(snap);
                        }
                    }
                    "remove_device" => {
                        if let Some(id) = cmd.device_id.as_deref() {
                            let count = cat.scan().len();
                            let snap = {
                                let mut guard = st.lock().unwrap();
                                guard.remove_device(id);
                                guard.snapshot(count)
                            };
                            emit_cb(snap);
                        }
                    }
                    "status" => {
                        let count = cat.scan().len();
                        let snap = st.lock().unwrap().snapshot(count);
                        emit_cb(snap);
                    }
                    "stop" => {
                        run_flag.store(false, Ordering::Relaxed);
                        break;
                    }
                    _ => {}
                }
            }
            run_flag.store(false, Ordering::Relaxed);
        });
    }

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set nonblocking accept: {e}"))?;

    while running.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _peer)) => {
                let _ = stream.set_nonblocking(false);
                let Some(conn_guard) =
                    ActiveConnectionGuard::try_acquire(&active_connections, MAX_CONCURRENT_CONNECTIONS)
                else {
                    http::write_service_unavailable(&mut stream);
                    continue;
                };
                let st = Arc::clone(&mirror_state);
                let cat = Arc::clone(&catalog);
                let emit_cb = Arc::clone(&emit_snapshot);
                let spawned = thread::Builder::new()
                    .name("ear-serve-conn".to_string())
                    .spawn(move || {
                        let _guard = conn_guard;
                        http::handle_connection(stream, st, cat, emit_cb.as_ref());
                    });
                if spawned.is_err() {
                    // conn_guard was moved into closure and dropped on failure.
                }
            }
            Err(err) if err.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => {
                thread::sleep(Duration::from_millis(50));
            }
        }
    }

    Ok(())
}

fn parse_args(args: &[String]) -> Result<ServeOptions, String> {
    let mut opts = ServeOptions::default();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                let raw = args.get(i + 1).ok_or("--port requires a value")?;
                opts.port = Some(raw.parse::<u16>().map_err(|_| format!("Invalid port: {raw}"))?);
                i += 2;
            }
            "--host" => {
                opts.host = Some(args.get(i + 1).ok_or("--host requires a value")?.clone());
                i += 2;
            }
            "--name" => {
                opts.name = Some(args.get(i + 1).ok_or("--name requires a value")?.clone());
                i += 2;
            }
            "--library-dir" => {
                opts.library_dir = Some(PathBuf::from(
                    args.get(i + 1).ok_or("--library-dir requires a value")?,
                ));
                i += 2;
            }
            "--state-file" => {
                opts.state_file = Some(PathBuf::from(
                    args.get(i + 1).ok_or("--state-file requires a value")?,
                ));
                i += 2;
            }
            "--control-stdin" => {
                opts.control_stdin = true;
                i += 1;
            }
            other => return Err(format!("Unknown serve argument: {other}")),
        }
    }
    Ok(opts)
}
