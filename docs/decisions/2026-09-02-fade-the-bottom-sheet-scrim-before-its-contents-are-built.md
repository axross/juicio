---
status: accepted
---

# Fade the Bottom Sheet Scrim Before Its Contents Are Built

Issue #101's plan offered the maintainer three ways to fix the sheet's
entrance travel starting before the sheet was ever painted: option A ("Wait,
then travel"), option B ("Scrim first"), and option C ("Frame first"). The
plan recommended option A, which restores the entrance to exactly what
`docs/conventions/design-system.md` already specified — the scrim's opacity
derived from the sheet's own `translateY` position, unchanged. On 2026-09-02,
@axross approved plan revision `62fdfe6f35f7` and chose option B instead.

Option B starts the scrim fading toward full strength, on a timeline of its
own, the instant the sheet is asked to open — while the sheet's own contents
are still being built. The sheet's `translateY` travel starts separately,
from the sheet's first visible frame. Under option A the tap would sit
silent for as long as the sheet's contents take to build, then play the
whole entrance at once; under option B the screen begins responding to the
tap immediately, and nothing about the interaction ever reads as
unanswered.

Two consequences follow from choosing B over A, and both are in scope for
this change rather than deferred:

- The scrim's opacity stops being derived from the sheet's position for the
  entrance. That derivation was a specified property of the surface before
  this change; `docs/conventions/design-system.md`'s Motion section is
  corrected, not merely amended, to describe the scrim's own timeline
  instead. The scrim still tracks the sheet's position directly during a
  drag, so a half-dragged sheet still never shows a full-strength scrim.
- The scrim has to be able to reach the screen before the sheet's contents
  have finished mounting — under option A the scrim and those contents
  always reached the screen in the same commit, so this ordering did not
  previously need to exist.

Option C was not chosen: it would have kept full travel and immediate
feedback together without giving the scrim a timeline of its own, but at the
cost of the sheet's contents landing partway through the travel, which can
read as a second, smaller entrance.
