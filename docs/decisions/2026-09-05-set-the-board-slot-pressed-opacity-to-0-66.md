---
status: accepted
---

# Set the Board Slot Pressed Opacity to 0.66

Each of the board's five slots fades while a finger is down on it. The
design file draws no pressed state for this slot at all, so both the
mechanism (opacity, not a border recolour) and its exact value are an
implementer's choice, presented as option 2B of a three-option exhibit and
chosen over the exhibit's other options.

0.66 — two thirds — was chosen deliberately short of React Native's own
`TouchableOpacity` default (0.2). An empty slot's dashed outline is already
faint; fading it all the way to 0.2 reads as the slot disappearing rather
than as a press response, on an outline this thin. 0.66 keeps the slot
visibly present through the press while still reading as a distinct,
responsive state.

The exhibit that presented this option recorded the signal as deliberately
subtle, and never as the only signal a press produces: the sheet opening and
the `primaryAction` haptic both confirm the press independently of whatever
the opacity itself reads as under a real fingertip, which is a device check
this decision does not attempt to settle from a screenshot or a test.

Alternative considered: recolouring the slot's border instead of fading its
opacity (a different option from the same exhibit). Rejected in favour of
opacity, which reads consistently against both a filled and an empty slot
without needing a second, card-aware recolour rule for the filled case.
