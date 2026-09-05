// registers this project's real themes and namespaces — see
// `@/features/evaluations/ui/analyze-screen/analyze-screen.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { lightTheme } from '@/core/theme/tokens';

import { NewPresetFab } from './new-preset-fab';

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `@/shared/ui/button/button.test.tsx`'s identical comment) —
// and that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<NewPresetFab />', () => {
  it('renders the plus icon beside the New Preset label', async () => {
    await render(<NewPresetFab onPress={jest.fn()} testID="fab" />);

    expect(screen.getByTestId('fab')).toBeTruthy();
    expect(screen.getByText('New Preset')).toBeTruthy();
  });

  it('carries an accessibility role and label for an icon-plus-label button', async () => {
    await render(<NewPresetFab onPress={jest.fn()} testID="fab" />);

    const root = screen.getByTestId('fab');
    expect(root.props.accessibilityRole).toBe('button');
    expect(root.props.accessibilityLabel).toBe('New Preset');
  });

  it('fires the primaryAction haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(<NewPresetFab onPress={onPress} testID="fab" />);

    await fireEvent.press(screen.getByTestId('fab'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for this component's own root `Pressable`, mirroring
// `NewPlayerFab`'s identical suite — this component takes no position of
// its own (its own doc comment), so its caller,
// `../preset-list-screen/preset-list-screen.tsx`, is the one that merges a
// placement style in through this prop.
describe('<NewPresetFab /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(<NewPresetFab onPress={jest.fn()} testID="fab" style={{ bottom: 24 }} />);

    const root = screen.getByTestId('fab');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    expect(flattenedStyle).toMatchObject({ bottom: 24 });
    expect(flattenedStyle).toHaveProperty('borderRadius');
  });

  it('draws its own deliberately-not-pill radius and bottom-anchored shadow, mirroring NewPlayerFab', async () => {
    await render(<NewPresetFab onPress={jest.fn()} testID="fab" />);

    const root = screen.getByTestId('fab');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    expect(flattenedStyle.borderRadius).toBe(lightTheme.radius.md);
    expect(flattenedStyle.borderRadius).not.toBe(lightTheme.radius.full);
    expect(flattenedStyle.boxShadow).toEqual(lightTheme.effects.sheetInverted);
  });
});
