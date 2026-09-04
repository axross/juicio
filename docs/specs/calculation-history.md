# Calculation History

This document describes what the design specifies for the History screen.
Only the empty state is built and shipped, as the Empty State section below
now describes. **As of issue #178**, a History Entry is saved automatically
when a calculation completes, so an entry can now exist — but History
Entries — grouping, the condensed row, and swipe-to-delete — remains a
record of design intent, not of shipped behaviour, since the populated
screen itself is tracked separately, in issue #180.

## History Entries

The History screen groups **history entries** under the **board** each was
calculated against, with the group's board shown as a small thumbnail. Groups
are themselves collected under a date heading (`Today`, in the observed
design). Boards of three, four, and five cards are all observed, as is a
board with no cards at all (drawn as three dashed slots — the design does not
distinguish a pre-flop board from an unset one).

Within a group, each history entry is a condensed row — narrower and shorter
than an Analyze player row (356×72, against 393×96) — carrying the same
13×13 dot-matrix icon and truncated name a **player** row shows (e.g. `BTN
Call against UT…`). A history entry is swipe-to-delete, using the same
dismissal states as an Analyze player row.

## Empty State

With no history entries, the screen shows a shark-and-fish illustration, the
heading `Nothing to look back on`, and the description `Run an analysis and
it'll show up here.`, with no button — built and shipped. The exact copy is
settled in [conventions/design-system.md](../conventions/design-system.md).
