---
status: accepted
---

# Target Both Android and iOS

The design file's screens are drawn at iPhone dimensions (393×852 and
430×932), while the project has so far targeted Android only. Reading the
design settled which platform it actually describes.

The project now targets both Android and iOS. The design's iPhone frames are
treated as dimensional reference for both platforms, not as an iOS-only
design.

Two alternatives were rejected. Staying Android-only was rejected because the
design itself is not drawn for it — treating an iPhone-dimensioned file as
Android-only reference would require redrawing or reinterpreting every frame
before it could be trusted. Redrawing the design at Android dimensions first
was also rejected, because it would block every other decision in this batch
on design work, for a difference (dimensions, safe areas) that does not
change what any screen shows.

iOS support is code-level only for now: the build, signing, and distribution
pipeline for iOS is a separate piece of work, tracked outside this decision.
The project therefore now targets a platform — iOS — it cannot yet ship a
build to. `android-preview.yaml` and the fastlane pipeline it drives remain
Android-only until that separate work lands.
