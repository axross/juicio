// registers this project's real themes and namespaces — see
// `@/features/evaluations/ui/analyze-screen/analyze-screen.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import type { Preset } from '../../model/preset';
import { PresetRow } from './preset-row';

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

const PRESET: Preset = {
  id: 42,
  name: 'BTN Open',
  handRange: new Set(['AA', 'AKs']),
  tags: { position: ['BTN'], players: ['6max'], stack: ['100BB'], action: ['Open'] },
};

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<PresetRow />', () => {
  it('renders the preset’s own name', () => {
    render(<PresetRow preset={PRESET} onPress={jest.fn()} testID="row" />);

    expect(screen.getByTestId('name')).toHaveTextContent('BTN Open');
  });

  it('joins every axis with a selected value in the fixed Position, # of Players, Depth, Action order', () => {
    render(<PresetRow preset={PRESET} onPress={jest.fn()} testID="row" />);

    expect(screen.getByTestId('subtitle')).toHaveTextContent('BTN, 6max, 100BB, Open');
  });

  it('omits an axis with nothing selected for this preset from the tag summary', () => {
    const preset: Preset = {
      ...PRESET,
      tags: { position: ['BTN'], players: [], stack: [], action: ['Open'] },
    };
    render(<PresetRow preset={preset} onPress={jest.fn()} testID="row" />);

    expect(screen.getByTestId('subtitle')).toHaveTextContent('BTN, Open');
  });

  it('fires the primaryAction haptic and calls onPress with the preset’s own id on press', () => {
    const onPress = jest.fn();
    render(<PresetRow preset={PRESET} onPress={onPress} testID="row" />);

    fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(42);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  it('carries an accessible name combining the preset’s name and tag summary', () => {
    render(<PresetRow preset={PRESET} onPress={jest.fn()} testID="row" />);

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('BTN Open. BTN, 6max, 100BB, Open');
  });
});
