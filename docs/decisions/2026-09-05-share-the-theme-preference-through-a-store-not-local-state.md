---
status: accepted
---

# Share the Theme Preference Through a Store, Not Local State

`settings-screen.tsx` originally held the tapped theme preference in a local
`useState`, seeded once, on mount, from `resolveThemePreferenceFromRuntime` —
enough while `Theme`'s own radio options rendered inline on that same screen.
Moving those radio rows onto their own `Theme` child screen (issue #76) left
two screens needing the same value: the `Theme` screen, to check the right
radio, and the Settings screen, to still show the current value on its own
disclosure row. Neither screen's local state can see the other write.

Lifting that state to a shared ancestor, without more, would still miss one
case: neither `Appearance` nor Unistyles fires a change notification for a
**same-theme transition** — `Dark` → `System` while the device already
reports dark, or `Light` → `System` while it reports light (issue #20).
Nothing but an explicit write on tap moves either screen's own display when
that happens, so reading `UnistylesRuntime` directly from each screen, with
no store of its own, would leave both screens showing the pre-tap value
across exactly that transition.

The preference is backed by a Zustand store instead
(`src/features/settings/adapter/use-theme-preference.ts`) — this feature's
first shared client state, per
[directory-structure.md](../conventions/directory-structure.md)'s rule that
client state a feature keeps across screens creates its own store. The
`Theme` screen writes the tapped preference to it; both that screen and the
Settings screen's own `Theme` row read from it, falling back to
`resolveThemePreferenceFromRuntime` before either has ever written. See
[specs/settings.md](../specs/settings.md#theme) for the shape this takes now.

Alternative considered: reading `UnistylesRuntime` directly from each screen,
with no state of its own layered on top. Rejected for the same-theme-transition
case above — a plain read is exactly the value that does not change across
that transition, so nothing would prompt either screen to re-render.
