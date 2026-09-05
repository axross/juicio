---
status: accepted
---

# Use Different Light and Dark Opacity Ranges for the New Player FAB Glow

`NewPlayerFab`'s resting glow animates each of its two `boxShadow` layers'
own alpha between a dim and a bright figure. That dim/bright range is keyed
by theme — `dark` scales every figure down by roughly 40% from `light`'s own
roughly 20% reduction off the glow's original, theme-flat figures — rather
than one range shared by both themes.

The same absolute alpha reads more intensely against a dark background than
a light one: black text or a shadow layer at a fixed opacity sits closer, in
perceived contrast, to a dark ground than to a light one, so a figure tuned
to look right in light mode reads as too strong once the same button sits
on a dark background. Scaling `dark`'s own range down further than `light`'s
is what keeps the glow's own perceived intensity — not its literal opacity
number — consistent across both themes.

Both ranges still preserve the same two internal relationships regardless of
theme: `GLOW_BLOOM` stays dimmer than `GLOW_CONTACT` at both ends (a light
source's falloff is brightest near its origin and softens across its wider
radius), and each range's own dim end still sits below its own bright end by
roughly the same proportion. Only the absolute figures move between themes,
never the shape of the range.

Alternative considered: one theme-flat opacity range, applied unchanged in
both themes. Rejected — the same range read visibly too strong against a
dark background, which is what motivated splitting it by theme in the first
place.
