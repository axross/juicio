---
status: accepted
---

# Give the Card Sheet Two Tabs and a Preset Button

The card and range input sheet — the bottom sheet that specifies one
player's holding — has two segmented tabs, `Hand Range` and `Cards`.
Selecting a saved preset is not one of those tabs: it is a separate
control, placed away from the tab row.

Two alternatives were rejected, both of which the design file actually
draws. Two segmented tabs, `Hand Range` / `Hand`, with preset selection
living inside the `Hand Range` tab, was rejected: reusing a saved range is
the common case, and that arrangement puts it one level below the top of
the sheet. Three segmented tabs, `Preset` / `Hand range` / `Hand`, with the
`Preset` tab embedding the preset list and its filter chips, was rejected:
one segmented control would then carry two different kinds of choice at
the same level — how a holding is specified, and which saved range to
reuse.

With preset selection lifted out, the tab row carries exactly the two ways
of specifying a holding and nothing else. The second tab is named `Cards`
rather than `Hand`, because the same picker it opens serves both a
player's two hole cards and the board's five community cards — the design
file shows that picker with two slots and with five.

This arrangement does not exist in the design file. Until Figma is
updated, the file shows only the two rejected arrangements above, so a
later session that opens it will find them there and must not read either
as current. That is the same hazard
`2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md` records, and it is
the reason this record exists at all.
