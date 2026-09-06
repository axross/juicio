import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { EMPTY_APPLIED_TAG_FILTERS, type AppliedTagFilters } from '../../adapter/filter-presets';
import { PresetFilterChipRow } from './preset-filter-chip-row';

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<PresetFilterChipRow />', () => {
  it('renders one chip per tag axis, in the fixed Position, # of Players, Depth, Action order', () => {
    render(
      <PresetFilterChipRow
        applied={EMPTY_APPLIED_TAG_FILTERS}
        onOpenAxis={jest.fn()}
        testID="row"
      />,
    );

    expect(screen.getByTestId('chip-position')).toHaveTextContent('Position');
    expect(screen.getByTestId('chip-players')).toHaveTextContent('# of Players');
    expect(screen.getByTestId('chip-stack')).toHaveTextContent('Depth');
    expect(screen.getByTestId('chip-action')).toHaveTextContent('Action');
  });

  it('fires the selectionChange haptic and calls onOpenAxis with the pressed chip’s own axis', () => {
    const onOpenAxis = jest.fn();
    render(
      <PresetFilterChipRow
        applied={EMPTY_APPLIED_TAG_FILTERS}
        onOpenAxis={onOpenAxis}
        testID="row"
      />,
    );

    fireEvent.press(screen.getByTestId('chip-stack'));

    expect(onOpenAxis).toHaveBeenCalledTimes(1);
    expect(onOpenAxis).toHaveBeenCalledWith('stack');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });

  it('exposes accessibilityState.selected true only for an axis that currently carries an applied filter', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN'] };
    render(<PresetFilterChipRow applied={applied} onOpenAxis={jest.fn()} testID="row" />);

    expect(screen.getByTestId('chip-position').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('chip-players').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('never grows into or shrinks out of its own height, so it cannot claim the screen’s spare vertical space', () => {
    render(
      <PresetFilterChipRow
        applied={EMPTY_APPLIED_TAG_FILTERS}
        onOpenAxis={jest.fn()}
        testID="row"
      />,
    );

    const flattenedStyle = StyleSheet.flatten(screen.getByTestId('row').props.style);

    // `ScrollView`'s own base style otherwise sets both to 1 for a
    // horizontal scroller, which is exactly the framework default this row
    // must override — see preset-filter-chip-row.tsx's own `root` style.
    expect(flattenedStyle.flexGrow).toBe(0);
    expect(flattenedStyle.flexShrink).toBe(0);
  });
});
