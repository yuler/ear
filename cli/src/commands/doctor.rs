use crate::emit::emit_json;
use serde_json::json;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DistroFamily {
    Arch,
    Debian,
    Fedora,
    Suse,
    Alpine,
    Void,
    Unknown,
}

fn has_command(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[derive(Debug, Clone)]
pub struct LinuxDistro {
    pub id: String,
    pub name: String,
    pub family: DistroFamily,
}

impl LinuxDistro {
    pub fn detect() -> Self {
        let content = fs::read_to_string("/etc/os-release")
            .or_else(|_| fs::read_to_string("/usr/lib/os-release"))
            .unwrap_or_default();
        let mut distro = Self::parse_os_release(&content);

        // Fallback: If family is Unknown from /etc/os-release, probe package managers
        if distro.family == DistroFamily::Unknown {
            if has_command("pacman") {
                distro.family = DistroFamily::Arch;
            } else if has_command("apt-get") || has_command("apt") {
                distro.family = DistroFamily::Debian;
            } else if has_command("dnf") {
                distro.family = DistroFamily::Fedora;
            } else if has_command("zypper") {
                distro.family = DistroFamily::Suse;
            } else if has_command("apk") {
                distro.family = DistroFamily::Alpine;
            } else if has_command("xbps-install") {
                distro.family = DistroFamily::Void;
            }
        }

        distro
    }

    pub fn common_webkitgtk_commands() -> &'static [&'static str] {
        &[
            "Arch / Omarchy:  sudo pacman -S webkitgtk-6.0",
            "Ubuntu / Debian: sudo apt install libwebkitgtk-6.0-4",
            "Fedora:          sudo dnf install webkitgtk6.0",
            "openSUSE:        sudo zypper install libwebkitgtk-6_0-4",
        ]
    }

    pub fn common_gstreamer_commands() -> &'static [&'static str] {
        &[
            "Arch / Omarchy:  sudo pacman -S gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad",
            "Ubuntu / Debian: sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad",
            "Fedora:          sudo dnf install gstreamer1-plugins-good gstreamer1-plugin-libav",
            "openSUSE:        sudo zypper install gstreamer-plugins-good gstreamer-plugins-libav",
        ]
    }

    pub fn parse_os_release(content: &str) -> Self {
        let mut id = String::new();
        let mut id_like = String::new();
        let mut pretty_name = String::new();
        let mut name = String::new();

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let key = k.trim();
                let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                match key {
                    "ID" => id = val.to_lowercase(),
                    "ID_LIKE" => id_like = val.to_lowercase(),
                    "PRETTY_NAME" => pretty_name = val,
                    "NAME" => name = val,
                    _ => {}
                }
            }
        }

        let display_name = if !pretty_name.is_empty() {
            pretty_name
        } else if !name.is_empty() {
            name
        } else if !id.is_empty() {
            id.clone()
        } else {
            "Linux".to_string()
        };

        let family = if id == "arch"
            || id == "omarchy"
            || id == "manjaro"
            || id == "endeavouros"
            || id == "artix"
            || id_like.contains("arch")
        {
            DistroFamily::Arch
        } else if id == "ubuntu"
            || id == "debian"
            || id == "linuxmint"
            || id == "pop"
            || id == "elementary"
            || id == "zorin"
            || id_like.contains("debian")
            || id_like.contains("ubuntu")
        {
            DistroFamily::Debian
        } else if id == "fedora"
            || id == "rhel"
            || id == "centos"
            || id == "rocky"
            || id == "alma"
            || id_like.contains("fedora")
            || id_like.contains("rhel")
        {
            DistroFamily::Fedora
        } else if id.contains("suse") || id_like.contains("suse") {
            DistroFamily::Suse
        } else if id == "alpine" {
            DistroFamily::Alpine
        } else if id == "void" {
            DistroFamily::Void
        } else {
            DistroFamily::Unknown
        };

        Self {
            id,
            name: display_name,
            family,
        }
    }

    pub fn webkitgtk_install_cmd(&self) -> String {
        match self.family {
            DistroFamily::Arch => "sudo pacman -S webkitgtk-6.0".to_string(),
            DistroFamily::Debian => "sudo apt install libwebkitgtk-6.0-4".to_string(),
            DistroFamily::Fedora => "sudo dnf install webkitgtk6.0".to_string(),
            DistroFamily::Suse => "sudo zypper install libwebkitgtk-6_0-4".to_string(),
            DistroFamily::Alpine => "sudo apk add webkit2gtk-6.0".to_string(),
            DistroFamily::Void => "sudo xbps-install -S webkit2gtk-6.0".to_string(),
            DistroFamily::Unknown => [
                "Arch/Omarchy:  sudo pacman -S webkitgtk-6.0",
                "Ubuntu/Debian: sudo apt install libwebkitgtk-6.0-4",
                "Fedora:        sudo dnf install webkitgtk6.0",
            ]
            .join("\n  "),
        }
    }

    pub fn gstreamer_install_cmd(&self) -> String {
        match self.family {
            DistroFamily::Arch => {
                "sudo pacman -S gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad"
                    .to_string()
            }
            DistroFamily::Debian => "sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly".to_string(),
            DistroFamily::Fedora => "sudo dnf install gstreamer1-plugins-good gstreamer1-plugin-libav gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free".to_string(),
            DistroFamily::Suse => "sudo zypper install gstreamer-plugins-good gstreamer-plugins-libav gstreamer-plugins-bad gstreamer-plugins-ugly".to_string(),
            DistroFamily::Alpine => "sudo apk add gst-plugins-good gst-libav gst-plugins-bad gst-plugins-ugly".to_string(),
            DistroFamily::Void => "sudo xbps-install -S gst-plugins-good1 gst-libav gst-plugins-bad1 gst-plugins-ugly1".to_string(),
            DistroFamily::Unknown => [
                "Arch/Omarchy:  sudo pacman -S gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad",
                "Ubuntu/Debian: sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad",
                "Fedora:        sudo dnf install gstreamer1-plugins-good gstreamer1-plugin-libav",
            ]
            .join("\n  "),
        }
    }

    pub fn ffmpeg_install_cmd(&self) -> String {
        match self.family {
            DistroFamily::Arch => "sudo pacman -S ffmpeg".to_string(),
            DistroFamily::Debian => "sudo apt install ffmpeg".to_string(),
            DistroFamily::Fedora => "sudo dnf install ffmpeg".to_string(),
            DistroFamily::Suse => "sudo zypper install ffmpeg".to_string(),
            DistroFamily::Alpine => "sudo apk add ffmpeg".to_string(),
            DistroFamily::Void => "sudo xbps-install -S ffmpeg".to_string(),
            DistroFamily::Unknown => [
                "Arch/Omarchy:  sudo pacman -S ffmpeg",
                "Ubuntu/Debian: sudo apt install ffmpeg",
                "Fedora:        sudo dnf install ffmpeg",
            ]
            .join("\n  "),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DependencyReport {
    pub name: String,
    pub required: bool,
    pub ok: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub details: Option<String>,
    pub install_cmd: Option<String>,
}

pub fn check_webkitgtk(distro: &LinuxDistro) -> DependencyReport {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = distro;
        return DependencyReport {
            name: "WebKitGTK 6.0".to_string(),
            required: false,
            ok: true,
            path: None,
            version: None,
            details: Some("Not required on this OS (built-in platform webview)".to_string()),
            install_cmd: None,
        };
    }

    #[cfg(target_os = "linux")]
    {
        // 1. Check ldconfig cache
        if let Ok(out) = Command::new("ldconfig").arg("-p").output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains("libwebkitgtk-6.0.so.4") {
                    let path = line.split("=>").nth(1).map(|p| p.trim().to_string());
                    return DependencyReport {
                        name: "WebKitGTK 6.0".to_string(),
                        required: true,
                        ok: true,
                        path,
                        version: None,
                        details: Some("Dynamic library found via ldconfig".to_string()),
                        install_cmd: None,
                    };
                }
            }
        }

        // 2. Check candidate filesystem paths
        let candidates = [
            "/usr/lib/libwebkitgtk-6.0.so.4",
            "/usr/lib64/libwebkitgtk-6.0.so.4",
            "/usr/lib/x86_64-linux-gnu/libwebkitgtk-6.0.so.4",
            "/usr/lib/aarch64-linux-gnu/libwebkitgtk-6.0.so.4",
            "/usr/local/lib/libwebkitgtk-6.0.so.4",
        ];
        for candidate in candidates {
            if Path::new(candidate).exists() {
                return DependencyReport {
                    name: "WebKitGTK 6.0".to_string(),
                    required: true,
                    ok: true,
                    path: Some(candidate.to_string()),
                    version: None,
                    details: Some("Dynamic library found in filesystem".to_string()),
                    install_cmd: None,
                };
            }
        }

        DependencyReport {
            name: "WebKitGTK 6.0".to_string(),
            required: true,
            ok: false,
            path: None,
            version: None,
            details: Some("Required by Native Shell Linux host for rendering web views".to_string()),
            install_cmd: Some(distro.webkitgtk_install_cmd()),
        }
    }
}

pub fn check_gstreamer(distro: &LinuxDistro) -> DependencyReport {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = distro;
        return DependencyReport {
            name: "GStreamer Codecs".to_string(),
            required: false,
            ok: true,
            path: None,
            version: None,
            details: Some("Not required on this OS (built-in platform media engine)".to_string()),
            install_cmd: None,
        };
    }

    #[cfg(target_os = "linux")]
    {
        let gst_version = Command::new("gst-inspect-1.0")
            .arg("--version")
            .output()
            .ok()
            .and_then(|out| {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    text.lines()
                        .find(|l| l.contains("GStreamer"))
                        .map(|l| l.trim().to_string())
                } else {
                    None
                }
            });

        if gst_version.is_none() {
            // Check if libgstreamer-1.0.so is at least present
            let candidates = [
                "/usr/lib/libgstreamer-1.0.so.0",
                "/usr/lib64/libgstreamer-1.0.so.0",
                "/usr/lib/x86_64-linux-gnu/libgstreamer-1.0.so.0",
            ];
            let found_lib = candidates.iter().find(|p| Path::new(p).exists());
            if found_lib.is_none() {
                return DependencyReport {
                    name: "GStreamer Plugins".to_string(),
                    required: true,
                    ok: false,
                    path: None,
                    version: None,
                    details: Some("GStreamer core is not installed".to_string()),
                    install_cmd: Some(distro.gstreamer_install_cmd()),
                };
            }
        }

        // Check essential elements: qtdemux (MP4), avdec_h264 (H.264), avdec_aac (AAC)
        let mut missing_elements = Vec::new();
        let elements = [
            ("qtdemux", "gst-plugins-good (MP4 demuxer)"),
            ("avdec_h264", "gst-libav (H.264 video decoder)"),
            ("avdec_aac", "gst-libav (AAC audio decoder)"),
        ];

        for (el, pkg) in elements {
            let res = Command::new("gst-inspect-1.0")
                .arg(el)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if !res {
                missing_elements.push(pkg);
            }
        }

        if !missing_elements.is_empty() {
            return DependencyReport {
                name: "GStreamer Plugins".to_string(),
                required: false,
                ok: false,
                path: None,
                version: gst_version,
                details: Some(format!(
                    "Missing plugins for MP4/H.264/AAC playback: {}",
                    missing_elements.join(", ")
                )),
                install_cmd: Some(distro.gstreamer_install_cmd()),
            };
        }

        DependencyReport {
            name: "GStreamer Plugins".to_string(),
            required: false,
            ok: true,
            path: None,
            version: gst_version,
            details: Some("All essential media plugins available (MP4, H.264, AAC)".to_string()),
            install_cmd: None,
        }
    }
}

pub fn check_ffmpeg(distro: &LinuxDistro) -> DependencyReport {
    let out = Command::new("ffmpeg").arg("-version").output();
    match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            let ver = text.lines().next().unwrap_or("ffmpeg").trim().to_string();
            DependencyReport {
                name: "ffmpeg".to_string(),
                required: false,
                ok: true,
                path: None,
                version: Some(ver),
                details: Some("Available for audio/video muxing and extraction".to_string()),
                install_cmd: None,
            }
        }
        _ => DependencyReport {
            name: "ffmpeg".to_string(),
            required: false,
            ok: false,
            path: None,
            version: None,
            details: Some("Required for muxing downloaded video and audio tracks".to_string()),
            install_cmd: Some(distro.ffmpeg_install_cmd()),
        },
    }
}

pub fn run(args: &[String]) -> Result<(), String> {
    let is_json = args.iter().any(|a| a == "--json");
    let is_preflight = args.iter().any(|a| a == "--preflight" || a == "-p");

    let distro = LinuxDistro::detect();
    let webkit = check_webkitgtk(&distro);
    let gstreamer = check_gstreamer(&distro);
    let ffmpeg = check_ffmpeg(&distro);

    // In preflight mode (called during Linux app startup):
    // Only fail if critical startup dependency (WebKitGTK) is missing.
    if is_preflight {
        if !webkit.ok {
            eprintln!("Error: Missing required runtime dependency 'WebKitGTK 6.0' (libwebkitgtk-6.0.so.4).");
            eprintln!("Ear cannot start without WebKitGTK 6.0.");
            eprintln!();
            eprintln!("To install WebKitGTK 6.0 on your system ({}):", distro.name);
            if let Some(ref cmd) = webkit.install_cmd {
                eprintln!("  {}", cmd);
            }
            eprintln!();
            eprintln!("Installation commands for common Linux distributions:");
            for line in LinuxDistro::common_webkitgtk_commands() {
                eprintln!("  • {}", line);
            }
            eprintln!();
            eprintln!("Run `ear doctor` for a full environment diagnostics report.");
            return Err("Missing required dependency: WebKitGTK 6.0".to_string());
        }
        return Ok(());
    }

    if is_json {
        let all_ok = webkit.ok && gstreamer.ok && ffmpeg.ok;
        let payload = json!({
            "v": 1,
            "type": "doctor",
            "platform": env::consts::OS,
            "arch": env::consts::ARCH,
            "distro": {
                "id": distro.id,
                "name": distro.name,
                "family": format!("{:?}", distro.family).to_lowercase(),
            },
            "allOk": all_ok,
            "commonCommands": {
                "webkitgtk": LinuxDistro::common_webkitgtk_commands(),
                "gstreamer": LinuxDistro::common_gstreamer_commands(),
            },
            "dependencies": {
                "webkitgtk": {
                    "name": webkit.name,
                    "required": webkit.required,
                    "ok": webkit.ok,
                    "path": webkit.path,
                    "version": webkit.version,
                    "details": webkit.details,
                    "installCommand": webkit.install_cmd,
                },
                "gstreamer": {
                    "name": gstreamer.name,
                    "required": gstreamer.required,
                    "ok": gstreamer.ok,
                    "path": gstreamer.path,
                    "version": gstreamer.version,
                    "details": gstreamer.details,
                    "installCommand": gstreamer.install_cmd,
                },
                "ffmpeg": {
                    "name": ffmpeg.name,
                    "required": ffmpeg.required,
                    "ok": ffmpeg.ok,
                    "path": ffmpeg.path,
                    "version": ffmpeg.version,
                    "details": ffmpeg.details,
                    "installCommand": ffmpeg.install_cmd,
                }
            }
        });
        emit_json(payload);
        return Ok(());
    }

    // Default: Human-readable terminal output
    println!("Ear Doctor — Environment & Runtime Diagnostics");
    println!("===============================================");
    println!(
        "Platform: {} ({}) [{}]",
        distro.name,
        env::consts::ARCH,
        env::consts::OS
    );
    println!();

    let reports = [&webkit, &gstreamer, &ffmpeg];
    let mut has_errors = false;

    for r in reports {
        let mark = if r.ok {
            "✓".to_string()
        } else if r.required {
            has_errors = true;
            "✗ (Required)".to_string()
        } else {
            "△ (Recommended)".to_string()
        };

        print!("  [{}] {}", mark, r.name);
        if let Some(ref ver) = r.version {
            print!(": {}", ver);
        } else if let Some(ref path) = r.path {
            print!(": {}", path);
        }
        println!();

        if let Some(ref details) = r.details {
            println!("      {}", details);
        }
        if !r.ok {
            if let Some(ref cmd) = r.install_cmd {
                println!("      To install on {}:", distro.name);
                for line in cmd.lines() {
                    println!("        {}", line);
                }
            }
            if r.name == "WebKitGTK 6.0" {
                println!("      Other common Linux distributions:");
                for line in LinuxDistro::common_webkitgtk_commands() {
                    println!("        • {}", line);
                }
            } else if r.name == "GStreamer Plugins" {
                println!("      Other common Linux distributions:");
                for line in LinuxDistro::common_gstreamer_commands() {
                    println!("        • {}", line);
                }
            }
        }
        println!();
    }

    if has_errors {
        println!("Result: One or more required dependencies are missing.");
        println!("Please install the required packages above before launching Ear.");
        return Err("One or more required dependencies are missing".to_string());
    }

    println!("Result: All required dependencies are satisfied!");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_os_release_arch() {
        let content = r#"
NAME="Omarchy"
PRETTY_NAME="Omarchy Linux"
ID=omarchy
ID_LIKE=arch
"#;
        let distro = LinuxDistro::parse_os_release(content);
        assert_eq!(distro.family, DistroFamily::Arch);
        assert_eq!(distro.name, "Omarchy Linux");
        assert!(distro.webkitgtk_install_cmd().contains("pacman -S"));
    }

    #[test]
    fn test_parse_os_release_ubuntu() {
        let content = r#"
NAME="Ubuntu"
PRETTY_NAME="Ubuntu 24.04 LTS"
ID=ubuntu
ID_LIKE=debian
"#;
        let distro = LinuxDistro::parse_os_release(content);
        assert_eq!(distro.family, DistroFamily::Debian);
        assert_eq!(distro.name, "Ubuntu 24.04 LTS");
        assert!(distro.webkitgtk_install_cmd().contains("apt install"));
    }

    #[test]
    fn test_parse_os_release_fedora() {
        let content = r#"
NAME="Fedora Linux"
PRETTY_NAME="Fedora Linux 40 (Workstation Edition)"
ID=fedora
"#;
        let distro = LinuxDistro::parse_os_release(content);
        assert_eq!(distro.family, DistroFamily::Fedora);
        assert!(distro.webkitgtk_install_cmd().contains("dnf install"));
    }

    #[test]
    fn test_distro_install_commands_non_empty() {
        let distro = LinuxDistro {
            id: "arch".to_string(),
            name: "Arch Linux".to_string(),
            family: DistroFamily::Arch,
        };
        assert!(!distro.webkitgtk_install_cmd().is_empty());
        assert!(!distro.gstreamer_install_cmd().is_empty());
        assert!(!distro.ffmpeg_install_cmd().is_empty());
    }
}
