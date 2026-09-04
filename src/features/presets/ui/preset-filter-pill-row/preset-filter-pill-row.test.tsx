import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { EMPTY_APPLIED_TAG_FILTERS, type AppliedTagFilters } from '../../adapter/filter-presets';
import { PresetFilterPillRow } from './preset-filter-pill-row';

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<PresetFilterPillRow />', () => {
  it('renders nothing at all while no filter is applied', () => {
    const { toJSON } = render(
      <PresetFilterPillRow applied={EMPTY_APPLIED_TAG_FILTERS} onRemove={jest.fn()} testID="row" />,
    );

    expect(toJSON()).toBeNull();
  });

  it('renders one pill per applied value, in the fixed axis order and each axis’s own catalog order', () => {
    const applied: AppliedTagFilters = {
      ...EMPTY_APPLIED_TAG_FILTERS,
      action: ['Open'],
      position: ['BTN', 'CO'],
      players: ['6max'],
    };
    render(<PresetFilterPillRow applied={applied} onRemove={jest.fn()} testID="row" />);

    // position (Position axis, catalog order CO before BTN) comes before
    // players, which comes before action — TAG_AXIS_ORDER's own order.
    expect(screen.getByTestId('pill-position-BTN')).toHaveTextContent('BTN');
    expect(screen.getByTestId('pill-position-CO')).toHaveTextContent('CO');
    expect(screen.getByTestId('pill-players-6max')).toHaveTextContent('6max');
    expect(screen.getByTestId('pill-action-Open')).toHaveTextContent('Open');
  });

  it('renders a pill value verbatim, never reformatted with a space', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, stack: ['100BB'] };
    render(<PresetFilterPillRow applied={applied} onRemove={jest.fn()} testID="row" />);

    expect(screen.getByTestId('pill-stack-100BB')).toHaveTextContent('100BB');
  });

  it('fires the secondaryAction haptic and calls onRemove with the pressed pill’s own axis and value', () => {
    const onRemove = jest.fn();
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN'] };
    render(<PresetFilterPillRow applied={applied} onRemove={onRemove} testID="row" />);

    fireEvent.press(screen.getByTestId('pill-position-BTN'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('position', 'BTN');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SecondaryAction);
  });
});
