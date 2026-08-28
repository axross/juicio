//! `espada-engine`: the C ABI job runner the Expo app uses to run CPU-bound
//! Rust work off the JavaScript thread, on both Android and iOS.
//!
//! This crate exports a C ABI and nothing else — no JNI symbols, no second
//! surface. `ffi` (re-exported here) holds the exported functions and the
//! shape of the job protocol; `job` holds the thread-spawning and
//! callback-dispatch machinery behind it; `workload` holds the demo workload
//! itself, which carries no product meaning of its own.
//!
//! Only `ffi`'s public items, re-exported below, are this crate's intended
//! surface for a Rust caller — which today is only its own test suite,
//! linking this crate as an ordinary `rlib` on the host.

mod error;
mod ffi;
mod job;
mod workload;

pub use ffi::{
    espada_engine_cancel, espada_engine_free, espada_engine_last_error, espada_engine_start,
    EspadaProgressCallback, EspadaSettleCallback, EspadaStatus,
};
pub use job::EspadaJob;

// scratch probe: reverted immediately. exercises the rust-checks filter.
