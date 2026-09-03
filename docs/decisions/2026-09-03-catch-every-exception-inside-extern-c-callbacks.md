---
status: accepted
---

# Catch Every Exception Inside an extern "C" Callback

Two Sentry crashes surfaced in the same code region of `espada-engine`'s C++
bridge: JUICIO-4, a fatal `EXC_BAD_ACCESS` on iOS, and JUICIO-5, `SIGSEGV`
twice in one session on Android. Both hit the `extern "C"` callback functions
this module hands to Rust as opaque function pointers, called from a
Rust-owned worker thread — a boundary Rust gives no exception-handling
contract at all. A C++ exception unwinding across it is undefined behavior
per the Rust Reference, with no guaranteed failure mode ("crash and burn," in
the Rustonomicon's own words). JUICIO-4's stack trace named a function,
`toOptionalResults`, that exists nowhere in this codebase or its
dependencies, with otherwise full, line-accurate debug info around it —
consistent with a corrupted unwind rather than an ordinary logic bug.

Neither crash's exact trigger could be confirmed. Sentry's Seer AI
root-cause analysis returned no budget on every attempt, and both events
were too rare to reproduce locally. JUICIO-4 coincided with real memory
pressure on the device (134 MB free); JUICIO-5 did not, which ruled out a
memory-pressure-only explanation and pointed instead at the boundary itself
being unsound to any exception, regardless of what throws or why. Two
alternative explanations were investigated and ruled out rather than kept as
open competitors: a stack overflow on the Rust worker thread (its largest
transient stack structure is on the order of 2.5 KB, far under a 2 MB
default thread stack) and a non-atomic data race on the JS-callback handle's
reference count inside `react-native-nitro-modules` (its `ReferenceState`
uses `std::atomic_size_t`, confirmed by reading that dependency's own
source).

Every `extern "C"` callback this module hands to Rust was made to catch and
swallow any exception raised anywhere in its own body, so nothing can ever
unwind back across the boundary. A callback whose caller has no way to learn
its work failed short of the notification it was already about to send (a
progress tick, or the demo job's settle callback) drops the exception
silently — a dropped progress tick is harmless, and the demo job's own
settle contract has no error-carrying shape independent of what it already
tried to send. The equity job's settle callback is the one exception to that
silence: because its caller is left waiting indefinitely on a result if the
notification is dropped, its `catch` falls back to notifying that caller
with a failure outcome instead, itself wrapped in its own inner `try`/`catch`
that swallows silently, since this function must never let anything escape
— including a second failure while reporting the first one.

This rule now governs every `extern "C"` callback this module exposes, not
only the ones that exist today: a callback added later that fails to catch
every exception it can raise reintroduces the same undefined-behavior
hazard, whether or not it happens to crash during testing. Confirming this
fix's actual effect on the iOS crash rests on a build the session that made
this fix could not compile locally — no macOS/Xcode toolchain was available
to it — so it depends on a maintainer manually dispatching
`espada-engine-artifacts.yaml`'s `verify-ios` and `verify-android` jobs
before merging.
