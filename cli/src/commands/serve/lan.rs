//! Pick the IPv4 address a phone on the same Wi-Fi can actually reach.
//!
//! A UDP connect to a public address reports whichever interface the tunnel
//! stole (Mihomo's `22.0.0.0`, Tailscale, …). Pairing needs the home LAN
//! address instead, so virtual interfaces are ignored.

use std::net::{Ipv4Addr, UdpSocket};

#[derive(Clone, Debug)]
struct LanCandidate {
    name: String,
    ip: Ipv4Addr,
    is_up: bool,
    is_loopback: bool,
    is_point_to_point: bool,
}

pub fn detect_lan_ip() -> String {
    choose_lan_ip(&list_candidates(), default_iface().as_deref(), probe_udp())
}

fn choose_lan_ip(
    candidates: &[LanCandidate],
    default_iface: Option<&str>,
    udp_ip: Option<Ipv4Addr>,
) -> String {
    let usable: Vec<&LanCandidate> = candidates.iter().filter(|c| is_usable(c)).collect();

    if let Some(ip) = udp_ip {
        if let Some(found) = usable.iter().find(|c| c.ip == ip) {
            return found.ip.to_string();
        }
    }

    if let Some(best) = usable.iter().min_by_key(|c| rank(c, default_iface)) {
        return best.ip.to_string();
    }

    if let Some(ip) = udp_ip.filter(|ip| is_rfc1918(*ip)) {
        return ip.to_string();
    }
    "127.0.0.1".to_string()
}

fn is_usable(c: &LanCandidate) -> bool {
    c.is_up
        && !c.is_loopback
        && !c.is_point_to_point
        && !is_virtual_name(&c.name)
        && is_rfc1918(c.ip)
}

fn rank(c: &LanCandidate, default_iface: Option<&str>) -> (u8, u8, String, [u8; 4]) {
    let on_default = if default_iface.is_some_and(|name| name == c.name) {
        0
    } else {
        1
    };
    (on_default, class_rank(c.ip), c.name.clone(), c.ip.octets())
}

fn class_rank(ip: Ipv4Addr) -> u8 {
    match ip.octets() {
        [192, 168, ..] => 0,
        [10, ..] => 1,
        _ => 2,
    }
}

fn is_rfc1918(ip: Ipv4Addr) -> bool {
    match ip.octets() {
        [10, ..] => true,
        [172, second, ..] => (16..=31).contains(&second),
        [192, 168, ..] => true,
        _ => false,
    }
}

fn is_virtual_name(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    const PREFIXES: &[&str] = &[
        "docker",
        "br-",
        "veth",
        "virbr",
        "cni",
        "flannel",
        "podman",
        "vnet",
        "vmnet",
        "vboxnet",
        "tun",
        "tap",
        "utun",
        "wg",
        "tailscale",
        "zt",
        "mihomo",
        "clash",
        "awdl",
        "llw",
        "gif",
        "stf",
        "ipsec",
        "ppp",
        "nordlynx",
        "zerotier",
    ];
    PREFIXES.iter().any(|prefix| name.starts_with(prefix))
}

fn probe_udp() -> Option<Ipv4Addr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    match sock.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

#[cfg(unix)]
fn list_candidates() -> Vec<LanCandidate> {
    use std::ffi::{c_char, c_int, c_uint, CStr};
    use std::ptr;

    const IFF_UP: c_uint = 0x1;
    const IFF_LOOPBACK: c_uint = 0x8;
    const IFF_POINTOPOINT: c_uint = 0x10;

    #[repr(C)]
    struct IfAddrs {
        ifa_next: *mut IfAddrs,
        ifa_name: *const c_char,
        ifa_flags: c_uint,
        ifa_addr: *const u8,
        ifa_netmask: *const u8,
        ifa_dstaddr: *const u8,
        ifa_data: *mut std::ffi::c_void,
    }

    extern "C" {
        fn getifaddrs(ifap: *mut *mut IfAddrs) -> c_int;
        fn freeifaddrs(ifa: *mut IfAddrs);
    }

    let mut head: *mut IfAddrs = ptr::null_mut();
    if unsafe { getifaddrs(&mut head) } != 0 || head.is_null() {
        return Vec::new();
    }

    let mut out = Vec::new();
    let mut cur = head;
    while !cur.is_null() {
        let ifa = unsafe { &*cur };
        if let Some(ip) = ipv4_from_sockaddr(ifa.ifa_addr) {
            let name = if ifa.ifa_name.is_null() {
                String::new()
            } else {
                unsafe { CStr::from_ptr(ifa.ifa_name) }
                    .to_string_lossy()
                    .into_owned()
            };
            out.push(LanCandidate {
                name,
                ip,
                is_up: ifa.ifa_flags & IFF_UP != 0,
                is_loopback: ifa.ifa_flags & IFF_LOOPBACK != 0,
                is_point_to_point: ifa.ifa_flags & IFF_POINTOPOINT != 0,
            });
        }
        cur = ifa.ifa_next;
    }
    unsafe { freeifaddrs(head) };
    out
}

#[cfg(not(unix))]
fn list_candidates() -> Vec<LanCandidate> {
    Vec::new()
}

/// `sockaddr_in` stores the IPv4 address at byte offset 4 on both Linux and macOS.
#[cfg(unix)]
fn ipv4_from_sockaddr(sa: *const u8) -> Option<Ipv4Addr> {
    if sa.is_null() {
        return None;
    }
    let family = unsafe {
        if cfg!(any(target_os = "linux", target_os = "android")) {
            std::ptr::read_unaligned(sa as *const u16)
        } else {
            *sa.add(1) as u16
        }
    };
    if family != 2 {
        return None;
    }
    let octets = unsafe { std::ptr::read_unaligned(sa.add(4) as *const [u8; 4]) };
    Some(Ipv4Addr::from(octets))
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn default_iface() -> Option<String> {
    let text = std::fs::read_to_string("/proc/net/route").ok()?;
    let mut best: Option<(u32, String)> = None;
    for line in text.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 7 || cols[1] != "00000000" {
            continue;
        }
        let metric = cols[6].parse::<u32>().unwrap_or(u32::MAX);
        if best
            .as_ref()
            .map(|(prev, _)| metric < *prev)
            .unwrap_or(true)
        {
            best = Some((metric, cols[0].to_string()));
        }
    }
    best.map(|(_, name)| name)
}

#[cfg(target_os = "macos")]
fn default_iface() -> Option<String> {
    let output = std::process::Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let line = line.trim();
        if let Some(name) = line.strip_prefix("interface:") {
            let name = name.trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "linux", target_os = "android", target_os = "macos")))]
fn default_iface() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn iface(name: &str, ip: &str) -> LanCandidate {
        LanCandidate {
            name: name.to_string(),
            ip: ip.parse().unwrap(),
            is_up: true,
            is_loopback: false,
            is_point_to_point: false,
        }
    }

    fn point_to_point(name: &str, ip: &str) -> LanCandidate {
        LanCandidate {
            is_point_to_point: true,
            ..iface(name, ip)
        }
    }

    #[test]
    fn prefers_home_lan_when_a_tunnel_hijacks_the_udp_probe() {
        let candidates = vec![
            point_to_point("Mihomo", "22.0.0.0"),
            iface("docker0", "172.17.0.1"),
            iface("br-638d6f7e3cad", "172.22.0.1"),
            point_to_point("tailscale0", "100.89.181.44"),
            iface("eno2", "192.168.20.189"),
        ];
        let udp = "22.0.0.0".parse().unwrap();
        assert_eq!(
            choose_lan_ip(&candidates, Some("eno2"), Some(udp)),
            "192.168.20.189"
        );
    }

    #[test]
    fn udp_probe_wins_when_it_matches_a_real_interface() {
        let candidates = vec![iface("eth0", "10.0.0.8"), iface("eth1", "192.168.1.9")];
        let udp = "10.0.0.8".parse().unwrap();
        assert_eq!(
            choose_lan_ip(&candidates, Some("eth1"), Some(udp)),
            "10.0.0.8"
        );
    }

    #[test]
    fn skips_tunnel_private_addresses() {
        let candidates = vec![
            point_to_point("tun0", "10.8.0.2"),
            iface("wlan0", "192.168.0.20"),
        ];
        assert_eq!(
            choose_lan_ip(&candidates, Some("tun0"), None),
            "192.168.0.20"
        );
    }

    #[test]
    fn falls_back_to_loopback_when_only_virtual_addresses_exist() {
        let candidates = vec![iface("docker0", "172.17.0.1"), iface("lo", "127.0.0.1")];
        let udp = "22.0.0.0".parse().unwrap();
        assert_eq!(choose_lan_ip(&candidates, None, Some(udp)), "127.0.0.1");
    }

    #[test]
    fn live_detect_returns_an_ipv4_address() {
        let ip: Ipv4Addr = detect_lan_ip().parse().expect("ipv4");
        assert!(!ip.is_unspecified());
        assert!(is_rfc1918(ip) || ip.is_loopback(), "got {ip}");
    }

    #[test]
    fn uses_ten_dot_when_that_is_the_default_lan() {
        let candidates = vec![iface("en0", "10.1.2.3"), iface("bridge100", "192.168.64.1")];
        assert_eq!(choose_lan_ip(&candidates, Some("en0"), None), "10.1.2.3");
    }
}
