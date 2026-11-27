//! Native iOS `UIViewController` and `AVCaptureMetadataOutput` delegate for live QR scanning.

use std::{
    cell::{Cell, RefCell},
    ffi::c_void,
    ptr,
};

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchQueueAttr, DispatchRetained};
use objc2::{
    DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Bool},
};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_ui_kit::{UIModalPresentationStyle, UIResponder, UIView, UIViewController};

use super::{
    QrScanOptions, QrScanResult,
    ios::{ACTIVE, Answer, MEDIA_VIDEO},
    ios_overlay::{OverlayHandles, layout_overlay, setup_overlay, trigger_success_haptic, ui_color_rgba},
};

const QR_METADATA_TYPE: &str = "org.iso.QRCode";
const VIDEO_GRAVITY_RESIZE_ASPECT_FILL: &str = "AVLayerVideoGravityResizeAspectFill";
const UI_STATUS_BAR_STYLE_LIGHT: isize = 1;

/// Wrapper allowing an `AVCaptureSession` to be started/stopped on a dedicated serial queue.
struct SendObj(Retained<AnyObject>);

impl SendObj {
    fn as_obj(&self) -> &AnyObject {
        &self.0
    }
}

// SAFETY: `AVCaptureSession` is explicitly designed by Apple to be started and stopped
// from a dedicated serial session queue off the main thread.
unsafe impl Send for SendObj {}

struct MetadataDelegateIvars {
    on_code: RefCell<Option<Box<dyn FnMut(String)>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = MetadataDelegateIvars]
    struct QrMetadataDelegate;

    unsafe impl NSObjectProtocol for QrMetadataDelegate {}

    impl QrMetadataDelegate {
        #[unsafe(method(captureOutput:didOutputMetadataObjects:fromConnection:))]
        fn did_output_metadata(
            &self,
            _output: &AnyObject,
            objects: &NSArray<AnyObject>,
            _connection: &AnyObject,
        ) {
            let count = objects.count();
            for i in 0..count {
                let obj = objects.objectAtIndex(i);
                // SAFETY: `AVMetadataMachineReadableCodeObject.stringValue` returns `NSString?`.
                let value: Option<Retained<NSString>> = unsafe { msg_send![&*obj, stringValue] };
                if let Some(ns_str) = value {
                    let s = ns_str.to_string();
                    if !s.trim().is_empty() {
                        if let Some(cb) = self.ivars().on_code.borrow_mut().as_mut() {
                            cb(s);
                        }
                        break;
                    }
                }
            }
        }
    }
);

pub(super) struct ScannerVcIvars {
    answer: RefCell<Option<Answer>>,
    options: RefCell<QrScanOptions>,
    waiting: Cell<bool>,
    dismissing: Cell<bool>,
    session: RefCell<Option<Retained<AnyObject>>>,
    session_queue: DispatchRetained<DispatchQueue>,
    metadata_delegate: RefCell<Option<Retained<QrMetadataDelegate>>>,
    preview_layer: RefCell<Option<Retained<AnyObject>>>,
    overlay: RefCell<OverlayHandles>,
}

define_class!(
    #[unsafe(super(UIViewController, UIResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = ScannerVcIvars]
    pub(super) struct QrScannerViewController;

    unsafe impl NSObjectProtocol for QrScannerViewController {}

    impl QrScannerViewController {
        #[unsafe(method(viewDidLoad))]
        fn view_did_load(&self) {
            // SAFETY: Calls superclass `-[UIViewController viewDidLoad]`.
            unsafe {
                let _: () = msg_send![super(self), viewDidLoad];
            }
            self.setup_ui_and_camera();
        }

        #[unsafe(method(viewDidLayoutSubviews))]
        fn view_did_layout_subviews(&self) {
            // SAFETY: Calls superclass `-[UIViewController viewDidLayoutSubviews]`.
            unsafe {
                let _: () = msg_send![super(self), viewDidLayoutSubviews];
            }
            self.update_layout();
        }

        #[unsafe(method(viewDidDisappear:))]
        fn view_did_disappear(&self, animated: Bool) {
            // SAFETY: Calls superclass `-[UIViewController viewDidDisappear:]`.
            unsafe {
                let _: () = msg_send![super(self), viewDidDisappear: animated];
            }
            self.stop_session();
            if !self.ivars().dismissing.get() && self.has_pending_answer() {
                self.finish(QrScanResult::cancelled());
            }
        }

        #[unsafe(method(preferredStatusBarStyle))]
        fn preferred_status_bar_style(&self) -> isize {
            UI_STATUS_BAR_STYLE_LIGHT
        }

        #[unsafe(method(onCancelPressed))]
        fn on_cancel_pressed(&self) {
            self.dismiss_with(QrScanResult::cancelled());
        }

        #[unsafe(method(onManualPressed))]
        fn on_manual_pressed(&self) {
            self.dismiss_with(QrScanResult::manual());
        }
    }
);

pub(super) fn create_scanner_controller(
    mtm: MainThreadMarker,
    answer: Answer,
    options: QrScanOptions,
) -> Retained<QrScannerViewController> {
    let session_queue = DispatchQueue::new("dev.yuler.ear.qr-session", DispatchQueueAttr::SERIAL);
    let this = QrScannerViewController::alloc(mtm).set_ivars(ScannerVcIvars {
        answer: RefCell::new(Some(answer)),
        options: RefCell::new(options),
        waiting: Cell::new(true),
        dismissing: Cell::new(false),
        session: RefCell::new(None),
        session_queue,
        metadata_delegate: RefCell::new(None),
        preview_layer: RefCell::new(None),
        overlay: RefCell::new(OverlayHandles::default()),
    });
    // SAFETY: `UIViewController`'s designated initializer `initWithNibName:bundle:`.
    let vc: Retained<QrScannerViewController> = unsafe {
        msg_send![super(this), initWithNibName: Option::<&NSString>::None, bundle: Option::<&NSObject>::None]
    };
    vc.setModalPresentationStyle(UIModalPresentationStyle::FullScreen);
    vc
}

impl QrScannerViewController {
    pub(super) fn has_pending_answer(&self) -> bool {
        self.ivars().answer.borrow().is_some()
    }

    pub(super) fn set_waiting(&self, waiting: bool) {
        self.ivars().waiting.set(waiting);
    }

    pub(super) fn is_active_or_waiting(&self) -> bool {
        if self.ivars().waiting.get() {
            return true;
        }
        // SAFETY: Standard `UIViewController.presentingViewController` read on main thread.
        let presenting: Option<Retained<UIViewController>> =
            unsafe { msg_send![self, presentingViewController] };
        presenting.is_some()
    }

    pub(super) fn finish(&self, result: QrScanResult) {
        self.stop_session();
        if let Some(answer) = self.ivars().answer.borrow_mut().take() {
            let _ = answer.send(result);
        }
        self.ivars().metadata_delegate.borrow_mut().take();
        let this: *const Self = self;
        ACTIVE.with_borrow_mut(|slot| {
            if slot.as_ref().is_some_and(|vc| std::ptr::eq(&**vc, this)) {
                *slot = None;
            }
        });
    }

    fn dismiss_with(&self, result: QrScanResult) {
        if self.ivars().dismissing.replace(true) || !self.has_pending_answer() {
            return;
        }
        self.stop_session();
        self.ivars().metadata_delegate.borrow_mut().take();

        // SAFETY: Standard `UIViewController.presentingViewController` read on main thread.
        let presenting: Option<Retained<UIViewController>> =
            unsafe { msg_send![self, presentingViewController] };
        if presenting.is_none() {
            self.finish(result);
            return;
        }

        let self_ptr = self as *const QrScannerViewController as usize;
        let pending = Cell::new(Some(result));
        let completion = RcBlock::new(move || {
            let Some(result) = pending.take() else {
                return;
            };
            let target = ACTIVE.with_borrow(|slot| {
                slot.as_ref()
                    .filter(|vc| (&**vc as *const QrScannerViewController as usize) == self_ptr)
                    .cloned()
            });
            if let Some(vc) = target {
                vc.finish(result);
            }
        });
        let vc: &UIViewController = self;
        vc.dismissViewControllerAnimated_completion(true, Some(&completion));
    }

    fn stop_session(&self) {
        if let Some(session) = self.ivars().session.borrow_mut().take() {
            let send = SendObj(session);
            self.ivars().session_queue.exec_async(move || {
                // SAFETY: `AVCaptureSession.stopRunning` runs on our serial session queue.
                unsafe {
                    let _: () = msg_send![send.as_obj(), stopRunning];
                }
            });
        }
    }

    fn handle_scanned(&self, code: String) {
        if self.ivars().dismissing.get() || !self.has_pending_answer() {
            return;
        }
        self.stop_session();

        if let Some(frame_layer) = self.ivars().overlay.borrow().frame_layer.as_ref() {
            unsafe {
                if let Some(green) = ui_color_rgba(0.188, 0.820, 0.345, 1.0) {
                    let cg: *const c_void = msg_send![&*green, CGColor];
                    let _: () = msg_send![&**frame_layer, setStrokeColor: cg];
                }
            }
        }
        trigger_success_haptic();
        self.dismiss_with(QrScanResult::scanned(code));
    }

    fn setup_ui_and_camera(&self) {
        let Some(root_view) = self.view() else {
            self.finish(QrScanResult::unavailable());
            return;
        };

        unsafe {
            if let Some(black) = ui_color_rgba(0.0, 0.0, 0.0, 1.0) {
                let _: () = msg_send![&*root_view, setBackgroundColor: &*black];
            }
        }

        if !self.setup_capture_session(&root_view) {
            self.dismiss_with(QrScanResult::unavailable());
            return;
        }

        let opts = self.ivars().options.borrow().clone();
        *self.ivars().overlay.borrow_mut() = setup_overlay(&root_view, self, &opts);
        self.update_layout();
    }

    fn update_layout(&self) {
        let Some(root_view) = self.view() else {
            return;
        };
        let preview = self.ivars().preview_layer.borrow();
        let overlay = self.ivars().overlay.borrow();
        layout_overlay(&root_view, preview.as_deref(), &overlay);
    }

    fn setup_capture_session(&self, root_view: &UIView) -> bool {
        let (Some(session_cls), Some(device_cls), Some(input_cls), Some(output_cls), Some(preview_cls)) = (
            AnyClass::get(c"AVCaptureSession"),
            AnyClass::get(c"AVCaptureDevice"),
            AnyClass::get(c"AVCaptureDeviceInput"),
            AnyClass::get(c"AVCaptureMetadataOutput"),
            AnyClass::get(c"AVCaptureVideoPreviewLayer"),
        ) else {
            return false;
        };

        let mtm = MainThreadMarker::from(self);
        let video = NSString::from_str(MEDIA_VIDEO);

        // SAFETY: Standard AVFoundation setup on the main thread; session start runs on serial queue.
        unsafe {
            let Some(device): Option<Retained<AnyObject>> =
                msg_send![device_cls, defaultDeviceWithMediaType: &*video]
            else {
                return false;
            };

            let mut err: *mut NSError = ptr::null_mut();
            let Some(input): Option<Retained<AnyObject>> =
                msg_send![input_cls, deviceInputWithDevice: &*device, error: &mut err]
            else {
                return false;
            };

            let session: Retained<AnyObject> = msg_send![session_cls, new];
            let can_in: Bool = msg_send![&*session, canAddInput: &*input];
            if !can_in.as_bool() {
                return false;
            }
            let _: () = msg_send![&*session, addInput: &*input];

            let output: Retained<AnyObject> = msg_send![output_cls, new];
            let can_out: Bool = msg_send![&*session, canAddOutput: &*output];
            if !can_out.as_bool() {
                return false;
            }
            let _: () = msg_send![&*session, addOutput: &*output];

            let self_weak_ptr = self as *const QrScannerViewController as usize;
            let delegate = QrMetadataDelegate::alloc(mtm).set_ivars(MetadataDelegateIvars {
                on_code: RefCell::new(Some(Box::new(move |code: String| {
                    ACTIVE.with_borrow(|slot| {
                        if let Some(vc) = slot.as_ref() {
                            if (&**vc as *const QrScannerViewController as usize) == self_weak_ptr {
                                vc.handle_scanned(code);
                            }
                        }
                    });
                }))),
            });
            let delegate: Retained<QrMetadataDelegate> = msg_send![super(delegate), init];

            let main_queue: *const AnyObject = ptr::from_ref(DispatchQueue::main()).cast();
            let _: () =
                msg_send![&*output, setMetadataObjectsDelegate: &*delegate, queue: main_queue];

            let qr_type = NSString::from_str(QR_METADATA_TYPE);
            let types = NSArray::from_retained_slice(&[qr_type]);
            let _: () = msg_send![&*output, setMetadataObjectTypes: &*types];

            let preview_layer: Retained<AnyObject> =
                msg_send![preview_cls, layerWithSession: &*session];
            let gravity = NSString::from_str(VIDEO_GRAVITY_RESIZE_ASPECT_FILL);
            let _: () = msg_send![&*preview_layer, setVideoGravity: &*gravity];
            let root_layer: Retained<AnyObject> = msg_send![root_view, layer];
            let _: () = msg_send![&*root_layer, addSublayer: &*preview_layer];

            *self.ivars().metadata_delegate.borrow_mut() = Some(delegate);
            *self.ivars().preview_layer.borrow_mut() = Some(preview_layer);
            *self.ivars().session.borrow_mut() = Some(session.clone());

            let send = SendObj(session);
            self.ivars().session_queue.exec_async(move || {
                let _: () = msg_send![send.as_obj(), startRunning];
            });
        }

        true
    }
}
