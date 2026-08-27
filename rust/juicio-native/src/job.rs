//! The handle-based job: spawning Rust-owned worker threads, pulling shards
//! off one atomic cursor, and pushing progress and completion back through
//! caller-supplied callbacks.

use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::ffi::{JuicioProgressCallback, JuicioSettleCallback, JuicioStatus};
use crate::workload::{self, SHARD_COUNT};

/// Progress callbacks fire at most this often per job, satisfying the
/// "roughly ten callbacks per second" cap. A worker always still emits one
/// final progress callback for the shard that completes the job, regardless
/// of this interval, so a caller always observes a callback at 100%.
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(100);

/// Wraps a caller-supplied `void*` so it can be captured by worker thread
/// closures. Sound because this crate only ever hands the pointer back,
/// unmodified, to the caller's own callback — it never reads or writes
/// through it itself, so nothing here depends on what thread does so.
struct SendPtr(*mut c_void);
unsafe impl Send for SendPtr {}
unsafe impl Sync for SendPtr {}

struct SharedState {
    limit: u64,
    next_shard: AtomicU64,
    completed_shards: AtomicU64,
    total_count: AtomicU64,
    cancelled: AtomicBool,
    settled: AtomicBool,
    /// Counts worker threads that haven't finished yet. The worker that
    /// decrements it to zero is the one that calls `settle_cb` — this is how
    /// completion is detected without ever joining a thread.
    active_workers: AtomicUsize,
    /// Set by whichever worker thread's shard processing panics first. `None`
    /// once read by `settle`, meaning "no internal fault occurred".
    fault_message: Mutex<Option<String>>,
    last_progress_nanos: AtomicU64,
    start_instant: Instant,
    progress_cb: JuicioProgressCallback,
    settle_cb: JuicioSettleCallback,
    user_data: SendPtr,
}

/// The opaque job handle returned by `juicio_native_start`.
pub struct JuicioJob {
    state: Arc<SharedState>,
}

/// Clamps a requested thread count: zero means "use every available core",
/// and a count above what the host actually has is brought down to it,
/// rather than rejected. Pure and host-independent so it can be unit tested
/// without depending on the actual number of cores this machine has.
pub(crate) fn clamp_thread_count(requested: u32, available: u32) -> u32 {
    let available = available.max(1);
    if requested == 0 || requested > available {
        available
    } else {
        requested
    }
}

fn host_available_parallelism() -> u32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1)
}

/// Starts a job: spawns `clamp_thread_count(thread_count, <host cores>)`
/// Rust-owned worker threads pulling shards off one atomic cursor, and
/// returns immediately without blocking for any part of the computation.
pub(crate) fn start(
    limit: u64,
    thread_count: u32,
    progress_cb: JuicioProgressCallback,
    settle_cb: JuicioSettleCallback,
    user_data: *mut c_void,
) -> *mut JuicioJob {
    let effective_threads = clamp_thread_count(thread_count, host_available_parallelism());

    let state = Arc::new(SharedState {
        limit,
        next_shard: AtomicU64::new(0),
        completed_shards: AtomicU64::new(0),
        total_count: AtomicU64::new(0),
        cancelled: AtomicBool::new(false),
        settled: AtomicBool::new(false),
        active_workers: AtomicUsize::new(effective_threads as usize),
        fault_message: Mutex::new(None),
        last_progress_nanos: AtomicU64::new(0),
        start_instant: Instant::now(),
        progress_cb,
        settle_cb,
        user_data: SendPtr(user_data),
    });

    for _ in 0..effective_threads {
        let worker_state = Arc::clone(&state);
        std::thread::spawn(move || run_worker(worker_state));
    }

    Box::into_raw(Box::new(JuicioJob { state }))
}

/// Sets the job's cancellation flag. Workers observe it between shards, never
/// mid-shard, and settle as [`JuicioStatus::Cancelled`] once every worker has
/// wound down on its own — this function never joins a thread.
pub(crate) fn cancel(job: &JuicioJob) {
    job.state.cancelled.store(true, Ordering::Release);
}

/// A worker thread's whole body: catches any panic raised while pulling and
/// processing shards, so one worker's bug is reported as an error rather
/// than aborting the process, then always runs the "did I finish last?"
/// bookkeeping — panic or not.
fn run_worker(state: Arc<SharedState>) {
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker_loop(&state)));
    if let Err(payload) = outcome {
        let message = crate::error::panic_message(&payload);
        let mut fault = state
            .fault_message
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if fault.is_none() {
            *fault = Some(message);
        }
    }
    finish_worker(&state);
}

fn worker_loop(state: &SharedState) {
    #[cfg(test)]
    if state.limit == workload::TEST_FORCE_PANIC_LIMIT {
        panic!("juicio-native: test-injected panic");
    }

    loop {
        if state.cancelled.load(Ordering::Acquire) {
            return;
        }
        let shard_index = state.next_shard.fetch_add(1, Ordering::Relaxed);
        if shard_index >= SHARD_COUNT {
            return;
        }
        let (start, end) = workload::shard_bounds(shard_index, SHARD_COUNT, state.limit);
        let count = workload::count_primes_in_range(start, end);
        state.total_count.fetch_add(count, Ordering::Relaxed);
        let completed = state.completed_shards.fetch_add(1, Ordering::AcqRel) + 1;
        maybe_emit_progress(state, completed);
    }
}

fn maybe_emit_progress(state: &SharedState, completed_shards: u64) {
    let is_final = completed_shards >= SHARD_COUNT;
    let now_nanos = state.start_instant.elapsed().as_nanos() as u64;

    if is_final {
        // `completed_shards` is derived from `state.completed_shards`'s
        // `fetch_add`, a strictly-increasing global counter, so exactly one
        // call across every worker ever observes a value >= SHARD_COUNT.
        // With no other call able to reach this branch, there is no
        // double-emit to guard against, so this stores unconditionally
        // instead of gating behind a compare-exchange: gating it would let a
        // concurrent non-final worker's own compare-exchange invalidate this
        // one's stale snapshot and silently skip the final callback the doc
        // comment above promises.
        state
            .last_progress_nanos
            .store(now_nanos, Ordering::Relaxed);
        (state.progress_cb)(1.0, state.user_data.0);
        return;
    }

    let last_nanos = state.last_progress_nanos.load(Ordering::Relaxed);
    let interval_nanos = PROGRESS_MIN_INTERVAL.as_nanos() as u64;
    if now_nanos.saturating_sub(last_nanos) < interval_nanos {
        return;
    }
    // Only the worker that wins this compare-exchange emits, so two workers
    // racing past the check above don't both invoke the callback.
    if state
        .last_progress_nanos
        .compare_exchange(last_nanos, now_nanos, Ordering::Relaxed, Ordering::Relaxed)
        .is_ok()
    {
        let fraction = (completed_shards as f64 / SHARD_COUNT as f64).min(1.0);
        (state.progress_cb)(fraction, state.user_data.0);
    }
}

fn finish_worker(state: &SharedState) {
    let remaining = state.active_workers.fetch_sub(1, Ordering::AcqRel) - 1;
    if remaining == 0 {
        settle(state);
    }
}

/// Calls `settle_cb` exactly once, from whichever worker thread finishes
/// last — an internal fault (a caught panic) takes priority over
/// cancellation, which takes priority over success.
fn settle(state: &SharedState) {
    if state
        .settled
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    let fault = state
        .fault_message
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    let total = state.total_count.load(Ordering::Acquire) as f64;

    match fault {
        Some(message) => {
            let message =
                CString::new(message).unwrap_or_else(|_| CString::new("internal fault").unwrap());
            (state.settle_cb)(
                JuicioStatus::Error,
                0.0,
                message.as_ptr(),
                state.user_data.0,
            );
        }
        None if state.cancelled.load(Ordering::Acquire) => {
            (state.settle_cb)(
                JuicioStatus::Cancelled,
                total,
                std::ptr::null(),
                state.user_data.0,
            );
        }
        None => {
            (state.settle_cb)(
                JuicioStatus::Success,
                total,
                std::ptr::null(),
                state.user_data.0,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_thread_count_replaces_zero_with_available() {
        assert_eq!(clamp_thread_count(0, 8), 8);
        assert_eq!(clamp_thread_count(0, 1), 1);
    }

    #[test]
    fn clamp_thread_count_caps_at_available() {
        assert_eq!(clamp_thread_count(100, 8), 8);
        assert_eq!(clamp_thread_count(9, 8), 8);
    }

    #[test]
    fn clamp_thread_count_passes_through_in_range_values() {
        assert_eq!(clamp_thread_count(1, 8), 1);
        assert_eq!(clamp_thread_count(8, 8), 8);
        assert_eq!(clamp_thread_count(4, 8), 4);
    }

    extern "C" fn record_progress(progress: f64, user_data: *mut c_void) {
        let progress_log = unsafe { &*(user_data as *const Mutex<Vec<f64>>) };
        progress_log
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(progress);
    }

    extern "C" fn ignore_settle(
        _status: JuicioStatus,
        _result: f64,
        _message: *const std::ffi::c_char,
        _user_data: *mut c_void,
    ) {
    }

    /// A minimal `SharedState`, sufficient to call `maybe_emit_progress`
    /// directly without going through `job::start`'s real worker threads.
    /// Progress fractions land in `progress_log`, which the caller owns and
    /// must outlive `state`.
    fn state_recording_into(progress_log: &Mutex<Vec<f64>>) -> SharedState {
        SharedState {
            limit: 0,
            next_shard: AtomicU64::new(0),
            completed_shards: AtomicU64::new(0),
            total_count: AtomicU64::new(0),
            cancelled: AtomicBool::new(false),
            settled: AtomicBool::new(false),
            active_workers: AtomicUsize::new(0),
            fault_message: Mutex::new(None),
            last_progress_nanos: AtomicU64::new(0),
            start_instant: Instant::now(),
            progress_cb: record_progress,
            settle_cb: ignore_settle,
            user_data: SendPtr(progress_log as *const Mutex<Vec<f64>> as *mut c_void),
        }
    }

    /// Reproduces the race the `PROGRESS_MIN_INTERVAL` doc comment promises
    /// never happens: the final worker's read of `last_progress_nanos` and
    /// its own attempt to update it are two separate atomic operations, a
    /// handful of instructions apart. A second worker that writes to that
    /// same atomic in between makes a compare-exchange-gated final emit find
    /// a stale `expected` value and silently skip.
    ///
    /// That window is only a few instructions wide, so one trial getting
    /// unlucky enough to land inside it is not something ordinary OS
    /// scheduling reliably produces on its own. What does make it a
    /// near-certainty is pairing a "hammer" thread that continuously
    /// rewrites the same atomic on another core, running for the whole test,
    /// with many repeated trials of the final call: across enough trials,
    /// the probability that at least one hammer write lands inside at least
    /// one trial's tiny window approaches 1.
    ///
    /// This is a strong stress test, not a formal proof. It does not
    /// guarantee catching the race in a single run, on every interleaving,
    /// or on every piece of hardware — only host-run `cargo test` is
    /// exercised. What it does establish, empirically and repeatably on the
    /// host this crate is developed on: with the pre-fix implementation
    /// (gating the final emit behind the same compare-exchange as the
    /// rate-limited path), this test reliably fails with a nonzero miss
    /// count; with the fix (an unconditional store for the final case),
    /// zero misses are observed across many repeated runs of this test.
    #[test]
    fn final_progress_still_fires_despite_a_racing_update_to_last_progress_nanos() {
        let progress_log: Mutex<Vec<f64>> = Mutex::new(Vec::new());
        let state = state_recording_into(&progress_log);

        const TRIALS: usize = 200_000;
        let stop_hammer = AtomicBool::new(false);

        let misses = std::thread::scope(|scope| {
            scope.spawn(|| {
                // Stands in for another worker's own successful
                // compare-exchange on `last_progress_nanos`, racing the
                // final worker's.
                while !stop_hammer.load(Ordering::Relaxed) {
                    let current = state.last_progress_nanos.load(Ordering::Relaxed);
                    let _ = state.last_progress_nanos.compare_exchange(
                        current,
                        current.wrapping_add(1),
                        Ordering::Relaxed,
                        Ordering::Relaxed,
                    );
                }
            });

            let mut misses = 0usize;
            for _ in 0..TRIALS {
                progress_log
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clear();
                maybe_emit_progress(&state, SHARD_COUNT);
                let saw_final = progress_log
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .contains(&1.0);
                if !saw_final {
                    misses += 1;
                }
            }
            stop_hammer.store(true, Ordering::Relaxed);
            misses
        });

        assert_eq!(
            misses, 0,
            "the final progress callback (fraction 1.0) was skipped in {misses} of {TRIALS} \
             trials while another thread concurrently raced last_progress_nanos"
        );
    }
}
