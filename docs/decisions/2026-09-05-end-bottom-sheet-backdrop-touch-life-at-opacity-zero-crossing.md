---
status: accepted
---

# End Bottom Sheet Backdrop Touch Life At Opacity Zero Crossing

The backdrop behind a dismissed bottom sheet kept receiving touches for the
whole span between a dismissal committing and the exit spring genuinely
settling — an underdamped spring that overshoots and keeps resolving well
past the moment it reads as visually gone. For roughly the last third of
that span the backdrop painted nothing at all, yet a tap on it still reached
its own dismiss handler (a no-op, since a dismissal was already committed)
instead of falling through to whatever the sheet was drawn over. A person
who dismissed the sheet and immediately tapped the same row again, inside
that dead window, got nothing.

**Decision:** the backdrop's ability to receive a touch was ended at the
moment its own opacity first reaches zero — the frame a committed exit's
`translateY` first carries at or past the offscreen target — rather than at
the moment the exit spring settles. A `useAnimatedReaction` mirroring the
entrance's own arrival reaction watches for that crossing and, on the frame
it fires, drops the backdrop's own render gate; the sheet's teardown, the
closing haptic, and everything else driven by the spring settling are
untouched and still wait for the real settle.

The crossing threshold and the backdrop's own opacity formula deliberately
key off the same value — the sheet's offscreen target. That is what makes
"the backdrop is never removed while any of it is still visible" true by
construction, not by a threshold tuned to look right.

**Also decided, found during investigation, not part of the original
framing of the problem:** the sheet's own portal root needed to stop
capturing touches itself. Removing only the backdrop left the same defect
one level up: a full-bleed `View` with React Native's default pointer-events
behaviour sits at the top of the portal's z-order and absorbs a touch on its
own, even once it paints nothing and has no press handler of its own.
Declaring that root's pointer events as a pass-through container is what
actually lets a touch reach the backdrop while it exists and reach past it
once it doesn't.

Two narrower alternatives were considered and rejected:

- **Make the backdrop inert the instant a dismissal commits**, with no
  crossing rule and no reaction at all. This is the simplest change that
  fixes the reported symptom, since the backdrop's own dismiss handler is
  already a no-op from that instant onward. Rejected because it also lets a
  tap fall through during the *first* part of the exit, while the sheet and
  the backdrop are still plainly visible — a person could activate whatever
  is underneath a sheet they can still see on screen.
- **Let a tap during the exit reopen the sheet itself, rather than falling
  through to whatever is underneath.** Rejected: the tap belongs to whatever
  the backdrop was covering, which may not be the same row the sheet was
  already showing, and reopening the same sheet for it would also require
  the dismissal itself to be reversible.

**Consequence accepted:** the crossing is not observable through this
project's Reanimated mock — `useAnimatedReaction` is a no-op there — so the
rule lives in its own pure function, with its own unit test, the same shape
the entrance's own arrival rule already uses, rather than being exercised by
any render-level test of the sheet itself. The user-visible fix — a tap on
the row underneath during the dead window now reopening the sheet — has not
been confirmed on a real device as of this record.
