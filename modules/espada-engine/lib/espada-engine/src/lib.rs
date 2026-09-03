//! `espada-engine`: the C ABI job runner the Expo app uses to run CPU-bound
//! Rust work off the JavaScript thread, on both Android and iOS.
//!
//! this crate exports a C ABI and nothing else — no JNI symbols, no second
//! surface. `ffi` (re-exported here) holds the demo job's exported functions
//! and protocol shape; `job` holds the thread-spawning and
//! callback-dispatch machinery behind it; `workload` holds the demo workload
//! itself, which carries no product meaning of its own. `equity_ffi` and
//! `equity_job` are that same shape's second instance: real equity
//! evaluation for a 2- or 3-player table, sharding
//! `espada_internal::evaluator::EquityEvaluator`'s own runout walk instead of
//! a numeric range — see `equity_job`'s own doc comment.
//!
//! only `ffi`'s and `equity_ffi`'s public items, re-exported below, are this
//! crate's intended surface for a Rust caller — which today is only its own
//! test suite, linking this crate as an ordinary `rlib` on the host.

mod equity_ffi;
mod equity_job;
mod error;
mod ffi;
mod job;

mod workload;

pub use equity_ffi::{
    espada_engine_equity_cancel, espada_engine_equity_free, espada_engine_equity_start,
    EspadaEquityPlayerResult, EspadaEquityProgressCallback, EspadaEquitySettleCallback,
    EspadaEquityStatus,
};
pub use equity_job::EquityJob;
pub use ffi::{
    espada_engine_cancel, espada_engine_free, espada_engine_last_error, espada_engine_start,
    EspadaProgressCallback, EspadaSettleCallback, EspadaStatus,
};
pub use job::EspadaJob;
