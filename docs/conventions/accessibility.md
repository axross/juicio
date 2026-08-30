# Accessibility

How this project connects a form field's hint and error text to assistive
technology on React Native, where the web pattern for that —
`aria-describedby` — has no cross-platform equivalent. General accessibility
practice, including the states-and-feedback rules a form's submit control
must satisfy, is not restated here: the installed
[`high-fidelity-ui-design`](../../.claude/skills/high-fidelity-ui-design/SKILL.md)
capability owns that, and loads whenever a task touches interaction states or
assistive technology. What follows is this project's own answer for the one
gap that capability's platform-agnostic guidance cannot settle by itself —
which React Native API actually carries a field's description across both
platforms.

## There Is No Cross-Platform `aria-describedby` Equivalent

A change MUST NOT use `accessibilityLabelledBy` or `accessibilityLiveRegion`
(`aria-live`) to associate a hint or an error with its field: both are
documented `@platform android` in React Native's own type definitions
(verified against `node_modules/react-native`'s types at 0.86.3, not from
recall), so a mechanism built on either would announce a field's description
on Android and say nothing at all on iOS. A mechanism that works on one
platform only is worse than one that works on both — it passes a manual
check run on a single device and then fails silently for every user of the
other platform, with nothing in this project's test suite able to catch the
gap.

## A Field's Error Reaches the Input via `accessibilityHint`

A change MUST set the underlying `TextInput`'s `accessibilityHint` to the
field's `error` when one is present, and to its `hint` otherwise — see
[`TextField`](../../src/features/feedback/ui/text-field.tsx). This is the
closest channel that travels cross-platform *with* the control itself:
`accessibilityHint` is available on both iOS and Android, unlike the two
Android-only APIs above. It is an imperfect fit — React Native documents
`accessibilityHint` as describing "what will happen when they perform an
action," not a field's current state or requirement — accepted because
nothing closer reaches both platforms. `TextField`'s visible label, hint,
and error `Text` nodes stay exactly as they render today; this only adds a
second, non-visual path to the same information.

## The Form Announces a Validation Failure, Not the Field

A change MUST call `AccessibilityInfo.announceForAccessibility` with the
failure text at the point validation fails on a submit press — see
`handleSubmit` in
[`feedback-form.tsx`](../../src/features/feedback/ui/feedback-form.tsx). This
belongs to the form, never to `TextField` itself: only the component running
validation on press knows that a press just failed, and by that point focus
sits on the submit control the user pressed, not on the field carrying the
new error — `accessibilityHint` above only reaches someone who moves focus
back to that field, so the announcement is what reaches someone who does
not. A change MUST NOT route this announcement through either Android-only
API named above, for the same cross-platform reason.

## This Pattern Is the Precedent, Not a Feedback-Screen-Only Rule

These three rules apply to any future form field this app adds, not only to
the Feedback screen that introduced them: a change adding a new validated
field MUST wire its hint and error through `accessibilityHint` the same way,
and MUST announce a validation failure from the component that runs the
validation, never from the field.
