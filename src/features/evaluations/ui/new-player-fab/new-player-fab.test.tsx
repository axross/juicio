// registers this project's real themes and namespaces — see
// `../analyze-screen/analyze-screen.test.tsx` for why this side-effect
// import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { lightTheme } from '@/core/theme/tokens';

import { NewPlayerFab } from './new-player-fab';

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `../../../../shared/ui/button/button.test.tsx`'s identical
// comment) — and that reaches `@sentry/react-native` via `report-error`,
// which starts a real `setInterval` nothing here clears. mocking
// `report-error` too keeps the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<NewPlayerFab />', () => {
  it('renders the plus icon beside the New Player label', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    expect(screen.getByTestId('fab')).toBeTruthy();
    expect(screen.getByText('New Player')).toBeTruthy();
  });

  it('carries an accessibility role and label for an icon-plus-label button', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    const root = screen.getByTestId('fab');
    expect(root.props.accessibilityRole).toBe('button');
    expect(root.props.accessibilityLabel).toBe('New Player');
  });

  // this button's own `handlePress` fires `triggerHaptic(HapticEvent.
  // PrimaryAction)` on every press — the same event the two entry points
  // this component replaces both fired (docs/conventions/haptics.md).
  it('fires the primaryAction haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(<NewPlayerFab onPress={onPress} testID="fab" />);

    await fireEvent.press(screen.getByTestId('fab'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for this component's own root `Pressable`, not merely type-level —
// this component takes no position of its own (its own doc comment), so
// its caller, `../analyze-screen/analyze-screen.tsx`, is the one that
// merges a placement style in through this prop.
describe('<NewPlayerFab /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" style={{ bottom: 24 }} />);

    const root = screen.getByTestId('fab');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's placement survived...
    expect(flattenedStyle).toMatchObject({ bottom: 24 });
    // ...alongside this component's own fill, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('borderRadius');
  });

  it('draws its own deliberately-not-pill radius and bottom-anchored shadow, not a typical FAB’s', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    const root = screen.getByTestId('fab');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // `theme.radius.md`, never `theme.radius.full` — the plan's own
    // human-approved departure from a typical FAB's fully-rounded pill
    // (this component's own doc comment).
    expect(flattenedStyle.borderRadius).toBe(lightTheme.radius.md);
    expect(flattenedStyle.borderRadius).not.toBe(lightTheme.radius.full);
    expect(flattenedStyle.boxShadow).toBe(lightTheme.effects.sheetInverted);
  });
});
