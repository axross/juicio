---
status: accepted
---

# Scope the Page-Alignment Gate to This Project's Own Libraries

`verify-android`'s "Verify 16 KB Page Alignment" step, added to catch a
misaligned native library before its artifacts are committed, needed a
scope: which of the libraries in the assembled APK's `lib/arm64-v8a/` its
`readelf -lW` check should read. Google Play's own requirement, in force
since 2025-11-01, applies to every native library an APK bundles, not only
the ones a project builds itself.

The check reads exactly two libraries by name — `libEspadaEngine.so`, this
project's own C++ Nitro HybridObject, and `libespada_engine.so`, the Rust
cdylib `espada-engine` cross-compiles — rather than every arm64 `.so` the
assembled build produces.

Failing on every arm64 `.so` in the build, dependencies included, was
rejected. It matches what Play actually rejects — an upload is refused if
any bundled `.so` is misaligned, dependency-owned or not — but it was
rejected anyway, because it would turn a regression in a dependency this
project does not control, such as a React Native or Skia bump shipping a
differently-aligned `libhermes.so`, `libreactnative.so`, or `librnskia.so`,
into a red `verify-android` run this project cannot fix in its own code.

A misaligned dependency-owned library is therefore a gap this gate does not
close. Should a future dependency bump ship one, this gate stays green while
the upload to Google Play would still be rejected — a known, accepted gap,
not an oversight. Widening the check to every arm64 `.so` in the build is
the option that closes it, and it is available to a later change willing to
accept turning a dependency's own regression into a red pipeline here.
