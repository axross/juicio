// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../segmented-tabs/segmented-tabs.test.tsx`
// for why this side-effect import must run before anything themed
// renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronLeftIcon } from '@/core/icons/chevron-left-icon';

import { Button } from './button';

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

// `Button`'s own `handlePress` fires `triggerHaptic(HapticEvent.PrimaryAction)`
// on every press — per its own doc comment and
// `../../../core/haptics/haptics.ts`'s event table.
describe('<Button />', () => {
  it('fires the primaryAction haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(
      <Button label="New Player" Icon={ChevronLeftIcon} onPress={onPress} testID="button" />,
    );

    await fireEvent.press(screen.getByTestId('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });
});
