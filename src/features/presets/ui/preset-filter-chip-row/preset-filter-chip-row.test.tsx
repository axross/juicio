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

  it('pins its own root flexGrow and flexShrink to 0, though the mocked ScrollView never composes it against the framework default', () => {
    render(
      <PresetFilterChipRow
        applied={EMPTY_APPLIED_TAG_FILTERS}
        onOpenAxis={jest.fn()}
        testID="row"
      />,
    );

    const flattenedStyle = StyleSheet.flatten(screen.getByTestId('row').props.style);

    // `@react-native/jest-preset` replaces `ScrollView` with a stand-in
    // rendering `<RCTScrollView {...this.props} />`, so the real
    // `compose(baseStyle, style)` never runs here — this pins only this
    // row's own declared style, not the framework composition the fix
    // depends on.
    expect(flattenedStyle.flexGrow).toBe(0);
    expect(flattenedStyle.flexShrink).toBe(0);
  });
});
