// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { Switch } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { SwitchRow } from './switch-row';

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

describe('<SwitchRow />', () => {
  it('turns on, and fires the toggleOn haptic, when pressed anywhere on the row while off', async () => {
    const onValueChange = jest.fn();
    await render(
      <SwitchRow
        label="Share usage analytics"
        value={false}
        onValueChange={onValueChange}
        position="single"
        testID="row"
      />,
    );

    await fireEvent.press(screen.getByTestId('row'));

    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
  });

  it('turns off, and fires the toggleOff haptic, when pressed anywhere on the row while on', async () => {
    const onValueChange = jest.fn();
    await render(
      <SwitchRow
        label="Share usage analytics"
        value={true}
        onValueChange={onValueChange}
        position="single"
        testID="row"
      />,
    );

    await fireEvent.press(screen.getByTestId('row'));

    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOff);
  });

  it('reports its current value on the nested native Switch', async () => {
    await render(
      <SwitchRow
        label="Share usage analytics"
        value={true}
        onValueChange={jest.fn()}
        position="single"
        testID="row"
      />,
    );

    expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true);
  });

  it('also toggles when the native Switch itself reports a change', async () => {
    const onValueChange = jest.fn();
    await render(
      <SwitchRow
        label="Share usage analytics"
        value={false}
        onValueChange={onValueChange}
        position="single"
        testID="row"
      />,
    );

    await fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);

    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
  });

  it('reports its own accessibility role, label, and checked state', async () => {
    await render(
      <SwitchRow
        label="Share usage analytics"
        value={true}
        onValueChange={jest.fn()}
        position="single"
        testID="row"
      />,
    );

    const root = screen.getByTestId('row');

    expect(root.props.accessibilityRole).toBe('switch');
    expect(root.props.accessibilityLabel).toBe('Share usage analytics');
    expect(root.props.accessibilityState).toEqual({ checked: true });
  });
});
