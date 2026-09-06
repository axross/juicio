// registers this project's real themes and namespaces — see
// `@/shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why this
// side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — `BottomSheet`, which this
// component composes, mounts a `GestureHandlerRootView` internally via its
// own `tap`/`pan` gestures (see `@/shared/ui/bottom-sheet/
// bottom-sheet.test.tsx`).
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { BlurTargetProvider } from '@/shared/ui/blur-target/blur-target';
import { PortalHost } from '@/shared/ui/portal/portal';

import { PresetTagPickerSheet } from './preset-tag-picker-sheet';

// see `@/shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own comment on why
// both of these are lazy `require()`s inside the mock factory — `BottomSheet`,
// which this component composes, imports `react-native-reanimated` directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

async function renderSheet({
  visible = true,
  axis = 'position' as 'position' | 'players' | 'stack' | 'action' | null,
  appliedValues = [] as readonly string[],
} = {}) {
  const onToggleValue = jest.fn();
  const onRequestClose = jest.fn();

  // `PresetTagPickerSheet` renders through `BottomSheet`'s own
  // `<PortalHost />` (`usePortal`), so every render here needs one as an
  // ancestor — `usePortal` throws without it.
  await render(
    <BlurTargetProvider>
      <PortalHost>
        <PresetTagPickerSheet
          visible={visible}
          axis={axis}
          appliedValues={appliedValues}
          onToggleValue={onToggleValue}
          onRequestClose={onRequestClose}
          testID="sheet"
        />
      </PortalHost>
    </BlurTargetProvider>,
  );

  return { onToggleValue, onRequestClose };
}

describe('<PresetTagPickerSheet />', () => {
  it("renders the axis's own display label as the sheet's heading", async () => {
    await renderSheet({ axis: 'players' });

    expect(screen.getByTestId('heading', { includeHiddenElements: true }).props.children).toBe(
      '# of Players',
    );
  });

  it("renders every one of the axis's own catalog values as a row, in the catalog's own order", async () => {
    await renderSheet({ axis: 'action' });

    const panel = screen.getByTestId('panel', { includeHiddenElements: true });
    const rows = within(panel).getAllByRole('checkbox');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Open',
      'Call',
      '3bet',
      '4bet',
    ]);
  });

  it('marks only a value present in appliedValues as checked', async () => {
    await renderSheet({ axis: 'position', appliedValues: ['BTN'] });

    expect(
      screen.getByTestId('value-BTN', { includeHiddenElements: true }).props.accessibilityState,
    ).toEqual({ checked: true });
    expect(
      screen.getByTestId('value-CO', { includeHiddenElements: true }).props.accessibilityState,
    ).toEqual({ checked: false });
  });

  it('fires toggleOn and calls onToggleValue when pressing a value not yet applied', async () => {
    const { onToggleValue } = await renderSheet({ axis: 'position', appliedValues: [] });

    fireEvent.press(screen.getByTestId('value-BTN', { includeHiddenElements: true }));

    expect(onToggleValue).toHaveBeenCalledWith('BTN');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
  });

  it('fires toggleOff and calls onToggleValue when pressing a value already applied', async () => {
    const { onToggleValue } = await renderSheet({ axis: 'position', appliedValues: ['BTN'] });

    fireEvent.press(screen.getByTestId('value-BTN', { includeHiddenElements: true }));

    expect(onToggleValue).toHaveBeenCalledWith('BTN');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOff);
  });

  it('forwards visible through to the underlying BottomSheet', async () => {
    await renderSheet({ visible: false });

    expect(screen.queryByTestId('panel', { includeHiddenElements: true })).toBeNull();
  });

  it('renders no heading or rows while axis is null', async () => {
    await renderSheet({ axis: null });

    expect(screen.queryByTestId('heading', { includeHiddenElements: true })).toBeNull();
  });

  it('names itself and its handle with one fixed identity regardless of which axis is open', async () => {
    await renderSheet({ axis: 'stack' });

    expect(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe('Choose values to filter the preset list by');
    expect(
      screen.getByTestId('handle', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe('Dismiss the filter picker');
  });
});
