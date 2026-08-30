---
status: accepted
---

# Drop the Design's `Hand Range` Tab From the Board Input Sheet

The design file draws the board's own card input sheet at three nodes —
`103:10947`, `145:21922`, and `145:21298` — and all three draw a two-tab
segmented row, `Hand Range` / `Hand`, above the five preview slots. The
board input sheet built for issue #85 has no tab row at all.

A hand range is a set of rank pairs standing for many possible two-card
holdings — the thing a *player* is entered as when their exact cards are
unknown. The board is not a holding and is never uncertain: it is the
specific community cards on the table, and an equity calculation reads them
as exactly that. There is nothing a range entered "as the board" could mean,
and nothing downstream that could consume one, so the tab would be a control
with no behaviour behind it in either the current app or any planned one.
The maintainer settled this at issue #85's clarifying gate.

This is the second control dropped from a sheet the design draws with it,
and for the same class of reason as the first: the player sheet's own preset
button was dropped in
[2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](./2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md)
because there was no preset list for it to reach. The two are not the same
case, and the difference is what makes this one permanent: a preset button
is waiting on a data layer that is planned, so that decision reads as "not
yet". This one has nothing to wait for. A later change that finds itself
about to add a `Hand Range` tab to the board sheet is overturning this
record, not completing it.

Alternatives considered:

- **Keep the tab row and disable the `Hand Range` tab.** Rejected: a
  permanently disabled control teaches a user that the feature exists and is
  temporarily unavailable, which is the opposite of true here.
- **Keep the tab row with `Hand` as its only tab.** Rejected: a segmented
  control with one segment is chrome that selects nothing, and it would keep
  the sheet's height matched to the player sheet's for no reason a user
  could perceive.

Two consequences are accepted along with it. The board sheet is about 47pt
shorter than the player sheet, so the two do not line up vertically when
opened one after the other — the maintainer chose that over adding a heading
string to fill the space (option 1A of issue #85's exhibit). And the sheet's
preview slots now sit directly beneath the drag handle, which is the only
top chrome left: `BottomSheet`'s optional `header` drag surface goes unused
here, so a drag started on the slots themselves does not follow the finger
the way one started on the player sheet's tab row does.
