//! Panic-guarding and per-thread last-error state for the C ABI.
//!
//! Every exported function funnels its body through [`ffi_guard`], so a Rust
//! panic raised synchronously inside the call becomes an error return
//! instead of unwinding across the `extern "C"` frame (which would be
//! undefined behaviour on the C++ side of the boundary).

use std::cell::RefCell;
use std::ffi::CString;
use std::panic::{self, AssertUnwindSafe};

/// The error codes written into `juicio_native_last_error`'s `out_code`
/// output parameter. `None` (0) means no error is recorded for the calling
/// thread.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JuicioErrorCode {
    None = 0,
    InvalidArgument = 1,
    Internal = 2,
}

thread_local! {
    static LAST_ERROR: RefCell<Option<(JuicioErrorCode, CString)>> = const { RefCell::new(None) };
}

/// Records `code`/`message` as the calling thread's last error, overwriting
/// whatever was recorded before. `message` is sanitized if it happens to
/// contain an interior NUL byte, which would otherwise make `CString::new`
/// fail.
pub(crate) fn set_last_error(code: JuicioErrorCode, message: impl Into<Vec<u8>>) {
    let message = CString::new(message)
        .unwrap_or_else(|_| CString::new("<error message contained a NUL byte>").unwrap());
    LAST_ERROR.with(|cell| *cell.borrow_mut() = Some((code, message)));
}

/// Clears the calling thread's last error. Called at the start of every
/// fallible exported function so a stale error from a previous call is never
/// mistaken for one from the current call.
pub(crate) fn clear_last_error() {
    LAST_ERROR.with(|cell| *cell.borrow_mut() = None);
}

/// Reads the calling thread's last error, if any is currently recorded.
pub(crate) fn with_last_error<T>(f: impl FnOnce(Option<(JuicioErrorCode, &CString)>) -> T) -> T {
    LAST_ERROR.with(|cell| {
        f(cell
            .borrow()
            .as_ref()
            .map(|(code, message)| (*code, message)))
    })
}

/// Runs `f`, catching any panic it raises and turning it into `fallback` plus
/// a recorded [`JuicioErrorCode::Internal`] last error — so a bug in this
/// crate's own logic becomes an ordinary error return rather than unwinding
/// across the `extern "C"` frame and aborting the caller's process.
pub(crate) fn ffi_guard<T>(fallback: T, f: impl FnOnce() -> T) -> T {
    match panic::catch_unwind(AssertUnwindSafe(f)) {
        Ok(value) => value,
        Err(payload) => {
            set_last_error(
                JuicioErrorCode::Internal,
                format!("internal panic: {}", panic_message(&payload)),
            );
            fallback
        }
    }
}

/// Best-effort extraction of a human-readable message from a panic payload.
/// `std::panic!` payloads are almost always `&str` or `String`; anything else
/// (a custom payload passed to `panic_any`) falls back to a fixed message
/// rather than failing to report anything at all.
pub(crate) fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "non-string panic payload".to_string()
    }
}
