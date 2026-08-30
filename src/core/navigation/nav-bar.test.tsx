// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { NavBar } from './nav-bar';

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// `NavBar`'s own `handleBack` fires `triggerHaptic(HapticEvent.SecondaryAction)`
// on every back-button press, per `../haptics/haptics.ts`'s event table —
// the one thing this file covers, not `NavBar`'s already-tested rendering.
describe('<NavBar /> back button', () => {
  it('fires the secondaryAction haptic and calls onBack on press', async () => {
    const onBack = jest.fn();
    await render(<NavBar title="Feedback" onBack={onBack} testID="nav-bar" />);

    // `back` is a non-root child's local testID (docs/conventions/
    // component-contracts.md's "A Non-Root Child Gets Its Own Local
    // testID"), no longer unique across the tree — scoped through the
    // root's own `nav-bar` testID, the same way a Maestro flow scopes it
    // with `childOf`.
    await fireEvent.press(within(screen.getByTestId('nav-bar')).getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SecondaryAction);
  });
});

// proves docs/conventions/component-contracts.md's "Props Inherit the Root
// Child Element's Own Props" and "Propagate Rest Props to the Root Child
// Element" rules are real for `NavBar`'s own root `View`, not merely
// type-level.
describe('<NavBar /> rest props and style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(<NavBar title="Feedback" testID="nav-bar" style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('nav-bar');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this component's own root background, which a caller
    // replacing rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('backgroundColor');
  });

  it('propagates a prop this project names nothing for, straight through to its own root', async () => {
    await render(<NavBar title="Feedback" testID="nav-bar" accessibilityHint="closes the sheet" />);

    expect(screen.getByTestId('nav-bar').props.accessibilityHint).toBe('closes the sheet');
  });
});
