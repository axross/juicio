---
status: accepted
---

# Render the iOS Tab Bar with expo-router's Native Tabs

`2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md` built the
four-tab shell's bottom tab bar with a custom `tabBar` render prop on
`expo-router`'s JavaScript `Tabs` navigator, rejecting
`expo-router/unstable-native-tabs` because a platform-native bar could not
reach the design's 90px height, could not scope a hairline indicator to one
active cell, and could not draw the design's inverted `Sheet` shadow.

Reading `NativeTabs`' own current documentation reconfirms every one of
those constraints as still true: it has no height control, no way to draw a
per-cell custom indicator, and — once iOS 26's Liquid Glass applies —
`shadowColor` is inert besides. Nothing about the API changed the earlier
record's reasoning. What changed is the trade the maintainer chose to make
against it, for iOS specifically: standard iOS conformance and automatic
Liquid Glass over this design's own custom chrome.

**iOS now renders the bottom tab bar with `NativeTabs`** instead, themed
with this app's own colour tokens as closely as its API allows — tint and
icon colour, a background fill for pre-26 iOS, and an attempted label face
and per-state colour. iOS 26 and later gets Liquid Glass for free from the
OS; no `expo-glass-effect` dependency or other application code was added
for it.

**Every other platform is unaffected.** Android, and any platform besides
iOS, keeps exactly the `Tabs`/custom-`tabBar` tree
`2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md` already
describes — same navigator, same rendering, same reasoning. That record's
frontmatter is deliberately left as `status: accepted`, not flipped to
`superseded`: it still fully and correctly describes what ships on every
platform this decision does not touch. This decision supersedes it for iOS
only.

Consequences accepted for iOS: no fixed 90px bar height, no per-cell lime
hairline indicator, and no `Sheet` shadow — standard system tab-bar chrome
throughout, on every iOS version this app supports. A known open upstream
bug ([expo/expo#44029](https://github.com/expo/expo/issues/44029)) may also
keep the tab label's colour from following this app's own per-state tokens
on iOS; that was shipped anyway rather than worked around.
