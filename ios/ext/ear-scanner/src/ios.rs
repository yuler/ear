// Scanner view controller lives in ./ios_controller.rs; UIKit overlay helpers live in ./ios_overlay.rs.
//! iOS AVFoundation camera permissions and transition-safe modal presentation.

use std::{
    cell::{Cell, RefCell},
    ptr::NonNull,
    rc::Rc,
    sync::Mutex,
};

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchTime, MainThreadBound};
use nsh_core::prelude::*;
use objc2::{
    DefinedClass, MainThreadMarker, msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Bool, ProtocolObject},
};
use objc2_foundation::{NSBundle, NSString};
use objc2_ui_kit::{
    UIViewController, UIViewControllerTransitionCoordinator,
    UIViewControllerTransitionCoordinatorContext, UIWindow,
};
use tokio::sync::oneshot;

use super::{
    QrScanOptions, QrScanResult,
    ios_controller::{QrScannerViewController, create_scanner_controller},
};

#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {}

#[link(name = "QuartzCore", kind = "framework")]
unsafe extern "C" {}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {}

pub(super) const MEDIA_VIDEO: &str = "vide";

/// `AVAuthorizationStatus` values.
const AUTH_NOT_DETERMINED: isize = 0;
const AUTH_RESTRICTED: isize = 1;
const AUTH_DENIED: isize = 2;
const AUTH_AUTHORIZED: isize = 3;

/// Max waits when waiting for UIKit modal transitions to settle (~2s).
const MAX_WAITS: u32 = 120;
const LOOK_MS: u64 = 16;

pub(super) type Answer = oneshot::Sender<QrScanResult>;

thread_local! {
    pub(super) static ACTIVE: RefCell<Option<Retained<QrScannerViewController>>> = const { RefCell::new(None) };
    static ASKING: Cell<bool> = const { Cell::new(false) };
}

pub(super) async fn available() -> bool {
    run_on_main_thread(usable).await.unwrap_or(false)
}

pub(super) async fn permission() -> String {
    run_on_main_thread(|| {
        if !usable() {
            return "unavailable".to_string();
        }
        match authorization() {
            Some(AUTH_NOT_DETERMINED) => "notDetermined".to_string(),
            Some(AUTH_AUTHORIZED) => "authorized".to_string(),
            Some(AUTH_DENIED) => "denied".to_string(),
            Some(AUTH_RESTRICTED) => "restricted".to_string(),
            _ => "unavailable".to_string(),
        }
    })
    .await
    .unwrap_or_else(|_| "unavailable".to_string())
}

pub(super) async fn scan(options: QrScanOptions) -> QrScanResult {
    let (answer, rx) = oneshot::channel();
    if run_on_main_thread(move || start(answer, options)).await.is_err() {
        return QrScanResult::unavailable();
    }
    rx.await.unwrap_or_else(|_| QrScanResult::cancelled())
}

fn has_camera_usage_description() -> bool {
    NSBundle::mainBundle()
        .objectForInfoDictionaryKey(&NSString::from_str("NSCameraUsageDescription"))
        .is_some()
}

fn has_rear_camera() -> bool {
    if cfg!(any(target_abi = "macabi", target_abi = "sim")) {
        return false;
    }
    let Some(device_cls) = AnyClass::get(c"AVCaptureDevice") else {
        return false;
    };
    let video = NSString::from_str(MEDIA_VIDEO);
    // SAFETY: `AVCaptureDevice.defaultDeviceWithMediaType:` is a standard class method.
    let device: Option<Retained<AnyObject>> =
        unsafe { msg_send![device_cls, defaultDeviceWithMediaType: &*video] };
    device.is_some()
}

fn usable() -> bool {
    has_camera_usage_description() && has_rear_camera()
}

fn authorization() -> Option<isize> {
    let device_cls = AnyClass::get(c"AVCaptureDevice")?;
    let video = NSString::from_str(MEDIA_VIDEO);
    // SAFETY: `AVCaptureDevice.authorizationStatusForMediaType:` is a standard class method.
    let status: isize = unsafe { msg_send![device_cls, authorizationStatusForMediaType: &*video] };
    Some(status)
}

fn start(answer: Answer, options: QrScanOptions) {
    if !usable() {
        let _ = answer.send(QrScanResult::unavailable());
        return;
    }
    if ASKING.get() || is_showing() {
        let _ = answer.send(QrScanResult::cancelled());
        return;
    }
    let mtm = MainThreadMarker::new().expect("QR scanner starts on the main thread");
    let Some(top) = nsh_platform_ios::presenting_controller(mtm) else {
        let _ = answer.send(QrScanResult::unavailable());
        return;
    };

    match authorization() {
        Some(AUTH_AUTHORIZED) => show(answer, &top, options),
        Some(AUTH_NOT_DETERMINED) => ask_permission(answer, top, options),
        Some(AUTH_DENIED) | Some(AUTH_RESTRICTED) => {
            let _ = answer.send(QrScanResult::denied());
        }
        _ => {
            let _ = answer.send(QrScanResult::unavailable());
        }
    }
}

fn ask_permission(answer: Answer, top: Retained<UIViewController>, options: QrScanOptions) {
    let Some(device_cls) = AnyClass::get(c"AVCaptureDevice") else {
        let _ = answer.send(QrScanResult::unavailable());
        return;
    };
    let mtm = MainThreadMarker::from(&*top);
    ASKING.set(true);
    let pending = Mutex::new(Some((answer, MainThreadBound::new(top, mtm), options)));
    let handler = RcBlock::new(move |granted: Bool| {
        let Some((answer, top, options)) = pending.lock().unwrap_or_else(|e| e.into_inner()).take()
        else {
            return;
        };
        DispatchQueue::main().exec_async(move || {
            let mtm = MainThreadMarker::new().expect("main queue runs on main thread");
            ASKING.set(false);
            let top = top.into_inner(mtm);
            if granted.as_bool() {
                show(answer, &top, options);
            } else {
                let _ = answer.send(QrScanResult::denied());
            }
        });
    });
    let video = NSString::from_str(MEDIA_VIDEO);
    // SAFETY: AVFoundation invokes the completion handler once on an arbitrary queue.
    unsafe {
        let _: () =
            msg_send![device_cls, requestAccessForMediaType: &*video, completionHandler: &*handler];
    }
}

fn is_showing() -> bool {
    let stale = ACTIVE.with_borrow(|slot| {
        slot.as_ref()
            .filter(|vc| !vc.is_active_or_waiting())
            .cloned()
    });
    if let Some(vc) = stale {
        vc.finish(QrScanResult::cancelled());
    }
    ACTIVE.with_borrow(|slot| slot.is_some())
}

fn show(answer: Answer, top: &UIViewController, options: QrScanOptions) {
    let mtm = MainThreadMarker::from(top);
    let vc = create_scanner_controller(mtm, answer, options);
    ACTIVE.with_borrow_mut(|slot| *slot = Some(vc.clone()));
    let window = top.viewIfLoaded().and_then(|view| view.window());
    present_settled(vc, window, 0);
}

fn present_settled(
    vc: Retained<QrScannerViewController>,
    window: Option<Retained<UIWindow>>,
    waits: u32,
) {
    if !vc.has_pending_answer() {
        return;
    }
    let refused = |vc: &QrScannerViewController| {
        vc.set_waiting(false);
        vc.finish(QrScanResult::unavailable());
    };
    let Some(mut top) = window.as_ref().and_then(|w| w.rootViewController()) else {
        return refused(&vc);
    };
    while let Some(next) = top.presentedViewController() {
        if next.isBeingDismissed() {
            break;
        }
        top = next;
    }
    let moving = match top.presentedViewController() {
        Some(leaving) => Some(leaving),
        None if top.isBeingPresented() => Some(top.clone()),
        None => None,
    };
    if let Some(moving) = moving {
        if waits >= MAX_WAITS {
            return refused(&vc);
        }
        return after_transition(&moving, move || {
            present_settled(vc, window, waits + 1);
        });
    }
    vc.set_waiting(false);
    let vc_as_ui: &UIViewController = &vc;
    top.presentViewController_animated_completion(vc_as_ui, true, None);

    let mtm = MainThreadMarker::from(&*top);
    let vc = MainThreadBound::new(vc, mtm);
    DispatchQueue::main().exec_async(move || {
        let mtm = MainThreadMarker::new().expect("main queue runs on main thread");
        let vc = vc.into_inner(mtm);
        if vc.has_pending_answer() && !vc.is_active_or_waiting() {
            refused(&vc);
        }
    });
}

fn after_transition(moving: &UIViewController, then: impl FnOnce() + 'static) {
    let mtm = MainThreadMarker::from(moving);
    let once = Rc::new(Cell::new(Some(then)));
    let done = {
        let once = once.clone();
        RcBlock::new(
            move |_: NonNull<ProtocolObject<dyn UIViewControllerTransitionCoordinatorContext>>| {
                if let Some(then) = once.take() {
                    later(mtm, 0, then);
                }
            },
        )
    };
    let waiting = moving.transitionCoordinator().is_some_and(|coordinator| {
        coordinator.animateAlongsideTransition_completion(None, Some(&done))
    });
    if !waiting && let Some(then) = once.take() {
        later(mtm, LOOK_MS, then);
    }
}

fn later(mtm: MainThreadMarker, ms: u64, f: impl FnOnce() + 'static) {
    let f = MainThreadBound::new(f, mtm);
    let run = move || {
        let mtm = MainThreadMarker::new().expect("main queue runs on main thread");
        (f.into_inner(mtm))();
    };
    if ms == 0 {
        return DispatchQueue::main().exec_async(run);
    }
    let when = DispatchTime::NOW.time((ms * 1_000_000) as i64);
    if let Err(error) = DispatchQueue::main().after(when, run) {
        log::warn!("ear-scanner: cannot wait for modal transition: {error:?}");
    }
}
