// registers this project's real themes and namespaces — see
// `../analyze-screen/analyze-screen.test.tsx` for why this side-effect
// import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { lightTheme } from '@/core/theme/tokens';

import { glowOpacitiesAt, NewPlayerFab, PRESS_SCALE } from './new-player-fab';

// this component reaches into `react-native-reanimated` directly (the
// breathing glow and the press-down scale) — the same two
// mocks `../player-row/player-row.test.tsx`'s own matching comment
// explains: the real module reaches into `react-native-worklets`' native
// module on import, and `react-native-reanimated/mock`'s own `withTiming`/
// `withSpring`/`withRepeat` resolve synchronously rather than scheduling a
// real, multi-frame animation that would never settle inside one
// synchronous test tick.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `../../../../shared/ui/button/button.test.tsx`'s identical
// comment) — and that reaches `@sentry/react-native` via `report-error`,
// which starts a real `setInterval` nothing here clears. mocking
// `report-error` too keeps the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// `usePrefersReducedMotion` resolves asynchronously and returns `false` on
// first render — mocking the hook directly, the same way
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own matching
// comment does, is what reaches the reduce-motion branch deterministically
// rather than racing a real `AccessibilityInfo` promise.
jest.mock('@/core/motion/use-prefers-reduced-motion');

// wraps only `motionSpring` in a `jest.fn`, keeping every other export (the
// config object included) the real module's own — a module replacement,
// not a `jest.spyOn` on the real export, for the same reason
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own matching
// comment gives for its identical `motionColor` mock: `motionSpring`
// carries reanimated's own `'worklet'` directive, and that Babel transform
// resolves its internal `withSpring` call through something other than a
// live property read on `reanimatedMock` below — confirmed empirically,
// not from the transform's own documentation — so a
// `jest.spyOn(reanimatedMock, 'withSpring')` never observes a call
// `motionSpring` itself made. Replacing this one export at `jest.mock` time
// sidesteps that rather than fighting it.
jest.mock('@/core/motion/tokens', () => {
  const actual = jest.requireActual('@/core/motion/tokens');
  return {
    ...actual,

    motionSpring: jest.fn(actual.motionSpring),
  };
});

const mockedTriggerHaptic = jest.mocked(triggerHaptic);
const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);
const mockedMotionSpring = jest.mocked(motionSpring);

// the same singleton object `new-player-fab.tsx`'s own import resolves to —
// see `player-row.test.tsx`'s own matching comment on why a plain
// `require()` reaches ordinary, spy-able properties where the real,
// compiled module's ESM-interop getters would refuse `jest.spyOn`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
  mockedUsePrefersReducedMotion.mockReturnValue(false);
  mockedMotionSpring.mockClear();
});

afterEach(() => {
  // `jest.spyOn(reanimatedMock, ...)` below (the resting-glow and
  // press-down suites) would otherwise keep accumulating call history
  // across tests — this restores each spy to `reanimatedMock`'s own
  // original export between tests, the same shape
  // `player-row.test.tsx`'s own committed-delete suite uses.
  jest.restoreAllMocks();
});

/** flattens a rendered root's own `style` prop — an array under this
 * component's own composition, a single object were it ever a bare style —
 * into one merged object a test can read properties off directly. */
function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
    : (style as Record<string, unknown>);
}

/** `#rrggbb` → its three 0–255 channels, comma-joined — a test-local
 * duplicate of this component's own private `hexToRgbChannels`, the same
 * way this file duplicates no other implementation detail: kept local
 * rather than exported from `new-player-fab.tsx` for a single caller. */
function hexToRgbChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

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
  // the haptic still fires from `onPress` alone,
  // never from the `onPressIn`/`onPressOut` handlers below.
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
// real for this component's own root, not merely type-level — this
// component takes no position of its own (its own doc comment), so its
// caller, `../analyze-screen/analyze-screen.tsx`, is the one that merges a
// placement style in through this prop. this component
// resolves a caller-supplied style function itself, rather than handing it
// to `Pressable`'s own render-prop callback (this component's own doc
// comment) — this suite's own static-style case below is unaffected either
// way, since a plain object caller style never exercises that branch.
describe('<NewPlayerFab /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" style={{ bottom: 24 }} />);

    const flattenedStyle = flattenStyle(screen.getByTestId('fab').props.style);

    // the caller's placement survived...
    expect(flattenedStyle).toMatchObject({ bottom: 24 });
    // ...alongside this component's own fill, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('borderRadius');
  });

  it('resolves a caller-supplied style function against its own pressed state', async () => {
    const style = jest.fn((state: { pressed: boolean }) => ({ opacity: state.pressed ? 0.5 : 1 }));

    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" style={style} />);

    expect(style).toHaveBeenCalledWith({ pressed: false });
    expect(flattenStyle(screen.getByTestId('fab').props.style).opacity).toBe(1);

    // the behavior this whole refactor exists to preserve (this component's
    // own doc comment on why `pressed` moved to local state): a real press
    // still re-invokes the caller's style function with the live pressed
    // state, and the merged style still reflects whatever it returns.
    fireEvent(screen.getByTestId('fab'), 'pressIn', {});
    expect(style).toHaveBeenLastCalledWith({ pressed: true });
    expect(flattenStyle(screen.getByTestId('fab').props.style).opacity).toBe(0.5);

    fireEvent(screen.getByTestId('fab'), 'pressOut', {});
    expect(style).toHaveBeenLastCalledWith({ pressed: false });
    expect(flattenStyle(screen.getByTestId('fab').props.style).opacity).toBe(1);
  });

  it('draws its own deliberately-not-pill radius, never a typical FAB’s fully-rounded one', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    const flattenedStyle = flattenStyle(screen.getByTestId('fab').props.style);

    // `theme.radius.md`, never `theme.radius.full` — a deliberate
    // departure from a typical FAB's fully-rounded pill
    // (this component's own doc comment).
    expect(flattenedStyle.borderRadius).toBe(lightTheme.radius.md);
    expect(flattenedStyle.borderRadius).not.toBe(lightTheme.radius.full);
  });
});

// `boxShadow` is built by
// `animatedGlowStyle`, a `useAnimatedStyle` whose result this project's
// Reanimated Jest mock resolves synchronously, at render time, to whatever
// `glowPhase.value` holds at that moment (`0`, the shared value's own
// initial figure — this component's own `useEffect` only ever *mutates*
// that value afterwards, on the JS thread, which triggers no React
// re-render and so never reaches a second, later `useAnimatedStyle` call
// this mock could resolve again). What a unit test can assert through a
// render, the same limitation `../player-row/player-row.tsx`'s own
// committed-delete suite documents, is the *shape* `boxShadow` is built
// from at mount — coloured, two-layer, still bottom-anchored, and (since
// mount always observes `glowPhase.value`'s own initial `0`) at its `dim`
// alpha — not the live brightness a real device's UI thread alone can
// settle. The phase→brightness mapping itself — that `0`/`1` really do
// resolve to `dim`/`bright` and nothing swapped — is verified separately,
// independent of rendering entirely, by the `glowOpacitiesAt` suite below.
describe('<NewPlayerFab /> resting glow (issue #210)', () => {
  it('replaces the plain dark shadow with a colored, two-layer glow drawn from its own accent fill', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    const flattenedStyle = flattenStyle(screen.getByTestId('fab').props.style);
    const accentChannels = hexToRgbChannels(lightTheme.colors.solid.accent.rest);

    expect(flattenedStyle.boxShadow).not.toBe(lightTheme.effects.sheetInverted);
    // both layers are coloured from the button's own accent fill, never
    // black — `rgba(...)` appears exactly twice, one per layer.
    expect(
      (flattenedStyle.boxShadow as string).match(new RegExp(`rgba\\(${accentChannels}`, 'g')),
    ).toHaveLength(2);
  });

  it('keeps the same upward, bottom-anchored two-layer shape sheetInverted draws, never flipped downward', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    const flattenedStyle = flattenStyle(screen.getByTestId('fab').props.style);

    // `sheetInverted`'s own negated offsets, blur, and spread
    // (`src/core/theme/tokens.ts`'s `sheetLayers`), unchanged — see this
    // component's own `GLOW_CONTACT`/`GLOW_BLOOM` doc comment.
    expect(flattenedStyle.boxShadow).toContain('0px -4px 6px -2px');
    expect(flattenedStyle.boxShadow).toContain('0px -10px 15px -3px');
    // never the downward, positive-offset direction a top-anchored `Sheet`
    // shadow would draw.
    expect(flattenedStyle.boxShadow).not.toMatch(/0px 4px|0px 10px/);
  });

  it('loops continuously between a dimmer and a brighter state when motion is allowed', async () => {
    const withRepeatSpy = jest.spyOn(reanimatedMock, 'withRepeat');

    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1, true);

    // mount always observes `glowPhase.value`'s own initial `0` (this
    // suite's own doc comment above) — `glowOpacitiesAt(0, ...)`, not a
    // duplicated pair of magic numbers, is what the resting `boxShadow`
    // should show at that point.
    //
    // the theme argument is `'dark'`, not `'light'`, for a mock-limitation
    // reason parallel to this suite's own Reanimated-mock notes elsewhere in
    // this file: this project's Unistyles Jest mock
    // (`node_modules/react-native-unistyles/src/mocks.ts`) never sets
    // `rt.themeName` — it is `undefined` on every render this mock ever
    // produces, already documented independently in
    // `../../../settings/ui/theme-screen.test.tsx`'s and
    // `../../../settings/ui/settings-screen.test.tsx`'s own matching
    // comments — so `new-player-fab.tsx`'s own `rt.themeName ?? 'dark'`
    // fallback is what every render in this test file actually exercises,
    // never real per-theme detection. That's fine for this test's own
    // stated scope above (only the *shape* of `boxShadow` at mount, not live
    // theme selection) — the theme-dependent opacity mapping itself is
    // already verified directly and exhaustively, for both `'light'` and
    // `'dark'`, by the `glowOpacitiesAt` suite below, independent of this
    // mock limitation, the same way that suite already sidesteps the
    // Reanimated-mock limitation for the phase mapping. `accentChannels`
    // stays `lightTheme`-derived below, unaffected: `theme.colors...`
    // resolution works fine in this mock (it resolves to whichever theme is
    // registered first, `light` — see this file's own other `lightTheme`
    // assertions), only `rt.themeName` doesn't — so this render correctly
    // shows light-theme accent color channels alongside dark-fallback
    // opacity numbers, which is expected, not an inconsistency.
    const flattenedStyle = flattenStyle(screen.getByTestId('fab').props.style);
    const accentChannels = hexToRgbChannels(lightTheme.colors.solid.accent.rest);
    const { contactOpacity, bloomOpacity } = glowOpacitiesAt(0, 'dark');
    expect(flattenedStyle.boxShadow).toContain(`rgba(${accentChannels}, ${contactOpacity})`);
    expect(flattenedStyle.boxShadow).toContain(`rgba(${accentChannels}, ${bloomOpacity})`);
  });

  it('freezes at its brighter end, with no loop, once reduce motion is enabled', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const withRepeatSpy = jest.spyOn(reanimatedMock, 'withRepeat');

    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    expect(withRepeatSpy).not.toHaveBeenCalled();
    // this render-level test doesn't also assert the resulting `boxShadow`
    // carries the *brighter* alpha: this project's Reanimated Jest mock
    // resolves `useAnimatedStyle` synchronously at render, before this
    // component's own `useEffect` ever sets `glowPhase.value` to `1` (this
    // suite's own doc comment above) — the `glowOpacitiesAt` suite below
    // verifies that phase→brightness mapping directly instead, independent
    // of this mock's limitation entirely.
  });
});

// `glowOpacitiesAt` is `animatedGlowStyle`'s own phase→alpha
// math, pulled out to a plain, exported, pure function (`new-player-fab.tsx`'s
// own doc comment above it) specifically so this mapping can be verified
// without ever going through a render or an effect — sidestepping, rather
// than fighting, the Reanimated Jest mock limitation the "resting glow"
// suite above documents. A plain function call, nothing mocked.
//
// the `'light'` and `'dark'` cases below pin `GLOW_CONTACT_OPACITY`/
// `GLOW_BLOOM_OPACITY`'s own figures (`new-player-fab.tsx`'s own doc
// comment) for each theme.
describe('glowOpacitiesAt', () => {
  it('resolves to each layer’s dim opacity at phase 0, light theme', () => {
    expect(glowOpacitiesAt(0, 'light')).toEqual({ contactOpacity: 0.28, bloomOpacity: 0.2 });
  });

  it('resolves to each layer’s bright opacity at phase 1, light theme', () => {
    expect(glowOpacitiesAt(1, 'light')).toEqual({ contactOpacity: 0.56, bloomOpacity: 0.44 });
  });

  it('lands exactly between dim and bright at the phase 0.5 midpoint, light theme', () => {
    const { contactOpacity, bloomOpacity } = glowOpacitiesAt(0.5, 'light');

    // `toBeCloseTo`, not `toEqual`: floating-point multiplication (`phase *
    // (bright - dim)`) lands `contactOpacity` a hair above 0.42 (0.28 +
    // 0.5 * 0.28 === 0.42000000000000004 in IEEE 754 double precision), not
    // a mistake in the mapping itself. `bloomOpacity` lands on exactly 0.32
    // for the same phase, but is asserted the same way for consistency.
    expect(contactOpacity).toBeCloseTo(0.42);
    expect(bloomOpacity).toBeCloseTo(0.32);
  });

  it('resolves to each layer’s dim opacity at phase 0, dark theme', () => {
    expect(glowOpacitiesAt(0, 'dark')).toEqual({ contactOpacity: 0.21, bloomOpacity: 0.15 });
  });

  it('resolves to each layer’s bright opacity at phase 1, dark theme', () => {
    expect(glowOpacitiesAt(1, 'dark')).toEqual({ contactOpacity: 0.42, bloomOpacity: 0.33 });
  });

  it('lands exactly between dim and bright at the phase 0.5 midpoint, dark theme', () => {
    // unlike the light-theme midpoint above, both dark-theme figures land
    // on their exact decimal values at this phase (0.315 and 0.24) — no
    // floating-point remainder to accommodate here, so `toEqual` is exact
    // rather than `toBeCloseTo`.
    expect(glowOpacitiesAt(0.5, 'dark')).toEqual({ contactOpacity: 0.315, bloomOpacity: 0.24 });
  });
});

// the "sinks in" press response. `onPressIn`/`onPressOut` are
// this component's own literal props (this component's own doc
// comment on why `pressed` moved to local state) — unlike `Pressable`'s
// purely internal `state.pressed`, which docs/conventions/design-system.md's
// "Board Slot Pressed State" entry already established this project's own
// test renderer cannot drive, RNTL's `fireEvent` reaches a literal prop
// directly, which is what makes this response — unlike that background
// swap — actually exercisable here.
describe('<NewPlayerFab /> press-down response (issue #210)', () => {
  it('springs down to PRESS_SCALE on pressIn, and back to 1 on pressOut', async () => {
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    fireEvent(screen.getByTestId('fab'), 'pressIn', {});
    expect(mockedMotionSpring).toHaveBeenLastCalledWith(PRESS_SCALE, false);

    fireEvent(screen.getByTestId('fab'), 'pressOut', {});
    expect(mockedMotionSpring).toHaveBeenLastCalledWith(1, false);
  });

  it('jumps instantly between its two end states, with no spring, once reduce motion is enabled', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');
    await render(<NewPlayerFab onPress={jest.fn()} testID="fab" />);

    fireEvent(screen.getByTestId('fab'), 'pressIn', {});
    expect(mockedMotionSpring).toHaveBeenLastCalledWith(PRESS_SCALE, true);

    fireEvent(screen.getByTestId('fab'), 'pressOut', {});
    expect(mockedMotionSpring).toHaveBeenLastCalledWith(1, true);

    // `motionSpring` itself already collapses to an instant jump under
    // reduced motion (its own doc comment) — this confirms the real
    // `withSpring` never ran at all, not merely that the wrapper reported
    // `reduceMotion: true`.
    expect(withSpringSpy).not.toHaveBeenCalled();
  });

  it('composes with a caller-supplied onPressIn/onPressOut rather than replacing them', async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <NewPlayerFab
        onPress={jest.fn()}
        testID="fab"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );

    fireEvent(screen.getByTestId('fab'), 'pressIn', {});
    fireEvent(screen.getByTestId('fab'), 'pressOut', {});

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });
});
