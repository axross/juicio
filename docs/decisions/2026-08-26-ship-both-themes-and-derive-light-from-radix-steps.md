---
status: accepted
---

# Ship Both Themes, and Derive the Light Palette From Radix Step Parity

Every colour in the design file resolves by exact hex to a Radix Colors
scale, and both the `olive`/`olive dark` and `lime`/`lime dark` scale pairs
exist in the file's own colour styles — but every component and screen
sampled resolves to the `*dark` side only. No theme toggle and no light-mode
screen exists anywhere in the file.

The app ships both a dark and a light theme. The light palette is derived by
same-step parity: `olive dark/N` maps to `olive/N`, and likewise for `lime`,
for every step the app uses. A `Theme` section is added to Settings, offering
`System`, `Light`, and `Dark` — a section the design file does not contain.

Two alternatives were rejected for deriving the light palette. Drawing light
screens in Figma first was rejected because it would block every screen's
implementation on design work that adds no new information beyond a
mechanical step-for-step colour swap. Deciding light-mode colours ad hoc
during implementation was rejected because it would leave the design file
permanently behind the app, with no single source either could be checked
against. For the theme selector, two alternatives were rejected: following
the OS theme with no in-app control at all, and a two-way Light/Dark switch
with no System option — both were rejected as offering less control than a
three-way selector costs to add.

Radix's own step semantics do not automatically transfer step-for-step:
`lime/9` (`#BDEE63`), used as the brand accent, assumes dark text on top of
it in the file's own dark-theme usage, so every non-button use of it against
a light background needs its own contrast check rather than inheriting the
dark-theme pairing unchanged.
