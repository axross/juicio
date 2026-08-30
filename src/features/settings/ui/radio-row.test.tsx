// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { RadioRow } from './radio-row';

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

// `RadioRow`'s own `handlePress` fires `triggerHaptic(HapticEvent.SelectionChange)`
// on every press, the already-selected option re-pressed included — per
// its own doc comment and `../../../core/haptics/haptics.ts`'s event
// table.
describe('<RadioRow />', () => {
  it('fires the selectionChange haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(
      <RadioRow
        label="English"
        selected={false}
        onPress={onPress}
        position="single"
        testID="row"
      />,
    );

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });
});

// proves docs/conventions/component-contracts.md's "Props Inherit the Root
// Child Element's Own Props" and "Propagate Rest Props to the Root Child
// Element" rules are real for `RadioRow`'s own root — `<SettingsRow>`,
// which in turn forwards onto its own root `Pressable` — not merely
// type-level.
describe('<RadioRow /> rest props and style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(
      <RadioRow
        label="English"
        selected={false}
        onPress={jest.fn()}
        position="single"
        testID="row"
        style={{ marginTop: 10 }}
      />,
    );

    const root = screen.getByTestId('row');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside `SettingsRow`'s own chrome, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('backgroundColor');
  });

  it('propagates a prop this project names nothing for, straight through to its own root', async () => {
    await render(
      <RadioRow
        label="English"
        selected={false}
        onPress={jest.fn()}
        position="single"
        testID="row"
        hitSlop={8}
      />,
    );

    expect(screen.getByTestId('row').props.hitSlop).toBe(8);
  });
});
