---
status: accepted
---

# Gate Bottom Sheet Content Drag On Scroll Position

`src/shared/ui/bottom-sheet/bottom-sheet.tsx`'s compound-component refactor
(issue #234) moved a sheet's own content out of a plain `View` and into a
real `Animated.ScrollView`, through a new `BottomSheetBody` slot. Nothing
scrollable sat under the content-area drag (`contentPan`,
`2026-09-04-extend-bottom-sheet-drag-to-move-close-into-content.md`) before
this: that record's own default arbitration decision was about a caller's
own nested pan gesture (`FanArc`, `SelectionGrid`), never about `contentPan`
competing with a native scroll responder, because there was no scroll
responder in the tree for it to compete with.

**A live, position-dependent relation was chosen over a fixed one.**
`BottomSheetBody`'s own `Animated.ScrollView` is wrapped in `Gesture.Native()`
and composed with `contentPan` via `.simultaneousWithExternalGesture()`, so
both gestures are permitted to run at once; `contentPan`'s own
`onStart`/`onUpdate`/`onEnd` worklets then read a UI-thread scroll-offset
shared value on every call and no-op once it reads above `0`. Two narrower
alternatives were weighed and rejected:

- **`.requireExternalGestureToFail()` or `.blocksExternalGesture()`.**
  Rejected: both encode one fixed winner for a gesture's entire lifetime,
  decided once. Which of "drag the sheet" and "scroll the content" should
  win here changes mid-gesture, as a touch crosses the scroll-top boundary —
  a relation that can only ever resolve once cannot express that.
- **Leaving the relation implicit, the same default arbitration the
  2026-09-04 record accepted for a caller's own nested gesture.** Rejected:
  that record's own reasoning rests on both competing gestures being
  ordinary `Gesture.Pan()` instances this library arbitrates between by
  activation distance. A `ScrollView`'s own native scroll responder is not
  one of this library's own gesture instances the same way, and leaving the
  relation to whatever priority the platform assigns risked the scroll
  responder and `contentPan` fighting over the same touch rather than the
  two ever coexisting the way scrolling and drag-to-dismiss coexist in a
  design most users already expect from a native bottom sheet.

**This narrows the 2026-09-04 record rather than replacing it.** That
record's own subject — a caller's own gesture rendered inside the sheet's
content (`FanArc`, `SelectionGrid`) — still relies on this library's
implicit cross-detector arbitration, unchanged, now against two gestures
(`contentPan` and the new `Gesture.Native()`) instead of one. Its own
Follow-up section records an on-device confirmation that predates this
change and has not been re-run against a build carrying this
`Animated.ScrollView`.

**Consequence accepted:** the exact scroll-to-drag handoff — a touch that
starts scrolled away from the top and crosses back to it mid-gesture — is
not exercised by this project's own test suite, which drives `contentPan`
directly through `fireGestureHandler` rather than a real touch stream a
`ScrollView` and a `Gesture.Pan()` would actually arbitrate between, and has
not yet been confirmed on a real device as of this record.
