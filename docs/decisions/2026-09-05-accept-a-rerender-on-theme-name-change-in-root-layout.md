---
status: accepted
---

# Accept a Re-render on Theme-Name Change in Root Layout

`_layout.tsx` reads `rt.themeName` from Unistyles' `useUnistyles()` and
derives from it the value it passes to React Navigation's `ThemeProvider`.
`ThemeProvider` is an ordinary React-context API, and a React-context API
can only propagate a new value through a re-render, so an actual
theme-name change re-renders `RootLayout` and recreates the `<Stack>`
element it renders beneath it.

`_layout.tsx` is where this cost lands because it is the lowest common
ancestor of every navigator and screen that needs the theme: there is no
lower point in the component tree that could read `themeName` in
`ThemeProvider`'s place and absorb the re-render instead, since the
derived value still has to reach `ThemeProvider`, and reading it lower
down would only move the re-render, not remove it.

This cost is accepted rather than engineered away.
