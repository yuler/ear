use std::fs;
use std::net::TcpListener;
use std::path::Path;

/// First port of the LAN mirror window. Phone-keypad EAR is 327; the window
/// sits high so it stays clear of common listeners such as 7890 and 8080.
pub const MIRROR_PORT_START: u16 = 32783;
pub const MIRROR_PORT_WINDOW: u16 = 16;

pub fn in_mirror_window(port: u16) -> bool {
    port >= MIRROR_PORT_START && port < MIRROR_PORT_START + MIRROR_PORT_WINDOW
}

/// Ports to try when the caller did not pass `--port`.
/// The last successful port goes first when it still sits in the window;
/// after 32798 the search wraps back to 32783.
pub fn probe_order(remembered: Option<u16>) -> Vec<u16> {
    let start = remembered
        .filter(|port| in_mirror_window(*port))
        .unwrap_or(MIRROR_PORT_START);
    (0..MIRROR_PORT_WINDOW)
        .map(|step| {
            let offset = (start - MIRROR_PORT_START + step) % MIRROR_PORT_WINDOW;
            MIRROR_PORT_START + offset
        })
        .collect()
}

/// Port stored by the last successful `ear serve`, if it is inside the window.
pub fn remembered_port(state_file: &Path) -> Option<u16> {
    let raw = fs::read_to_string(state_file).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let port = parsed.get("port")?.as_u64()?;
    let port = u16::try_from(port).ok()?;
    Some(port).filter(|port| in_mirror_window(*port))
}

/// `explicit` binds that port only. Without it, walk `probe_order`.
pub fn bind_mirror_port(
    explicit: Option<u16>,
    remembered: Option<u16>,
) -> Result<(TcpListener, u16), String> {
    if let Some(port) = explicit {
        return bind_one(port);
    }
    let mut last_err = String::from("address already in use");
    for port in probe_order(remembered) {
        match TcpListener::bind(("0.0.0.0", port)) {
            Ok(listener) => return Ok((listener, port)),
            Err(err) => last_err = err.to_string(),
        }
    }
    let end = MIRROR_PORT_START + MIRROR_PORT_WINDOW - 1;
    Err(format!(
        "Failed to bind mirror server on ports {MIRROR_PORT_START}-{end}: {last_err}"
    ))
}

fn bind_one(port: u16) -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind(("0.0.0.0", port))
        .map_err(|err| format!("Failed to bind mirror server on port {port}: {err}"))?;
    let bound_port = listener
        .local_addr()
        .map_err(|err| format!("Failed to inspect bound mirror port {port}: {err}"))?
        .port();
    Ok((listener, bound_port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_starts_at_default_and_wraps_from_remembered() {
        let fresh = probe_order(None);
        assert_eq!(fresh.len(), 16);
        assert_eq!(fresh[0], 32783);
        assert_eq!(fresh[15], 32798);

        let wrapped = probe_order(Some(32790));
        assert_eq!(wrapped[0], 32790);
        assert_eq!(wrapped[8], 32798);
        assert_eq!(wrapped[9], 32783);
        assert_eq!(wrapped[15], 32789);

        assert_eq!(probe_order(Some(7890))[0], 32783);
        assert_eq!(probe_order(Some(22))[0], 32783);
    }

    #[test]
    fn remembered_port_keeps_window_and_drops_legacy() {
        let dir = std::env::temp_dir().join(format!("ear-port-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("mirror-state.json");

        fs::write(
            &path,
            r#"{"serverId":"a","serverName":"b","devices":[],"port":32790}"#,
        )
        .unwrap();
        assert_eq!(remembered_port(&path), Some(32790));

        fs::write(
            &path,
            r#"{"serverId":"a","serverName":"b","devices":[],"port":7890}"#,
        )
        .unwrap();
        assert_eq!(remembered_port(&path), None);

        fs::write(&path, r#"{"serverId":"a","serverName":"b","devices":[]}"#).unwrap();
        assert_eq!(remembered_port(&path), None);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bind_explicit_zero_returns_ephemeral_port() {
        let (listener, port) = bind_mirror_port(Some(0), None).unwrap();
        assert_ne!(port, 0);
        assert_eq!(port, listener.local_addr().unwrap().port());
    }
}
