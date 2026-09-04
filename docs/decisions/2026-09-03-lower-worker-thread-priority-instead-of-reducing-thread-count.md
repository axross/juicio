---
status: accepted
---

# Lower Worker-Thread Priority Instead of Reducing Thread Count

Issue #143's live-equity change (delivered on pull request #146) made the app
noticeably unresponsive on a real device while a calculation runs. An
investigation ranked the equity engine's own worker threads — one spawned per
available CPU core, every one running at the operating system's default
scheduling priority, the same priority the app's own JavaScript and UI
threads run at — as the leading contributor: on a device with limited cores,
those worker threads compete directly with the JS/UI thread for CPU time.

The maintainer had two ways to relieve that contention: leave every worker
thread's scheduling priority alone and spawn fewer of them, or spawn the same
number and lower their scheduling priority instead. They chose to lower
priority, specifically so that calculation speed on an otherwise-idle device
is unaffected — only behavior under contention changes. That decision was
made when this amendment's plan was approved on 2026-09-03, alongside
directing it be delivered as a scope change to issue #143 and pull request
#146 rather than a separate issue.

Alternatives considered:

- **Reduce worker-thread count instead** (e.g., leave one CPU core free).
  Rejected: it would cost calculation speed on every device, including one
  with cores to spare and nothing else running, to fix a problem that only
  shows up under contention. Priority-lowering leaves an idle device's
  calculation exactly as fast as before, and only changes how the OS
  scheduler arbitrates when the JS/UI thread actually wants the CPU at the
  same time.
- **Adopt a work-stealing thread-pool crate (e.g. `rayon`)** in place of the
  current one-thread-per-shard-batch design. Rejected: such a crate makes
  capping thread *count* easier, but has no built-in mechanism for thread
  scheduling priority or QoS, so it does not address the chosen approach at
  all — and replacing the current design would be a larger, unrelated
  architectural change than this fix calls for.
- **Reach the platform priority APIs through a Swift/Kotlin/JNI shim.**
  Rejected: `modules/espada-engine`'s only path into Rust is its own C ABI —
  see that module's README and its own decision record for why — and a
  maintained, cross-platform Rust crate reaches the same underlying OS calls
  without adding a second, native-language-specific path this project does
  not already have.

## The crate, and the tier chosen

The crate is [`thread-priority`](https://crates.io/crates/thread-priority)
3.1.1, pinned to that exact version. It was confirmed, not merely assumed,
during implementation: it resolves and builds cleanly against this crate on
the host (Linux) target, and `rustc` accepts it — including its own
platform-specific code paths — when cross-compiling for both
`aarch64-linux-android` and `aarch64-apple-ios`; only the final link step
fails on both, for the same toolchain-availability reasons (`cargo-ndk`/NDK,
respectively Xcode/an iOS SDK) `modules/espada-engine`'s own README already
documents as out of an ordinary session's reach.

The crate does not expose Apple's `QOS_CLASS_*` API specifically — on every
Unix-family target it supports, including macOS and iOS, it reads a thread's
own already-inherited scheduling policy and sets a priority within it via the
POSIX `pthread` scheduling APIs, mapped onto niceness on Linux/Android and
onto the `SCHED_OTHER` priority range on macOS/iOS. Every thread this crate's
job types spawn inherits the ordinary time-shared policy every platform
starts a thread on unless something opts it into a different one, and this
crate's own `NormalThreadSchedulePolicy::Idle`/`Batch` variants — the ones
that would move a thread to an idle- or background-class tier a mobile OS
might suspend or aggressively throttle — are Linux/Android-only in this crate
and are never selected by the helper this issue adds; that helper's own doc
comment in `modules/espada-engine/lib/espada-engine/src/job.rs` states the
same reasoning next to the priority value it uses. The result is the
behavior the plan called for — below-normal, still foreground-eligible — even
though the underlying mechanism is POSIX scheduling priority rather than a
named QoS class.

The specific value, `25` on the crate's own `[0, 99]` "Crossplatform" scale,
sits meaningfully below the scale's own midpoint on every platform this crate
builds for — but by two different mechanisms, confirmed by reading the
crate's own `to_posix` conversion rather than assumed to be uniform. On
Linux/Android, `25` converts onto the niceness range, above (favoring the
worker less than) the niceness a thread's typical OS-default priority
converts to, and short of niceness `19`, the least-favorable value still on
the ordinary `SCHED_OTHER` policy. On macOS/iOS, `to_posix` takes an entirely
different branch — no niceness conversion at all — and passes `25` through as
a raw POSIX `sched_priority`, clamped only to that platform's own
`sched_get_priority_min`/`max(SCHED_OTHER)` band, landing below the
platform's own documented default base priority for an ordinary thread there
too, just by a different code path than the Linux/Android one.

## Consequences

Every equity-calculation worker thread, and the crate's own demo-job worker
threads (`modules/espada-engine/lib/espada-engine/src/job.rs`), lower their
own priority through one shared helper immediately after they start,
regardless of which job type spawned them. Sharing it with the demo job is
deliberate: that job is exposed through the developer-facing native-job-demo
screen built for issue #7, whose own frame-rate monitor only reports a true
reading when the JS thread is actually free to run — giving this fix an
existing, real verification vehicle beyond what this pull request's own
automated checks can show.

No existing benchmark harness measures equity-calculation completion time
precisely enough to catch a small regression on an otherwise-idle device;
this remains a residual risk, closed only by the maintainer's own on-device
pass after the native-artifact rebuild, the same follow-up the already
sharded, unchanged thread count and calculation algorithm already needed.

A second, separate residual risk: whether a POSIX `sched_priority` change of
this kind has any real scheduling effect at all on iOS specifically is not
established by anything in this crate's source or in Apple's own developer
documentation, which steers toward Quality-of-Service classes as the
mechanism for prioritizing work on iOS and says nothing about traditional
POSIX priority either way — and this crate never opts a thread into an
explicit QoS class. This is the crux of whether the fix actually works on one
of the two platforms it targets, and it is not the same question as the
idle-device-speed-regression risk above; only the maintainer's own on-device
pass can settle it, alongside that regression check.
