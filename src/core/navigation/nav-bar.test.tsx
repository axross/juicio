// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { NavBar } from './nav-bar';

jest.mock('@/core/haptics/haptics');

// `NavBar` now imports `react-native-reanimated` directly (its own
// scroll-linked blur, issue #260), which reaches into
// `react-native-worklets`'s native module on init — this project's own
// established pattern for that (see `../../shared/ui/bottom-sheet/
// bottom-sheet.test.tsx`'s identical pair of mocks and its own comment for
// why `require()` inside the factory, not a same-file `import`, is what
// gets the load order right against `react-native-reanimated/mock`'s own
// source transitively re-importing Reanimated's real entry point).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// the library's own published Jest mock resolves `useAnimatedStyle`/
// `useAnimatedProps` synchronously at render, rather than deferring to a
// worklet runtime nothing under Jest provides. `reanimatedMock` below is
// `require`d, not `import`ed, for the same CommonJS-interop reason
// `bottom-sheet.test.tsx` and `new-player-fab.test.tsx` both already do.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

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

// `scrollOffset`'s own wiring (issue #260) — whether this header mounts its
// scroll-linked blur overlay at all. per docs/conventions/testing.md, what
// the overlay's own opacity/intensity actually resolves to once scrolled is
// not something a component test can observe here: `interpolate` is a
// no-op under `react-native-reanimated/mock` (see this file's own comment
// above), so asserting a resolved number would only be reading back a
// value the mock invented, not one this component computed — that half
// stays a manual, on-device check.
describe('<NavBar /> scroll-linked blur', () => {
  it('mounts no blur overlay when the caller has nothing to scroll', async () => {
    await render(<NavBar title="Edit Preset" testID="nav-bar" />);

    expect(screen.queryByTestId('nav-bar-blur')).toBeNull();
    expect(screen.queryByTestId('nav-bar-scroll-tint')).toBeNull();
  });

  it('mounts the blur overlay once a screen hands it a live scroll offset', async () => {
    // `reanimatedMock.useSharedValue` is a plain function under the mock,
    // not a real hook bound to render context — the same "call it directly
    // in the test body" pattern `bottom-sheet.test.tsx` already establishes
    // for building a `SharedValue` fixture outside a component.
    const scrollOffset = reanimatedMock.useSharedValue(0);

    await render(<NavBar title="History" scrollOffset={scrollOffset} testID="nav-bar" />);

    expect(screen.getByTestId('nav-bar-blur')).toBeTruthy();
    expect(screen.getByTestId('nav-bar-scroll-tint')).toBeTruthy();
  });
});
