---
status: accepted
---

# Choose the Demo Workload's Prime Limit to Exercise Async Behavior Cheaply

`modules/espada-engine`'s demo workload (`workload::DEMO_LIMIT`, compiled only
into `cargo test` builds, never into the shipped `cdylib`/`staticlib`) exists
to prove the crate's async-job contract through its real C ABI: that
`espada_engine_start` returns to the caller without blocking, that the job it
started settles later with the correct result, and that progress callbacks
land at roughly the promised rate while the job runs. `ffi.rs`'s
`start_returns_immediately_and_settles_with_the_reference_value_for_the_chosen_limit`
test is what exercises that contract, starting a real job with
`DEMO_LIMIT` fed to `count_primes_in_range(0, N)`. It needed a limit `N` large
enough that the job takes real, non-trivial time to settle — so the test's
"returns immediately, settles later" split and its progress-callback-rate
assertion are exercised against a job that actually outlives a callback tick,
rather than one that could complete before either could be observed — and
small enough that this one value does not make every `cargo test` run
noticeably slower.

The maintainer set `N = 20_000_000`, measured directly rather than estimated:
on the reference host used to pick it (an Intel Xeon @ 2.80GHz, `nproc` 4), a
release build of `count_primes_in_range(0, 20_000_000)` by trial division took
approximately 4.9 seconds run single-threaded — the mode `workload`'s own
`trial_division_matches_the_sieve_at_the_chosen_demo_limit` test runs it in,
calling the function directly with no sharding — and approximately 1.27
seconds run across all 4 threads (`espada_engine_start`'s own thread-count
clamping, with `thread_count` 1 and 0 respectively) — the mode the FFI test
above runs it in, since it passes `thread_count: 0` to use every available
core. Both figures land in the same few-second range: long enough that the
FFI test collects more than one progress callback and can tell "started" from
"settled" apart, short enough that neither test adds more than a few seconds
to a `cargo test` invocation.

**A larger or smaller `N` was rejected** for missing that range in one
direction or the other on the reference host's own measurements: a value that
settles in well under a second risks the job completing before the progress
callback (fired at most roughly ten times a second) ever fires, which would
leave the FFI test's "expected at least one progress callback" assertion
untested against a real timing gap; a value that runs for many seconds longer
would add that much wall time to every `cargo test` run for a workload that
carries no product meaning of its own.

## Consequences

`DEMO_LIMIT` is cross-validated in `workload`'s own tests against an
independent Sieve of Eratosthenes, since `20_000_000` is otherwise too large
to eyeball or trust from memory. It exists solely to give the crate's own
async-job and progress-callback contract, asserted in `workload`'s and
`ffi`'s tests, something with real elapsed time to run against; there is no
on-device or other downstream user of this value, so no confirmation beyond
those two tests is owed.
