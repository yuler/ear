//! UIKit viewfinder overlay construction, layout, and haptics for the iOS QR scanner.

use std::ffi::c_void;

use objc2::{
    msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Bool, Sel},
    sel,
};
use objc2_core_foundation::{CGFloat, CGPoint, CGRect, CGSize};
use objc2_foundation::NSString;
use objc2_ui_kit::{UIEdgeInsets, UIView};

use super::{QrScanOptions, ios_controller::QrScannerViewController};

const FILL_RULE_EVEN_ODD: &str = "even-odd";
const UI_CONTROL_EVENT_TOUCH_UP_INSIDE: usize = 1 << 6;
const UI_CONTROL_STATE_NORMAL: usize = 0;
const NS_TEXT_ALIGNMENT_CENTER: isize = 1;
const UI_NOTIFICATION_FEEDBACK_SUCCESS: isize = 0;

#[derive(Default)]
pub(super) struct OverlayHandles {
    pub(super) mask_layer: Option<Retained<AnyObject>>,
    pub(super) frame_layer: Option<Retained<AnyObject>>,
    pub(super) cancel_button: Option<Retained<UIView>>,
    pub(super) manual_button: Option<Retained<UIView>>,
    pub(super) title_label: Option<Retained<UIView>>,
    pub(super) hint_label: Option<Retained<UIView>>,
}

pub(super) fn setup_overlay(
    root_view: &UIView,
    target: &QrScannerViewController,
    opts: &QrScanOptions,
) -> OverlayHandles {
    let cancel_text = opts.cancel_label.as_deref().unwrap_or("Cancel");
    let manual_text = opts
        .manual_label
        .as_deref()
        .unwrap_or("Enter Pairing Code Manually");
    let title_text = opts.title_text.as_deref().unwrap_or("Scan QR Code");
    let hint_text = opts
        .hint_text
        .as_deref()
        .unwrap_or("Point the camera at the QR code on Ear Desktop");

    let mut handles = OverlayHandles::default();

    // SAFETY: Standard UIKit / CoreAnimation view and layer creation on the main thread.
    unsafe {
        let root_layer: Retained<AnyObject> = msg_send![root_view, layer];

        if let Some(shape_cls) = AnyClass::get(c"CAShapeLayer") {
            let mask: Retained<AnyObject> = msg_send![shape_cls, layer];
            let fill_rule = NSString::from_str(FILL_RULE_EVEN_ODD);
            let _: () = msg_send![&*mask, setFillRule: &*fill_rule];
            if let Some(dim) = ui_color_rgba(0.0, 0.0, 0.0, 0.52) {
                let cg: *const c_void = msg_send![&*dim, CGColor];
                let _: () = msg_send![&*mask, setFillColor: cg];
            }
            let _: () = msg_send![&*root_layer, addSublayer: &*mask];
            handles.mask_layer = Some(mask);

            let frame: Retained<AnyObject> = msg_send![shape_cls, layer];
            if let Some(clear) = ui_color_rgba(0.0, 0.0, 0.0, 0.0) {
                let cg: *const c_void = msg_send![&*clear, CGColor];
                let _: () = msg_send![&*frame, setFillColor: cg];
            }
            if let Some(white) = ui_color_rgba(1.0, 1.0, 1.0, 0.92) {
                let cg: *const c_void = msg_send![&*white, CGColor];
                let _: () = msg_send![&*frame, setStrokeColor: cg];
            }
            let _: () = msg_send![&*frame, setLineWidth: 3.0 as CGFloat];
            let _: () = msg_send![&*root_layer, addSublayer: &*frame];
            handles.frame_layer = Some(frame);
        }

        if let Some(btn) = make_pill_button(cancel_text, 15.0, target, sel!(onCancelPressed)) {
            let _: () = msg_send![root_view, addSubview: &*btn];
            handles.cancel_button = Some(btn);
        }

        if let Some(btn) = make_pill_button(manual_text, 15.0, target, sel!(onManualPressed)) {
            let _: () = msg_send![root_view, addSubview: &*btn];
            handles.manual_button = Some(btn);
        }

        if let Some(lbl) = make_label(title_text, 17.0, true, 1.0) {
            let _: () = msg_send![root_view, addSubview: &*lbl];
            handles.title_label = Some(lbl);
        }

        if let Some(lbl) = make_label(hint_text, 14.0, false, 0.88) {
            let _: () = msg_send![root_view, addSubview: &*lbl];
            handles.hint_label = Some(lbl);
        }
    }

    handles
}

pub(super) fn layout_overlay(
    root_view: &UIView,
    preview_layer: Option<&AnyObject>,
    handles: &OverlayHandles,
) {
    // SAFETY: Layout geometry updates run on the main thread from `viewDidLayoutSubviews`.
    unsafe {
        let bounds: CGRect = msg_send![root_view, bounds];
        let insets: UIEdgeInsets = msg_send![root_view, safeAreaInsets];
        let w = bounds.size.width;
        let h = bounds.size.height;
        if w <= 0.0 || h <= 0.0 {
            return;
        }

        if let Some(preview) = preview_layer {
            let _: () = msg_send![preview, setFrame: bounds];
        }

        let box_size = (w.min(h) * 0.66).clamp(210.0, 290.0);
        let box_x = (w - box_size) / 2.0;
        let box_y = ((h - box_size) / 2.0 - 20.0).max(insets.top + 88.0);
        let box_rect = CGRect::new(CGPoint::new(box_x, box_y), CGSize::new(box_size, box_size));

        if let Some(bezier_cls) = AnyClass::get(c"UIBezierPath") {
            let cutout: Retained<AnyObject> = msg_send![
                bezier_cls,
                bezierPathWithRoundedRect: box_rect,
                cornerRadius: 20.0 as CGFloat
            ];
            if let Some(mask) = handles.mask_layer.as_ref() {
                let outer: Retained<AnyObject> = msg_send![bezier_cls, bezierPathWithRect: bounds];
                let _: () = msg_send![&*outer, appendPath: &*cutout];
                let cg_path: *const c_void = msg_send![&*outer, CGPath];
                let _: () = msg_send![&**mask, setFrame: bounds];
                let _: () = msg_send![&**mask, setPath: cg_path];
            }
            if let Some(frame) = handles.frame_layer.as_ref() {
                let cg_path: *const c_void = msg_send![&*cutout, CGPath];
                let _: () = msg_send![&**frame, setFrame: bounds];
                let _: () = msg_send![&**frame, setPath: cg_path];
            }
        }

        let top_y = insets.top + 12.0;
        if let Some(cancel) = handles.cancel_button.as_ref() {
            let rect = CGRect::new(CGPoint::new(16.0, top_y), CGSize::new(82.0, 38.0));
            let _: () = msg_send![&**cancel, setFrame: rect];
        }
        if let Some(title) = handles.title_label.as_ref() {
            let rect = CGRect::new(
                CGPoint::new(104.0, top_y),
                CGSize::new((w - 208.0).max(80.0), 38.0),
            );
            let _: () = msg_send![&**title, setFrame: rect];
        }
        if let Some(hint) = handles.hint_label.as_ref() {
            let rect = CGRect::new(
                CGPoint::new(28.0, box_y + box_size + 22.0),
                CGSize::new((w - 56.0).max(120.0), 54.0),
            );
            let _: () = msg_send![&**hint, setFrame: rect];
        }
        if let Some(manual) = handles.manual_button.as_ref() {
            let btn_w = (w - 48.0).min(300.0).max(180.0);
            let btn_h = 48.0;
            let btn_y = (h - insets.bottom - btn_h - 24.0).max(box_y + box_size + 84.0);
            let rect = CGRect::new(
                CGPoint::new((w - btn_w) / 2.0, btn_y),
                CGSize::new(btn_w, btn_h),
            );
            let _: () = msg_send![&**manual, setFrame: rect];
        }
    }
}

pub(super) unsafe fn ui_color_rgba(
    r: CGFloat,
    g: CGFloat,
    b: CGFloat,
    a: CGFloat,
) -> Option<Retained<AnyObject>> {
    let cls = AnyClass::get(c"UIColor")?;
    let color: Retained<AnyObject> =
        unsafe { msg_send![cls, colorWithRed: r, green: g, blue: b, alpha: a] };
    Some(color)
}

unsafe fn make_pill_button(
    title: &str,
    font_size: CGFloat,
    target: &QrScannerViewController,
    action: Sel,
) -> Option<Retained<UIView>> {
    let btn_cls = AnyClass::get(c"UIButton")?;
    let font_cls = AnyClass::get(c"UIFont")?;
    unsafe {
        let btn: Retained<AnyObject> = msg_send![btn_cls, buttonWithType: 1isize];
        let ns_title = NSString::from_str(title);
        let _: () = msg_send![&*btn, setTitle: &*ns_title, forState: UI_CONTROL_STATE_NORMAL];
        if let Some(white) = ui_color_rgba(1.0, 1.0, 1.0, 1.0) {
            let _: () =
                msg_send![&*btn, setTitleColor: &*white, forState: UI_CONTROL_STATE_NORMAL];
        }
        if let Some(bg) = ui_color_rgba(0.11, 0.11, 0.12, 0.78) {
            let _: () = msg_send![&*btn, setBackgroundColor: &*bg];
        }
        let title_label: Option<Retained<AnyObject>> = msg_send![&*btn, titleLabel];
        if let Some(tl) = title_label {
            let font: Retained<AnyObject> =
                msg_send![font_cls, systemFontOfSize: font_size, weight: 0.3 as CGFloat];
            let _: () = msg_send![&*tl, setFont: &*font];
        }
        let layer: Retained<AnyObject> = msg_send![&*btn, layer];
        let _: () = msg_send![&*layer, setCornerRadius: 19.0 as CGFloat];
        let _: () = msg_send![&*layer, setMasksToBounds: Bool::YES];
        let _: () = msg_send![
            &*btn,
            addTarget: target,
            action: action,
            forControlEvents: UI_CONTROL_EVENT_TOUCH_UP_INSIDE
        ];
        Some(Retained::cast_unchecked(btn))
    }
}

unsafe fn make_label(
    text: &str,
    font_size: CGFloat,
    bold: bool,
    alpha: CGFloat,
) -> Option<Retained<UIView>> {
    let lbl_cls = AnyClass::get(c"UILabel")?;
    let font_cls = AnyClass::get(c"UIFont")?;
    unsafe {
        let lbl: Retained<AnyObject> = msg_send![lbl_cls, new];
        let ns_text = NSString::from_str(text);
        let _: () = msg_send![&*lbl, setText: &*ns_text];
        let _: () = msg_send![&*lbl, setTextAlignment: NS_TEXT_ALIGNMENT_CENTER];
        let _: () = msg_send![&*lbl, setNumberOfLines: 0isize];
        let weight: CGFloat = if bold { 0.3 } else { 0.0 };
        let font: Retained<AnyObject> =
            msg_send![font_cls, systemFontOfSize: font_size, weight: weight];
        let _: () = msg_send![&*lbl, setFont: &*font];
        if let Some(color) = ui_color_rgba(1.0, 1.0, 1.0, alpha) {
            let _: () = msg_send![&*lbl, setTextColor: &*color];
        }
        Some(Retained::cast_unchecked(lbl))
    }
}

pub(super) fn trigger_success_haptic() {
    let Some(cls) = AnyClass::get(c"UINotificationFeedbackGenerator") else {
        return;
    };
    unsafe {
        let feedback: Retained<AnyObject> = msg_send![cls, new];
        let _: () = msg_send![&*feedback, prepare];
        let _: () =
            msg_send![&*feedback, notificationOccurred: UI_NOTIFICATION_FEEDBACK_SUCCESS];
    }
}
