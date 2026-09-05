---
status: accepted
---

# Choose the Demo Workload's Prime Limit for a One-to-Three-Second Target Runtime

`modules/espada-engine`'s demo workload (`workload::DEMO_LIMIT`, only compiled
into `cargo test` builds) exists to prove Rust code can run off the JavaScript
thread through the crate's C ABI, exercised through the developer-facing
native-job-demo screen built for issue #7. It needed a limit `N` for
`count_primes_in_range(0, N)` large enough that a real device's frame-rate
monitor can observe the app staying responsive while the job runs, and small
enough that a developer using that screen is not left waiting.

The maintainer set the target at one to three seconds of runtime on a real
device, since that is long enough for the demo screen's own frame-rate monitor
to take a meaningful reading while the job is in flight, and short enough that
checking the demo does not become a chore. `N = 20_000_000` was chosen to land
in that range, measured directly rather than estimated: on the reference host
used to pick it (an Intel Xeon @ 2.80GHz, `nproc` 4), a release build of
`count_primes_in_range(0, 20_000_000)` by trial division took approximately
4.9 seconds run single-threaded and approximately 1.27 seconds run across all
4 threads (`espada_engine_start`'s own thread-count clamping, with
`thread_count` 1 and 0 respectively). A phone's cores are generally slower
per-core than a workstation's own, so single-threaded time on a real device is
expected to fall further above the reference host's figure than
multi-threaded time does — the multi-threaded figure is the one closer to
what the demo screen, which uses every available core, actually shows a
developer.

**A larger or smaller `N` was rejected** for missing the target range in one
direction or the other on the reference host's own measurements: a value that
lands under a second gives the frame-rate monitor too little time in flight to
take a meaningful reading, and a value that runs past three seconds turns
checking the demo into a wait.

## Consequences

`DEMO_LIMIT` is cross-validated in `workload`'s own tests against an
independent Sieve of Eratosthenes, since `20_000_000` is otherwise too large
to eyeball or trust from memory. No on-device measurement has confirmed the
one-to-three-second target actually holds on real hardware, which this
environment has none of; that confirmation is the same on-device pass the
demo screen itself exists to support, not a separate follow-up this decision
adds.
