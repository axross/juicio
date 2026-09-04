---
status: accepted
---

# Cache the Android NDK Compile with ccache, Not sccache

Issue #202 asked for a compiler object-file cache over the Nitro C++
bridge's CMake/NDK compile stage
(`modules/espada-engine/android/CMakeLists.txt`'s `EspadaEngine` target),
which recompiled from scratch on every run of the three workflows that
assemble or verify an Android build. ccache and sccache both integrate with
CMake through the same
`CMAKE_C_COMPILER_LAUNCHER`/`CMAKE_CXX_COMPILER_LAUNCHER` mechanism and
would satisfy that requirement equally well as far as this compile stage is
concerned.

ccache was chosen. The issue that opened this plan already named ccache
specifically; ccache's CMake integration is the older and more widely
precedented pattern for Android NDK builds in particular, with more
existing prior art to draw on than sccache's; and nothing about this
compile stage needs sccache's distinguishing capability — a distributed
cache shared across machines — since each of the three affected jobs runs
on its own GitHub-hosted runner with its own persisted `actions/cache`
entry, never sharing a cache with another job or another dispatch's runner
concurrently.

Alternatives considered:

- **sccache (Mozilla)** instead of ccache. Rejected: no requirement here
  calls for sccache's distributed/shared-cache backends (S3, GCS, a network
  cache server); the existing GitHub Actions per-job persisted cache
  (`hendrikmuhs/ccache-action`, wired through
  `.github/actions/setup-ccache`) is exactly the "local, per-runner"
  caching model ccache is built around, and switching would add a second,
  less-precedented compiler-cache tool alongside no matching need.

## Consequences

`hendrikmuhs/ccache-action` is now this project's second cache-line
dependency added specifically for a native compile stage (alongside the
Cargo cache in `.github/actions/setup-rust`), SHA-pinned per
[docs/conventions/security.md](../conventions/security.md). Revisiting this
choice would need a concrete need for a distributed cache shared across
multiple concurrent runners or machines — nothing in this project's current
CI topology (one runner per job, no shared build farm) creates that need.
