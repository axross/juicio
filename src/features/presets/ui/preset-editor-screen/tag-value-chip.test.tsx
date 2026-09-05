import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { TagValueChip } from './tag-value-chip';

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<TagValueChip />', () => {
  it('renders its value as the visible label', () => {
    render(<TagValueChip value="BTN" active={false} onPress={jest.fn()} testID="chip" />);

    expect(screen.getByText('BTN')).toBeVisible();
  });

  it('exposes checked via accessibilityState when active', () => {
    render(<TagValueChip value="BTN" active onPress={jest.fn()} testID="chip" />);

    expect(screen.getByTestId('chip').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('exposes unchecked via accessibilityState when not active', () => {
    render(<TagValueChip value="BTN" active={false} onPress={jest.fn()} testID="chip" />);

    expect(screen.getByTestId('chip').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('calls onPress with its own value on press', () => {
    const onPress = jest.fn();
    render(<TagValueChip value="BTN" active={false} onPress={onPress} testID="chip" />);

    fireEvent.press(screen.getByTestId('chip'));

    expect(onPress).toHaveBeenCalledWith('BTN');
  });

  it('fires the toggleOn haptic when pressed while inactive', () => {
    render(<TagValueChip value="BTN" active={false} onPress={jest.fn()} testID="chip" />);

    fireEvent.press(screen.getByTestId('chip'));

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
  });

  it('fires the toggleOff haptic when pressed while active', () => {
    render(<TagValueChip value="BTN" active onPress={jest.fn()} testID="chip" />);

    fireEvent.press(screen.getByTestId('chip'));

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOff);
  });

  it('exposes the checkbox role', () => {
    render(<TagValueChip value="BTN" active={false} onPress={jest.fn()} testID="chip" />);

    expect(screen.getByTestId('chip').props.accessibilityRole).toBe('checkbox');
  });
});
