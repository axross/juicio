---
status: accepted
---

# Bundle Innovator Grotesk and Diverge From Figma's Inter

The Figma design source (`docs/operations/design-source.md`) specifies
Inter throughout — every named text style, and every measured node the
Typography table in `docs/conventions/design-system.md` reads directly off
a node, names Inter as its font. This app does not render in Inter. It
renders in Innovator Grotesk, bundled as eighteen `.otf` files under
`assets/fonts/` and registered through `app.json`'s `expo-font` config
plugin.

This is deliberate, not an oversight and not a placeholder pending the
"real" font. Before this change, every text role in
`src/core/theme/tokens.ts` carried a size, a weight, and a line height but
no `fontFamily` at all, so every role fell back to the platform system
font — Roboto on Android, San Francisco on iOS — rather than to Inter or to
anything else the design specifies. Bundling a typeface at all was already
a deliberate step past that fallback; the maintainer's choice of Innovator
Grotesk over Inter for the typeface actually bundled was made at the same
time, for reasons this record does not restate, and is final for this
project the same way. **A later session reading the design file and
finding it specifies Inter MUST NOT "correct" the app back to Inter on the
strength of that reading.** The design file is still the source of truth
for colour, spacing, iconography, and the numeric type scale (size, weight
tier, and line height) — `docs/operations/design-source.md` and
`docs/conventions/design-system.md` cover exactly how far that authority
runs and where — but the choice of typeface itself has moved, and this
record is what keeps that move from reading as a defect the next time
someone diffs the app against the file.

## The one-family-string-per-face constraint

Innovator Grotesk's own `name` table groups its eighteen styles the
classic four-style way, verified directly against the bundled files rather
than assumed from the family's marketing name: only Regular, Regular
Italic, Bold, and Bold Italic declare the family name `Innovator Grotesk`.
Every other weight declares its own family instead — Medium declares
`Innovator Grotesk Medium`, Semi Bold declares `Innovator Grotesk Semi
Bold`, and so on through Thin, Extra Light, Light, Extra Bold, and Black —
each of those with subfamily `Regular`, not a weight subfamily a platform
could key off of.

A `fontFamily: 'Innovator Grotesk'` paired with a numeric `fontWeight`
therefore cannot resolve Medium or Semi Bold on iOS: the operating system
has no path from a requested weight number to a family it was never told
carries that weight at all, and falls back to the nearest weight the
`Innovator Grotesk` family itself actually contains (Regular or Bold) —
silently, with no error. The fix this project adopted is one family string
per face, naming each face by its own PostScript name
(`InnovatorGrotesk-Regular`, `InnovatorGrotesk-Medium`,
`InnovatorGrotesk-SemiBold`, `InnovatorGrotesk-Bold`) rather than by the
shared marketing family name. `src/core/theme/tokens.ts` names these four
as `theme.fontFaces.{regular,medium,semiBold,bold}`, and every consumer —
every `theme.typography.<role>`, `navigation-theme.ts`'s React Navigation
`fonts` mapping, and the one style outside the role system
(`toast.tsx`'s `chipGlyph`) — reads one of those four tokens as its
`fontFamily` and carries no numeric `fontWeight` alongside it. Pairing a
named face with a numeric weight besides would invite the platform to
synthesise a heavier (faux) style on top of an already-heavy face, which is
exactly the failure mode this scheme exists to avoid.

## Alternatives considered

- **`fontFamily: 'Innovator Grotesk'` plus a numeric `fontWeight` per
  role**, matching how a numeric-weight system usually addresses a
  variable or multi-weight family. Rejected: the constraint above means
  this cannot resolve Medium or Semi Bold on iOS at all — not a stylistic
  preference, a resolution failure verified against the bundled files'
  own `name` tables.
- **Bundle Inter instead, matching the design file exactly.** Rejected by
  the maintainer; not reopened by this record.
- **The `expo-font` plugin's `android.fonts`/`fontDefinitions` XML form**,
  which lets Android declare a weight-keyed font family the way this
  project's own numeric `fontWeight` roles once implied. Rejected: it only
  configures Android, leaving iOS with the same one-family-can't-resolve-
  every-weight problem this record exists to solve, and it would leave the
  two platforms addressing faces through two different mechanisms for no
  offsetting benefit.
