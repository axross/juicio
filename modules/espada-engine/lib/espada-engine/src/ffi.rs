//! the crate's C ABI: a handle-based job whose progress and completion are
//! both pushed through caller-supplied callbacks, so nothing on the caller's
//! side ever needs to poll.
//!
//! every exported function funnels through [`ffi_guard`], so a panic raised
//! synchronously inside the call itself becomes an error return rather than
//! unwinding across the `extern "C"` frame. a panic raised on a job's
//! *worker* thread, after `espada_engine_start` has already returned, is a
//! separate path: it is caught in [`crate::job`] and reported through the
//! settle callback as [`EspadaStatus::Error`] instead.

use std::ffi::{c_char, c_void};

use crate::error::{clear_last_error, ffi_guard, set_last_error, with_last_error, EspadaErrorCode};
use crate::job;

pub use crate::job::EspadaJob;

/// called from a job's worker thread, at most roughly ten times per second,
/// with the job's completion fraction in `[0.0, 1.0]`.
pub type EspadaProgressCallback = extern "C" fn(progress: f64, user_data: *mut c_void);

/// called exactly once per job, from whichever worker thread finishes last,
/// with the job's outcome. `result` is meaningful only when `status` is
/// [`EspadaStatus::Success`] (and, informationally, [`EspadaStatus::Cancelled`]);
/// it crosses as `f64` because `u64` is not exactly representable in
/// JavaScript past 2^53. `message` is non-null only when `status` is
/// [`EspadaStatus::Error`], and is valid only for the duration of the call.
pub type EspadaSettleCallback = extern "C" fn(
    status: EspadaStatus,
    result: f64,
    message: *const c_char,
    user_data: *mut c_void,
);

/// a job's outcome, passed to the settle callback. distinct variants for
/// cancellation and for an internal fault, so a caller never mistakes one
/// for an ordinary success.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EspadaStatus {
    Success = 0,
    Cancelled = 1,
    Error = 2,
}

/// starts a job counting primes below `limit` by trial division, split into
/// a fixed number of shards pulled off one atomic cursor by Rust-owned
/// worker threads.
///
/// spawns its worker threads and returns immediately — the calling thread is
/// never blocked for any part of the computation. `thread_count` of zero, or
/// above the host's core count, is clamped rather than rejected. returns
/// null on immediate failure (`progress_cb` or `settle_cb` is null); call
/// `espada_engine_last_error` on this same thread for why.
#[no_mangle]
pub extern "C" fn espada_engine_start(
    limit: u64,
    thread_count: u32,
    progress_cb: Option<EspadaProgressCallback>,
    settle_cb: Option<EspadaSettleCallback>,
    user_data: *mut c_void,
) -> *mut EspadaJob {
    ffi_guard(std::ptr::null_mut(), || {
        clear_last_error();
        let (progress_cb, settle_cb) = match (progress_cb, settle_cb) {
            (Some(progress_cb), Some(settle_cb)) => (progress_cb, settle_cb),
            _ => {
                set_last_error(
                    EspadaErrorCode::InvalidArgument,
                    "progress_cb and settle_cb must both be non-null",
                );
                return std::ptr::null_mut();
            }
        };
        job::start(limit, thread_count, progress_cb, settle_cb, user_data)
    })
}

/// requests cancellation of a running job. sets an atomic flag the job's
/// workers observe between shards; does not join them, since they wind down
/// on their own and this call must never block. the job still settles
/// exactly once, as [`EspadaStatus::Cancelled`], through its settle
/// callback — this function has no separate completion signal of its own.
///
/// returns 0 on success, or a nonzero [`EspadaErrorCode`] if `job` is null.
///
/// # Safety
///
/// `job` must be null or a handle returned by `espada_engine_start` that has
/// not yet been passed to `espada_engine_free`.
#[no_mangle]
pub unsafe extern "C" fn espada_engine_cancel(job: *mut EspadaJob) -> i32 {
    ffi_guard(EspadaErrorCode::Internal as i32, || {
        clear_last_error();
        if job.is_null() {
            set_last_error(EspadaErrorCode::InvalidArgument, "job must not be null");
            return EspadaErrorCode::InvalidArgument as i32;
        }
        job::cancel(unsafe { &*job });
        0
    })
}

/// releases a job handle. safe to call after the job has settled and safe to
/// call after cancelling it — in both cases this only ever drops this
/// crate's own reference to the job's shared state; any worker thread still
/// running keeps its own reference and keeps running until it finishes on
/// its own. a null `job` is a no-op.
///
/// # Safety
///
/// `job` must be null or a handle returned by `espada_engine_start`, and
/// must be passed to this function exactly once — calling it again on an
/// already-freed handle is undefined behaviour, the same contract as C's own
/// `free`.
#[no_mangle]
pub unsafe extern "C" fn espada_engine_free(job: *mut EspadaJob) {
    ffi_guard((), || {
        if job.is_null() {
            return;
        }
        drop(unsafe { Box::from_raw(job) });
    })
}

/// returns the calling thread's last recorded error message, or null if no
/// espada-engine call on this thread has failed since the last one that did.
/// the returned pointer is valid only until the next `espada_engine_*` call
/// on the same thread — copy it before making another call.
///
/// if `out_code` is non-null, writes the error's [`EspadaErrorCode`] through
/// it ([`EspadaErrorCode::None`] when there is no error).
///
/// # Safety
///
/// `out_code` must be null or a valid pointer to a writable `i32`.
#[no_mangle]
pub unsafe extern "C" fn espada_engine_last_error(out_code: *mut i32) -> *const c_char {
    ffi_guard(std::ptr::null(), || {
        with_last_error(|error| match error {
            Some((code, message)) => {
                if !out_code.is_null() {
                    unsafe { *out_code = code as i32 };
                }
                message.as_ptr()
            }
            None => {
                if !out_code.is_null() {
                    unsafe { *out_code = EspadaErrorCode::None as i32 };
                }
                std::ptr::null()
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workload;
    use std::ffi::CStr;
    use std::sync::{Condvar, Mutex};
    use std::time::{Duration, Instant};

    /// fast enough (well under a second, even unoptimized) to run at several
    /// thread counts without making the suite slow — used wherever a test
    /// only needs *a* correct, thread-count-independent result, not the
    /// specific value chosen for the demo workload's own timing target.
    const QUICK_LIMIT: u64 = 300_000;

    struct Outcome {
        settled: Mutex<Option<(EspadaStatus, f64, Option<String>)>>,
        condvar: Condvar,
        progress: Mutex<Vec<f64>>,
    }

    impl Outcome {
        fn new() -> Self {
            Outcome {
                settled: Mutex::new(None),
                condvar: Condvar::new(),
                progress: Mutex::new(Vec::new()),
            }
        }

        /// blocks the calling thread until the job settles, or panics if it
        /// hasn't within `timeout` — this crate's own tests are not allowed
        /// to hang forever on a bug that stops a job from ever settling.
        fn wait_for_settlement(&self, timeout: Duration) -> (EspadaStatus, f64, Option<String>) {
            let guard = self.settled.lock().unwrap();
            let (guard, result) = self
                .condvar
                .wait_timeout_while(guard, timeout, |settled| settled.is_none())
                .unwrap();
            assert!(!result.timed_out(), "job did not settle within {timeout:?}");
            guard.clone().expect("settled but recorded no outcome")
        }
    }

    extern "C" fn record_progress(progress: f64, user_data: *mut c_void) {
        let outcome = unsafe { &*(user_data as *const Outcome) };
        outcome.progress.lock().unwrap().push(progress);
    }

    extern "C" fn record_settlement(
        status: EspadaStatus,
        result: f64,
        message: *const c_char,
        user_data: *mut c_void,
    ) {
        let outcome = unsafe { &*(user_data as *const Outcome) };
        let message = if message.is_null() {
            None
        } else {
            Some(
                unsafe { CStr::from_ptr(message) }
                    .to_string_lossy()
                    .into_owned(),
            )
        };
        *outcome.settled.lock().unwrap() = Some((status, result, message));
        outcome.condvar.notify_all();
    }

    /// starts a job through the real `extern "C"` signature and blocks (with
    /// a generous timeout) until it settles, returning the settlement and
    /// every progress fraction observed along the way.
    fn run_job(limit: u64, thread_count: u32) -> (EspadaStatus, f64, Option<String>, Vec<f64>) {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let job = espada_engine_start(
            limit,
            thread_count,
            Some(record_progress),
            Some(record_settlement),
            user_data,
        );
        assert!(!job.is_null(), "start unexpectedly returned null");
        let (status, result, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        unsafe { espada_engine_free(job) };
        let progress = outcome.progress.lock().unwrap().clone();
        (status, result, message, progress)
    }

    #[test]
    fn start_returns_immediately_and_settles_with_the_reference_value_for_the_chosen_limit() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;

        let before_start = Instant::now();
        let job = espada_engine_start(
            workload::DEMO_LIMIT,
            0, // let it use every available core, like the real demo would
            Some(record_progress),
            Some(record_settlement),
            user_data,
        );
        let start_call_duration = before_start.elapsed();
        assert!(!job.is_null());
        assert!(
            start_call_duration < Duration::from_millis(200),
            "espada_engine_start blocked the calling thread for {start_call_duration:?}"
        );

        let job_started_at = Instant::now();
        let (status, result, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        let job_duration = job_started_at.elapsed();
        unsafe { espada_engine_free(job) };

        assert_eq!(status, EspadaStatus::Success);
        assert_eq!(message, None);
        // cross-validated against an independent sieve in workload's own
        // tests: see DEMO_LIMIT's doc comment.
        assert_eq!(result, 1_270_607.0);

        let progress = outcome.progress.lock().unwrap();
        assert!(
            !progress.is_empty(),
            "expected at least one progress callback"
        );
        assert!(progress.iter().all(|&p| (0.0..=1.0).contains(&p)));
        // "roughly ten callbacks per second", plus generous slack for the
        // always-emitted final callback and for scheduling jitter.
        let max_expected = job_duration.as_secs_f64() * 10.0 + 5.0;
        assert!(
            (progress.len() as f64) <= max_expected,
            "got {} progress callbacks over {job_duration:?}, expected at most ~{max_expected}",
            progress.len()
        );
    }

    #[test]
    fn results_are_identical_at_several_different_thread_counts() {
        let reference = workload::count_primes_in_range(0, QUICK_LIMIT);
        for &thread_count in &[1u32, 2, 4, 0, 1_000] {
            let (status, result, message, _) = run_job(QUICK_LIMIT, thread_count);
            assert_eq!(status, EspadaStatus::Success);
            assert_eq!(message, None);
            assert_eq!(
                result, reference as f64,
                "thread_count {thread_count} produced a different result"
            );
        }
    }

    #[test]
    fn cancelling_a_running_job_settles_it_as_cancelled_not_success_or_error() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        // single-threaded and large enough that cancelling immediately after
        // start reliably lands well before the job would finish on its own.
        let job = espada_engine_start(
            5_000_000,
            1,
            Some(record_progress),
            Some(record_settlement),
            user_data,
        );
        assert!(!job.is_null());

        let cancel_result = unsafe { espada_engine_cancel(job) };
        assert_eq!(cancel_result, 0);

        let (status, _result, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        unsafe { espada_engine_free(job) };

        assert_eq!(status, EspadaStatus::Cancelled);
        assert_eq!(message, None);
    }

    #[test]
    fn cancelling_a_null_job_returns_an_error_without_crashing() {
        let mut code = -1;
        let result = unsafe { espada_engine_cancel(std::ptr::null_mut()) };
        assert_ne!(result, 0);
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
        assert!(!message.is_null());
    }

    #[test]
    fn freeing_a_null_job_is_a_safe_no_op() {
        unsafe { espada_engine_free(std::ptr::null_mut()) };
    }

    #[test]
    fn starting_with_a_null_callback_returns_an_error_and_a_message_instead_of_panicking() {
        let job = espada_engine_start(
            QUICK_LIMIT,
            1,
            None,
            Some(record_settlement),
            std::ptr::null_mut(),
        );
        assert!(job.is_null());

        let mut code = -1;
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
        assert!(!message.is_null());
        let message = unsafe { CStr::from_ptr(message) }.to_string_lossy();
        assert!(!message.is_empty());
    }

    #[test]
    fn last_error_reports_no_error_on_a_fresh_thread() {
        let mut code = -1;
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert!(message.is_null());
        assert_eq!(code, EspadaErrorCode::None as i32);
    }

    #[test]
    fn last_error_accepts_a_null_out_code_pointer() {
        // trigger an error first so there is something to (not) report.
        let _ = espada_engine_start(QUICK_LIMIT, 1, None, None, std::ptr::null_mut());
        let message = unsafe { espada_engine_last_error(std::ptr::null_mut()) };
        assert!(!message.is_null());
    }

    #[test]
    fn a_panic_inside_a_job_settles_it_as_an_error_instead_of_aborting_the_process() {
        let (status, result, message, _) = run_job(workload::TEST_FORCE_PANIC_LIMIT, 2);
        assert_eq!(status, EspadaStatus::Error);
        assert_eq!(result, 0.0);
        let message = message.expect("an internal-fault settlement must carry a message");
        assert!(!message.is_empty());
        // reaching this line at all is part of what the test proves: the
        // panic did not abort the process.
    }

    #[test]
    fn freeing_a_job_is_safe_after_it_settles_successfully() {
        let (status, ..) = run_job(QUICK_LIMIT, 2);
        assert_eq!(status, EspadaStatus::Success);
        // run_job already freed it; reaching here without crashing is the assertion.
    }
}
