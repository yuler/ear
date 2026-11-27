//! Native QR code scanner module for Ear iOS (`ear-scanner`).
//!
//! On iOS devices with a camera, presents a full-screen `AVCaptureSession`
//! viewfinder that requests camera permission on first use, decodes QR codes
//! continuously, and resolves once with the scanned payload or user action.
//! Elsewhere (desktops, simulators, headless tests) reports unavailable so the
//! TSX layer cleanly falls back to manual pairing.

#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
mod ios_controller;
#[cfg(target_os = "ios")]
mod ios_overlay;

use nsh_core::prelude::*;

#[cfg(target_os = "ios")]
use self::ios as platform;

/// Localized UI labels passed from TSX into the native QR scanner screen.
#[derive(Debug, Clone, Default, PartialEq, Eq, JsObject)]
#[prop(exact)]
pub struct QrScanOptions {
    /// Label for the top-left cancel button (e.g. "取消" / "Cancel").
    pub cancel_label: Option<String>,
    /// Label for the bottom manual-code fallback button.
    pub manual_label: Option<String>,
    /// Navigation title shown above the viewfinder.
    pub title_text: Option<String>,
    /// Guidance text shown below the viewfinder frame.
    pub hint_text: Option<String>,
}

/// Outcome of a single `QrScanner.scan()` session.
#[derive(Debug, Clone, PartialEq, Eq, JsObject)]
pub struct QrScanResult {
    /// One of `"scanned"`, `"manual"`, `"cancelled"`, `"denied"`, or `"unavailable"`.
    pub status: String,
    /// Decoded QR text when `status` is `"scanned"`.
    pub value: Option<String>,
}

impl QrScanResult {
    pub fn scanned(value: String) -> Self {
        Self {
            status: "scanned".into(),
            value: Some(value),
        }
    }

    pub fn manual() -> Self {
        Self {
            status: "manual".into(),
            value: None,
        }
    }

    pub fn cancelled() -> Self {
        Self {
            status: "cancelled".into(),
            value: None,
        }
    }

    pub fn denied() -> Self {
        Self {
            status: "denied".into(),
            value: None,
        }
    }

    pub fn unavailable() -> Self {
        Self {
            status: "unavailable".into(),
            value: None,
        }
    }
}

#[cfg(not(target_os = "ios"))]
mod platform {
    use super::{QrScanOptions, QrScanResult};

    pub(super) async fn available() -> bool {
        false
    }

    pub(super) async fn permission() -> String {
        "unavailable".into()
    }

    pub(super) async fn scan(_options: QrScanOptions) -> QrScanResult {
        QrScanResult::unavailable()
    }
}

/// Native live QR code scanner backed by iOS AVFoundation.
#[module]
pub struct QrScanner;

#[module]
impl QrScanner {
    /// Resolves `true` on real iOS devices with a camera and `NSCameraUsageDescription`.
    pub async fn available() -> bool {
        platform::available().await
    }

    /// Current camera authorization state without prompting:
    /// `"notDetermined"`, `"authorized"`, `"denied"`, `"restricted"`, or `"unavailable"`.
    pub async fn permission() -> String {
        platform::permission().await
    }

    /// Requests camera permission if needed, opens the full-screen QR viewfinder,
    /// and resolves once with `{ status, value }`.
    pub async fn scan(options: Option<QrScanOptions>) -> QrScanResult {
        platform::scan(options.unwrap_or_default()).await
    }
}

#[native_module("ear-scanner")]
fn native(registry: &mut Registry) {
    registry.module::<QrScanner>();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn result_constructors_set_expected_status_and_value() {
        let ok = QrScanResult::scanned("ear://pair?host=192.168.1.2&port=32783&code=1234".into());
        assert_eq!(ok.status, "scanned");
        assert_eq!(
            ok.value.as_deref(),
            Some("ear://pair?host=192.168.1.2&port=32783&code=1234")
        );
        assert_eq!(QrScanResult::manual().status, "manual");
        assert_eq!(QrScanResult::cancelled().status, "cancelled");
        assert_eq!(QrScanResult::denied().status, "denied");
        assert_eq!(QrScanResult::unavailable().status, "unavailable");
        assert!(QrScanResult::denied().value.is_none());
    }
}
