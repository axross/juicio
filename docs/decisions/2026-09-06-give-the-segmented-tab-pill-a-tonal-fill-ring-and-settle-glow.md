---
status: accepted
---

# Give the Segmented Tab Pill a Tonal Fill, Ring, and Settle Glow

This supersedes
[2026-09-06-pad-the-segmented-tab-track-and-shadow-its-pill.md](./2026-09-06-pad-the-segmented-tab-track-and-shadow-its-pill.md),
whose `4`-padded track stands as that record left it — nothing here changes
it — but whose border ring and static drop shadow are the two choices this
record replaces. Issue #285's plan (revision 3) also drops that same
predecessor's icon/label-reveal direction entirely: `SegmentedTabs`
(`src/shared/ui/segmented-tabs/segmented-tabs.tsx`) now shows every tab's
icon and label side by side at all times, never revealing a label only on
selection.

## What This Project Does

The track (`styles.track`) keeps `TRACK_PADDING` at `4`, unchanged from the
superseded record, and carries no border of its own any more — the ring
moves to the pill.

The selected pill (`styles.pill`):

- Fills with `theme.colors.component.accent.rest`, a tonal tint, not the
  solid `theme.colors.solid.accent.rest` fill it carried before.
- Rings itself in a `theme.borderWidth.base` (`1`) border, coloured
  `theme.colors.text.accent.brand`.
- Casts an animated "settle glow" instead of a shadow fixed at one value:
  `glowIntensity`, a shared value alongside `pillTranslateX`, jumps to `1`
  the instant the pill's own position target changes, then eases back to
  `0` on this system's own colour/opacity timing
  (`motionColorTimingConfig`). Its `boxShadow` interpolates between a
  resting and a peak state as `glowIntensity` travels:

| | `offsetY` | `blurRadius` | alpha |
| --- | --- | --- | --- |
| Rest (`0`) | `2` | `8` | `0.18` |
| Peak (`1`) | `6` | `18` | `0.55` |

  The glow shares `pillTranslateX`'s own effect and its guard: both move
  only when `selectedIndex` (or `cellWidth`, once it first resolves)
  actually changes, never on a re-press of the tab already selected. Under
  reduced motion `glowIntensity` never leaves `0` — no flash at all, the
  same jump-not-travel collapse `pillTranslateX` already takes.

The icon (`ICON_SIZE`) is `20`, not the superseded record's `16` — a
departure from the design-review mockup's own `16` for this same "Icon +
Label" card, confirmed directly with the maintainer alongside the settle
glow's flash-then-decay behaviour, kept in full rather than simplified to a
static glow.

## Why

The maintainer's own real-device feedback on the icon-reveal direction that
shipped from the superseded record's plan was to replace it: icon and label
always shown, on a tonal, ringed, glowing pill, confirmed against an
existing design-review artifact's "1. Icon + Label" card (that page's "B-2.
Ring + Settle Glow" track).

## Consequences

A future pass reading `theme.effects.segmentedPill`
(`src/core/theme/tokens.ts`) will find a token no component reads any more —
`SegmentedTabs`' own `boxShadow` is computed per-frame in
`segmented-tabs.tsx` now, not read from that effect token. That token is
left in place regardless: this record does not resolve whether it is
otherwise still referenced project-wide, only that this control has stopped
reading it.
