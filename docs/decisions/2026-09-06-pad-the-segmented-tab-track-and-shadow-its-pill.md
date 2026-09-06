---
status: accepted
---

# Pad the Segmented Tab Track to 4 and Shadow its Pill

`SegmentedTabs`' track (`src/shared/ui/segmented-tabs/segmented-tabs.tsx`)
padded itself at `3`, the value measured directly off design node
`128:33644` — the same node this control's own doc comment has always
cited. Issue #285's icon/label-reveal polish pass, worked out over several
rounds of a rendered design-review page, changed that padding to `4` and
added a soft drop shadow to the sliding selection pill, neither of which
that node's own measurement carries. Both are recorded here as the
deliberate departures they are, the same way
`docs/conventions/design-system.md`'s own Rank-Pair Grid Cell Label and
Board Slot Pressed State entries each record a departure from a measured
or absent design value, rather than letting a future pass mistake either
for an oversight to "correct" back.

## What This Project Does

`TRACK_PADDING` is `4`, not the design node's own `3`. The track's overall
height is unchanged — still `44`, the same node's own measured value —
so this only changes how much of that fixed height the selected pill fills.
That fill narrows from `38` tall to `34`, not the `36` a padding-only
subtraction would suggest: the track's own new border ring (below) insets
the absolutely-positioned pill by its own width too, the same way it insets
the pill's horizontal placement — so both dimensions come off the pill's own
size, not padding alone.

The selected pill's own `boxShadow` reads a new effect token,
`theme.effects.segmentedPill` (`src/core/theme/tokens.ts`), two layers in
the same `{offsetX, offsetY, blurRadius, spreadDistance, color}` shape
`theme.effects.sheet` already uses:

| Layer | `offsetY` | `blurRadius` | `spreadDistance` | `color` |
| --- | --- | --- | --- | --- |
| 1 | `2` | `5` | `0` | `rgba(0, 0, 0, 0.18)` |
| 2 | `1` | `1` | `0` | `rgba(0, 0, 0, 0.08)` |

The track also gains a new `1`-wide (`theme.borderWidth.base`) border ring
in `theme.colors.border.neutral.subtle` — an already-catalogued token, not
a new colour — around its whole perimeter.

## Why

The maintainer confirmed this exact combination — the `4`-padded, ringed
track and the shadowed pill — through the linked design-review page's own
"4. Label Reveal" card (issue #285's plan), built on that same page's
"A. Refined Sliding Pill" track option from an earlier round. The shadow
in particular has no design-file source at all to depart from: no effect
style or exported-SVG stroke corroborates it the way `theme.effects.sheet`
is independently corroborated by a design-file annotation node
(`docs/conventions/design-system.md`'s Effects section) — it is a value
chosen through the review page and confirmed in conversation, not measured.

## Consequences

A future pass reading `128:33644` directly will find `3`, not `4`, and no
shadow at all on its own selected-pill layer. That is expected: this
decision is what the departure is, not a transcription this project should
later reconcile back to the node. Revisiting either value means judging the
control on a real render again, the same way this one was chosen, not
recomputing it from the design file.
