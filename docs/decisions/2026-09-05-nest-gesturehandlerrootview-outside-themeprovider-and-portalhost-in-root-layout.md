---
status: accepted
---

# Nest GestureHandlerRootView Outside ThemeProvider and PortalHost in Root Layout

`RootLayout`'s provider tree nests `GestureHandlerRootView` outermost,
`ThemeProvider` inside it, and `PortalHost` innermost, wrapping `Stack`.

`GestureHandlerRootView` stays the outermost wrapper because every
gesture-driven surface in the app — including one rendered through
`PortalHost`, which escapes the navigator tree entirely — resolves its
gesture handlers against this root; a gesture surface rendered outside it
would have no root to resolve its handlers against. `ThemeProvider` sits
between the two because it is an ordinary React context that only has to
sit above whatever reads it.

`PortalHost` wraps `Stack` rather than sitting beside it so that `Stack`
— and everything it renders, including the tab bar — paints first, and
any portalled content paints after it, on top.
