---
status: accepted
---

# Extend Bottom Sheet Drag-to-Move/Close Into Content

`2026-08-29-build-the-bottom-sheet-in-tree-rather-than-adopt-gorhom.md`
scoped this project's shared bottom sheet to three dismissal gestures:
dragging or tapping the handle, and tapping the scrim. Everywhere inside a
sheet's own content stayed inert for closing it — the Equity Breakdown
sheet, whose content carries no gesture or `Pressable` of its own, had no
way to be dragged closed at all except through its 7pt handle.

Issue #196 extended dragging to a sheet's content area (`children`) too:
active anywhere inside it that isn't already claimed by a pan or swipe
gesture belonging to that content — the same pattern `header` already used
(a caller-supplied top region that already drags along with the handle,
added before this record).

**Relying on this library's default gesture arbitration — the same
first-gesture-to-activate-wins rule the header/`Pressable` pairing already
used — was chosen over wiring an explicit relation between the content
drag and a caller's own content gesture.** `Gesture.Exclusive`,
`requireExternalGestureToFail`, and this library's other relation APIs each
need a reference to the specific gesture instance being related against.
The two content gestures this sheet's content already carries in practice —
`CardsPane`'s `FanArc` and `SelectionGrid`'s own `Gesture.Pan()`, both built
with `.minDistance(0)` so they activate on the very first pixel of movement
— are private to those components, and reaching into either one to expose
its gesture instance would trade this change's own small, self-contained
surface for a cross-cutting one, for a relation the library's own default
arbitration already gives for free: the new content-area pan is built with
the same plain, larger default activation distance every other pan gesture
in this component already uses, nothing narrowed against these two
specifically.

**The trade-off accepted:** any future content a caller renders inside a
sheet, if it ever needs a pan or swipe gesture of its own that does not
also activate on an equally small distance, risks losing the arbitration
race to the new content-area drag instead of winning it — the opposite of
what a sheet's own content gesture is for. This project's own bottom-sheet
test suite exercises today's two content gestures against a synthetic
gesture-state sequence and confirms each fires its own callback correctly
with the content-area drag present, but cannot exercise which gesture a
real touch's own arbitration actually picks — that needs a real device, and
had not been run against one as of this record. Nothing in this project's
automated checks would catch a future content gesture that loses this
race, since a lint or a type-check has no way to reason about runtime touch
arbitration.

**Follow-up:**

- Confirmed on a physical device. axross tested the Android preview build
  (APK built from this PR's branch by the Android Preview workflow, run
  33897887777) on 2026-09-04: a drag started inside `FanArc`'s or
  `SelectionGrid`'s own bounds still drove that control's own gesture
  rather than the new content-area drag, and dragging elsewhere in the
  content area moved or closed the sheet as intended. This was a manual
  pass against the preview build, not an automated end-to-end run — this
  project's `fireGestureHandler`-driven unit tests still cannot exercise
  the cross-`GestureDetector` arbitration a real touch goes through.
