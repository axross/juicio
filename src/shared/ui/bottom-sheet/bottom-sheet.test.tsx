// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` throws (`RNGestureHandlerModule.install is not
// a function`) the moment it tries to reach the native module Jest has no
// binary for.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Profiler, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet as RNStyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  State,
} from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { SharedValue } from 'react-native-reanimated';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionColor, motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { BlurTargetProvider } from '@/shared/ui/blur-target/blur-target';
import { PortalHost } from '@/shared/ui/portal/portal';

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
  panelWidth,
  sheetContentWidth,
} from './bottom-sheet';

// this component imports `react-native-reanimated` directly (its drag runs
// on the UI thread — see its own doc comment), which reaches into
// `react-native-worklets`' native module on init — needed for
// `GestureHandlerRootView` to mount under Jest, same as
// `../selection-grid/selection-grid.test.tsx`. `require()` inside the
// factory, as both libraries' Jest guides show, not a same-file `import`:
// an import-based version reproducibly reached deeper into Reanimated's
// real module init before failing, since `react-native-reanimated/mock`'s
// own source transitively re-imports Reanimated's real entry point, and
// getting the load order right needs `require()`'s lazy indirection.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// the real `withTiming`/`withSpring` schedule an actual multi-frame
// animation, which never resolves inside one synchronous test tick.
// `react-native-reanimated/mock`'s versions call their completion callback
// immediately instead, and its `runOnJS` is the identity function — which
// lets `commitClose`'s animate-then-call-`onRequestClose` sequence (see
// `bottom-sheet.tsx`) resolve synchronously here, with no timer or
// `waitFor` needed below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// `usePrefersReducedMotion` resolves asynchronously and returns `false` on
// first render — by the time a mocked `AccessibilityInfo` could report
// `true`, the visibility effect has already run with the stale `false`.
// mocking the hook directly is what reaches the reduce-motion branch.
jest.mock('@/core/motion/use-prefers-reduced-motion');

// wraps only `motionColor` in a `jest.fn`, keeping every other export (the
// two config objects included) the real module's own — a module
// replacement, not a `jest.spyOn` on the real export, for the same reason
// `tokens.test.ts` itself uses one: `motionColor` carries reanimated's own
// `'worklet'` directive, and that Babel transform resolves its internal
// `withTiming` call through something other than a live property read on
// `reanimatedMock` — confirmed empirically, not from the transform's own
// documentation — so a `jest.spyOn(reanimatedMock, 'withTiming')` never
// observes a call `motionColor` itself made, whichever module made it.
// replacing this one export at `jest.mock` time sidesteps that rather than
// fighting it, the same way `reanimatedMock` above sidesteps `withSpring`/
// `withTiming`'s own non-configurable getters on the real, compiled module.
jest.mock('@/core/motion/tokens', () => {
  const actual = jest.requireActual('@/core/motion/tokens');
  return {
    ...actual,

    motionColor: jest.fn(actual.motionColor),
  };
});

const mockedTriggerHaptic = jest.mocked(triggerHaptic);
const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);
const mockedMotionColor = jest.mocked(motionColor);

// this is the same singleton object `bottom-sheet.tsx`'s own import
// resolves to. its properties stay ordinary and writable — a plain
// CommonJS object literal — unlike the real, compiled module's
// ESM-interop getters (`tokens.test.ts`'s own note), which do not apply
// to this hand-authored mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
  mockedUsePrefersReducedMotion.mockReturnValue(false);
  mockedMotionColor.mockClear();
});

// the JSX every render in this file mounts. `renderSheet` below wraps it
// for a fire-and-forget render; the F1 test calls it directly for RNTL's
// `rerender`, flipping `visible` on the same instance — `wasVisible`'s ref
// state needs to carry across that transition, which a fresh render would
// reset. `maxWidth` defaults to `undefined`, the shape every test in this
// file but the `maxWidth` prop's own describe block below wants — omitting
// it is exactly what every real caller already does.
// `children` defaults to the plain `<Text>` every test before the "content
// drag surface" describe block below wants; that block is the one place
// that overrides it, to render its own `Pressable` or nested gesture in the
// content area instead. `header`, when supplied, is wrapped in
// `<BottomSheetHeader>` and `children` in `<BottomSheetBody>` — this
// component's own compound-child contract now, rather than the old `header`
// prop and plain-`children`-is-body shape (`bottom-sheet.tsx`'s own doc
// comment).
function sheetTree(
  visible: boolean,
  onRequestClose: jest.Mock,
  header?: ReactNode,
  maxWidth?: number,
  children: ReactNode = <Text>sheet content</Text>,
  onOpened?: () => void,
) {
  return (
    <GestureHandlerRootView>
      {
        // `<BlurTargetProvider />` above `<PortalHost />` — mirrors
        // `src/app/_layout.tsx`'s own nesting (see
        // `@/shared/ui/blur-target/blur-target`'s own doc comment for why):
        // `BottomSheet`'s own `useBlurTargetRef()` call throws without a
        // `<BlurTargetProvider />` ancestor, the same way it would with no
        // real root layout mounted above it.
      }
      <BlurTargetProvider>
        <PortalHost>
          <BottomSheet
            visible={visible}
            onRequestClose={onRequestClose}
            onOpened={onOpened}
            accessibilityLabel="Test sheet"
            maxWidth={maxWidth}
            testID="sheet"
          >
            {header !== undefined ? <BottomSheetHeader>{header}</BottomSheetHeader> : null}
            {
              // `testID="body"` — every test in this file but the "content
              // drag scroll gating" describe block below ignores it, the
              // same way every test ignores `sheet`'s own testID prop until
              // it needs one; that block is the one place a test needs a
              // handle on `BottomSheetBody`'s own root to fire a synthetic
              // scroll event at it (`fireContentScroll` below).
            }
            <BottomSheetBody testID="body">{children}</BottomSheetBody>
          </BottomSheet>
        </PortalHost>
      </BlurTargetProvider>
    </GestureHandlerRootView>
  );
}

// `BottomSheet` renders through `<PortalHost />` (`usePortal`, see
// `bottom-sheet.tsx`'s doc comment) rather than in place, so every render
// here needs a `<PortalHost />` ancestor, same as `src/app/_layout.tsx`
// provides for real. builds on `sheetTree` above for one tree definition.
//
// also fires the panel's first layout (`firePanelLayout` below) once the
// panel has mounted — RNTL runs no layout engine (docs/conventions/
// testing.md), so `onLayout` never fires on its own the way a real device's
// always would, and `bottom-sheet.tsx`'s own entrance hangs its spring on
// exactly that event (its own doc comment, entrance option B). every
// caller here that doesn't itself need to inspect the pre-layout state —
// which is every existing test in this file, since this project's own
// reanimated mock already resolves every animation synchronously — gets
// that layout for free, the same way a real device's own layout pass
// would follow immediately. the "entrance start point" describe block below
// is the one place that deliberately bypasses this helper, to observe the
// state a real device's own layout pass has not reached yet.
async function renderSheet(
  visible: boolean,
  onRequestClose: jest.Mock = jest.fn(),
  header?: ReactNode,
  maxWidth?: number,
  children?: ReactNode,
  onOpened?: () => void,
) {
  await render(sheetTree(visible, onRequestClose, header, maxWidth, children, onOpened));
  if (visible) {
    firePanelLayout();
  }
  return onRequestClose;
}

/**
 * synthesises the panel's own first layout (`bottom-sheet.tsx`'s
 * `handlePanelLayout`) — see `renderSheet`'s own doc comment for why this
 * needs firing by hand under RNTL at all. the measured dimensions
 * themselves don't matter to `handlePanelLayout`, which reacts to the event
 * firing at all, not to what it reports — mirrors
 * `docs/conventions/testing.md`'s own synthetic-`onLayout` pattern.
 */
function firePanelLayout() {
  fireEvent(screen.getByTestId('panel', { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } },
  });
}

/**
 * a harness wiring `onRequestClose` to the harness's own `visible` state —
 * the ordinary caller shape (`../../../features/hand-ranges/ui/
 * holding-input-sheet/holding-input-sheet.tsx`'s own `handleRequestClose`
 * does exactly this) — for the exit-timing test below that needs to prove
 * this component keeps rendering even after a real caller's `visible` prop
 * has already gone false, not merely that `onRequestClose` itself fired.
 */
function ControlledSheet({ onRequestCloseSpy }: { onRequestCloseSpy: jest.Mock }) {
  const [visible, setVisible] = useState(true);
  const onRequestClose = jest.fn(() => {
    onRequestCloseSpy();
    setVisible(false);
  });
  return sheetTree(visible, onRequestClose);
}

/**
 * a drag on the handle's own pan gesture (`bottom-sheet.tsx`'s `pan`,
 * exposed via `withTestId` as `sheet-drag`), ending with the given
 * `translationY`/`velocityY` — the two fields `pan.onEnd`'s threshold
 * check reads. a bare `BEGAN` then `END` is enough: `fireGestureHandler`
 * synthesises the `ACTIVE` transition in between (see
 * `../selection-grid/selection-grid.test.tsx`'s `fireTap`), and
 * `onStart`'s `dragStartTranslateY` capture doesn't affect `onEnd`'s
 * decision, which compares `translationY`/`velocityY` directly.
 */
function fireDrag(translationY: number, velocityY: number) {
  fireGestureHandler(getByGestureTestId('drag'), [
    { state: State.BEGAN },
    { state: State.END, translationY, velocityY },
  ]);
}

/**
 * a tap on the handle's own tap gesture (`bottom-sheet.tsx`'s `tap`,
 * exposed via `withTestId` as `sheet-tap`) — a bare `BEGAN` then `END` is
 * enough, the same shape `fireDrag` above uses; `tap.onEnd` reads no
 * event fields of its own.
 */
function fireHandleTap() {
  fireGestureHandler(getByGestureTestId('tap'), [{ state: State.BEGAN }, { state: State.END }]);
}

describe('<BottomSheet />', () => {
  it('renders its children while visible', async () => {
    await renderSheet(true);

    expect(screen.getByText('sheet content')).toBeTruthy();
  });

  it('renders nothing while not visible', async () => {
    await renderSheet(false);

    expect(screen.queryByText('sheet content')).toBeNull();
    expect(screen.queryByTestId('sheet-backdrop')).toBeNull();
  });

  // the backdrop's opacity fades with `translateY`, a Reanimated shared
  // value updated on the UI thread — under
  // `react-native-reanimated/mock`, `useAnimatedStyle`'s returned style
  // isn't reliably observable through a rendered element's `style` prop
  // the way a plain RN style is, so this only asserts the backdrop is
  // there, never a particular opacity. proving the fade itself stays a
  // manual device check.
  it('renders the backdrop while visible', async () => {
    await renderSheet(true);

    expect(screen.getByTestId('backdrop', { includeHiddenElements: true })).toBeTruthy();
  });

  it('never calls onRequestClose while not visible', async () => {
    const onRequestClose = await renderSheet(false);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  // the backdrop's blur layer renders behind the flat-colour one
  // (`bottom-sheet.tsx`'s own doc comment for why paint order matters
  // here), fixed at this project's own approved `intensity`, and sharing —
  // not merely matching — the flat-colour layer's own animated opacity
  // object, so both fade in lockstep off one source rather than two that
  // could drift apart. `BlurView` renders for real here — no mock:
  // docs/conventions/testing.md's own narrow permission to mock a
  // third-party dependency wholesale is for a library with no rendered
  // observable at all (`bar-chart.test.tsx`'s `@shopify/react-native-skia`
  // mock); `BlurView` doesn't qualify — it's a plain class component that
  // renders a real, reachable `View` under `jest-expo`. Read via
  // `UNSAFE_getByType(BlurView)` rather than `getByTestID('backdrop-blur')`:
  // `BlurView`'s own `render()` (`expo-blur`'s source) destructures
  // `tint`/`intensity`/`style` off its own props before spreading the rest
  // onto the host `View` it renders, so that host node's own props never
  // carry `tint`/`intensity` at all — only `UNSAFE_getByType` reads what
  // this project actually passed `BlurView` itself, the "own configuration
  // of a third-party library" testing.md's own rule is asking for.
  // `switch-row.test.tsx`'s own `UNSAFE_getByType(Switch)` already uses this
  // same query for the same reason, against a different native component.
  // Proving the blur *itself* renders on a real device — what
  // `intensity`/`tint`/`blurMethod` actually look like composited — stays a
  // manual device check, same as every other visual claim that document
  // already excludes from this suite.
  it('renders the blur layer behind the backdrop, fixed at this project’s own intensity, sharing the backdrop’s own animated opacity', async () => {
    await renderSheet(true);

    const blurProps = screen.UNSAFE_getByType(BlurView).props as {
      tint?: string;
      intensity?: number;
      blurMethod?: string;
      blurTarget?: unknown;
      style?: StyleProp<ViewStyle>;
    };
    expect(blurProps.tint).toBe('dark');
    expect(blurProps.intensity).toBe(50);
    expect(blurProps.blurMethod).toBe('dimezisBlurViewSdk31Plus');
    expect(blurProps.blurTarget).toBeDefined();

    const backdropStyle = RNStyleSheet.flatten(
      screen.getByTestId('backdrop', { includeHiddenElements: true }).props.style,
    );
    const blurStyle = RNStyleSheet.flatten(blurProps.style);
    // the same full-bleed positioning as the flat-colour layer — not merely
    // an equal opacity by coincidence.
    expect(blurStyle.position).toBe('absolute');
    expect(blurStyle.opacity).toBe(backdropStyle.opacity);
  });

  // `sheetOpen` fires from `useAnimatedReaction` (`bottom-sheet.tsx`)
  // rather than from `withSpring`'s own completion callback — and this
  // project's reanimated mock makes `useAnimatedReaction` a no-op
  // (`node_modules/react-native-reanimated/src/mock.ts`'s own
  // `hook.useAnimatedReaction: NOOP`, confirmed by reading that file, not
  // assumed), so nothing that only renders this component can observe the
  // reaction firing at all. This still asserts the one thing that is true
  // and worth guarding here: the mount itself does not fire the haptic
  // through some *other*, synchronous path — see the `<BottomSheet />
  // entrance haptic timing` describe block below for how this project
  // actually pins the open haptic's own behaviour despite the mock
  // limitation, and `./entrance-arrival.test.ts` for the rule the reaction
  // itself runs.
  it('does not fire sheetOpen synchronously on mount', async () => {
    await renderSheet(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });

  // the panel's `accessibilityViewIsModal` (see `bottom-sheet.tsx`) gives
  // it an accessible identity distinct from the drag handle's
  // `accessibilityLabel` (which names the dismiss affordance, not the
  // sheet) — a screen reader entering the modal needs to hear what it is,
  // not only how to leave it.
  it('gives the panel the caller-supplied accessibilityLabel', async () => {
    await renderSheet(true);

    expect(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe('Test sheet');
  });

  // on a wide viewport (a tablet, or an unfolded foldable), the panel's own
  // rendered `width` must agree with `panelWidth` — the same cap-and-fill
  // figure `sidePadding`/`sheetContentWidth` already use — and stay
  // centred. `maxWidth` is not a separate static style prop to pin here
  // (`bottom-sheet.tsx`'s `panelWidth` doc comment covers why: the cap is
  // baked into this one computed `width`, not a second CSS property
  // alongside a `100%` one). RNTL runs no layout engine (docs/
  // conventions/testing.md), so this cannot observe real centring on a real
  // wide screen — it only pins the resolved style values Yoga would act on.
  it('caps the panel width and centres it', async () => {
    await renderSheet(true);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    const screenWidth = 0; // react-native-unistyles' Jest mock's rt.screen.width
    expect(panelStyle.width).toBe(panelWidth(screenWidth));
    expect(panelStyle.alignSelf).toBe('center');
  });

  // an opt-in width constraint a caller may supply, applied as a
  // `maxWidth` alongside the panel's own `width` above (`styles.panel`),
  // not a replacement for it — see the `maxWidth` prop's own doc comment
  // (`bottom-sheet.tsx`).
  it('narrows the panel’s rendered width when maxWidth is supplied', async () => {
    await renderSheet(true, jest.fn(), undefined, 200);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    expect(panelStyle.maxWidth).toBe(200);
  });

  // every caller that omits `maxWidth` entirely gets the panel's own
  // rendered width unconstrained, with no `maxWidth` constraint quietly
  // applied on its behalf.
  it('leaves the panel’s rendered width unconstrained when maxWidth is omitted, every existing caller’s own shape', async () => {
    await renderSheet(true);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    expect(panelStyle.maxWidth).toBeUndefined();
  });

  // `../cards-pane/cards-pane.tsx` computes its fan's content width via
  // `sheetContentWidth` rather than measuring it with `onLayout` — this
  // cross-checks that function's output against this
  // panel's own *rendered* width and padding, read independently off
  // `panelStyle` rather than re-deriving the same formula a second time: if
  // `styles.panel` below and `sheetContentWidth` ever drift apart (one
  // changed without the other), this is what would catch it. `panelStyle.width`
  // is read directly rather than re-applying `panelWidth`'s own
  // `Math.min(screenWidth, PANEL_MAX_WIDTH)` here — `styles.panel`'s own
  // `width` is that exact same call now (`bottom-sheet.tsx`'s `panelWidth`
  // doc comment), so reading it straight off the render is the more honest
  // cross-check, not a second copy of the same arithmetic. react-native-
  // unistyles' Jest mock reports a fixed `rt.screen.width` of `0` (see
  // `../cards-pane/cards-pane.tsx`'s own `handleFanLayout` doc comment),
  // which this test reuses rather than fights — the cross-check holds at any
  // width, this one included.
  it('sheetContentWidth agrees with the panel’s own rendered padding', async () => {
    await renderSheet(true);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    const screenWidth = 0; // react-native-unistyles' Jest mock's rt.screen.width
    const renderedContentWidth = panelStyle.width - panelStyle.paddingStart - panelStyle.paddingEnd;

    expect(sheetContentWidth(screenWidth, 0, 0)).toBeCloseTo(renderedContentWidth, 9);
  });

  it('commits a dismissal on a backdrop press: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    // `includeHiddenElements` is required here, and is itself a sign this
    // component's accessibility is working: the panel's
    // `accessibilityViewIsModal` makes RNTL treat every sibling — the
    // backdrop included — as hidden from the default accessibility-aware
    // query, the same way a real screen reader would. the backdrop stays
    // perfectly pressable either way — hidden-from-accessibility and
    // untouchable are different things — this option only reaches past
    // the query's default filtering to find it.
    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });
});

// direct unit coverage of the exported helper itself, independent of the
// RNTL/rt mock every render test above goes through (which pins
// `rt.screen.width` at a fixed `0` — see `sheetContentWidth agrees with the
// panel's own rendered padding` above). these two cases are exactly
// `panelWidth`'s below-cap and at/above-cap branches (`bottom-sheet.tsx`'s
// own doc comment).
describe('panelWidth()', () => {
  it('returns the screen width unchanged below the cap', () => {
    expect(panelWidth(412)).toBe(412);
  });

  it('caps at PANEL_MAX_WIDTH (600) at or above it', () => {
    expect(panelWidth(600)).toBe(600);
    expect(panelWidth(800)).toBe(600);
    expect(panelWidth(1024)).toBe(600);
  });
});

// covers the open haptic's own firing point: `sheetOpen` fires at the
// entrance spring's *first arrival* at the open position
// (`useAnimatedReaction`, `bottom-sheet.tsx`), not once the spring finishes
// settling — `handleEntranceArrived`'s own doc comment covers why, given a
// spring's real settle time (roughly 1.5× its nominal duration,
// `@/core/motion/tokens`'s `motionSpringConfig` doc comment). `withSpring` is
// overridden per case to capture its completion callback.
describe('<BottomSheet /> entrance haptic timing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // proves the spring's own completion callback
  // (`runOnJS(handleEntranceSettled)`) never fires the open haptic, whether
  // it reports `finished: true` (a genuine settle) or `false` (a drag
  // interrupted it).
  it('does not fire sheetOpen from the entrance spring’s own completion callback, settled or interrupted', async () => {
    let completeEntrance: ((finished?: boolean) => void) | undefined;
    jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementationOnce((toValue, _config, callback) => {
        completeEntrance = callback;
        return toValue;
      });

    await renderSheet(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);

    completeEntrance?.(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });

  it('fires sheetOpen exactly once, immediately, when reduce motion is on', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');

    await renderSheet(true);

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetOpen);
    // the reduce-motion branch never reaches for a spring at all — nothing
    // left to complete, so nothing to defer the haptic to. this path is
    // untouched by this issue — `usePrefersReducedMotion`'s own doc
    // comment and this component's own doc comment both say why it must
    // stay a synchronous jump, haptic included, with no animation involved.
    expect(withSpringSpy).not.toHaveBeenCalled();
  });
});

// issue #228: `onOpened` fires at the exact same site as the `sheetOpen`
// haptic above (`handleEntranceArrived`'s own doc comment) — these mirror
// that describe block's own three cases one-for-one, substituting `onOpened`
// for `mockedTriggerHaptic`, rather than duplicating a second theory of when
// this fires.
describe('<BottomSheet /> onOpened callback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not fire onOpened synchronously on mount', async () => {
    const onOpened = jest.fn();

    await renderSheet(true, jest.fn(), undefined, undefined, undefined, onOpened);

    expect(onOpened).not.toHaveBeenCalled();
  });

  // mirrors `<BottomSheet /> entrance haptic timing`'s own
  // `does not fire sheetOpen from the entrance spring's own completion
  // callback...` test: `onOpened` is fired by the same `useAnimatedReaction`
  // arrival, never by the spring's own `finished` callback.
  it('does not fire onOpened from the entrance spring’s own completion callback, settled or interrupted', async () => {
    let completeEntrance: ((finished?: boolean) => void) | undefined;
    jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementationOnce((toValue, _config, callback) => {
        completeEntrance = callback;
        return toValue;
      });
    const onOpened = jest.fn();

    await renderSheet(true, jest.fn(), undefined, undefined, undefined, onOpened);

    expect(onOpened).not.toHaveBeenCalled();

    completeEntrance?.(true);

    expect(onOpened).not.toHaveBeenCalled();
  });

  it('fires onOpened exactly once, immediately alongside sheetOpen, when reduce motion is on', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const onOpened = jest.fn();

    await renderSheet(true, jest.fn(), undefined, undefined, undefined, onOpened);

    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });

  it('never fires onOpened for a sheet mounted not visible', async () => {
    const onOpened = jest.fn();

    await renderSheet(false, jest.fn(), undefined, undefined, undefined, onOpened);

    expect(onOpened).not.toHaveBeenCalled();
  });

  // every test elsewhere in this file omits `onOpened` entirely and still
  // passes — this is the direct, positive statement of that: the prop is
  // optional and inert for a caller that never passes it, per its own doc
  // comment.
  it('opens normally, still firing sheetOpen, when onOpened is omitted', async () => {
    await renderSheet(true);

    expect(screen.getByText('sheet content')).toBeTruthy();
  });
});

// the open haptic's real gate: `isEntranceInFlight` (`bottom-sheet.tsx`) is
// what `useAnimatedReaction`'s own worklet reads before ever treating a
// `translateY` crossing as an arrival — see that shared value's own doc
// comment for exactly when it arms and disarms, and `./entrance-arrival.ts`
// for the rule it gates. This project's reanimated mock makes
// `useAnimatedReaction` a no-op (confirmed by reading
// `node_modules/react-native-reanimated/src/mock.ts`'s own
// `hook.useAnimatedReaction: NOOP`), so nothing here can observe the
// reaction itself reading this flag — only that the flag transitions
// correctly at each of its own sites, the write-sequence technique the
// "resets scrimOpacity..." test above already uses for `scrimOpacity`,
// adapted to survive the mock's own re-render churn (see
// `spyOnIsEntranceInFlightWrites`'s own doc comment).
describe('<BottomSheet /> open haptic arming', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // unlike the `scrimOpacity` spy above, a test in this describe block
  // needs writes across *more than one* render — a drag or a dismissal
  // fired after mount runs against whichever render is current by then, and
  // `react-native-reanimated/mock`'s own `useSharedValue` hands every
  // render a brand-new, unmemoized object (this file's own note on the
  // `scrimOpacity` test above), so "the 8th call" of one render is a
  // *different* object than "the 8th call" of the next one. Matching by
  // *position within a render* still works, but only once every call that
  // isn't `bottom-sheet.tsx`'s own has first been filtered out: `bottom-
  // sheet.tsx` calls `useSharedValue` exactly nine times, every render, in
  // the same fixed order (`translateY`, `dragStartTranslateY`,
  // `dragGateWasOpen`, `dragTranslationYOffset`, `scrimOpacity`,
  // `isEntranceLeading`, `isEntranceInFlight`, `isExitInFlight`,
  // `scrollOffset`) — but once the panel is mounted, `react-native-gesture-
  // handler`'s own internals call the *same*, singleton mocked
  // `useSharedValue` too (confirmed empirically — two of its own calls
  // interleave immediately after the panel first mounts, and two more after
  // it unmounts, each shaped nothing like this component's own nine: `null`
  // and `[]` where this component's own calls are always a number, `0`,
  // `0`, `true`, `0`, and three booleans).
  // Counting raw call position across *all* of them would put the "7th"
  // landmark on a gesture-handler-owned value on any render after the panel
  // exists — exactly the render a `rerender()` past the initial mount
  // produces — so a write this component genuinely makes would land on a
  // plain, unwrapped object the spy never sees. Filtering every call's own
  // stack for a frame inside `bottom-sheet.tsx` (never
  // `bottom-sheet.test.tsx`, which does not match — confirmed empirically,
  // not assumed) is what recovers only this component's own nine-call
  // blocks before the position count ever runs, so a foreign call cannot
  // shift which object "the 7th" lands on. every render's own 7th
  // *filtered* call is `isEntranceInFlight` — `isExitInFlight` (added after
  // it, for the exit's own crossing rule) and `scrollOffset` (added after
  // that, for `BottomSheetBody`'s own scroll gating) are the 8th and 9th
  // and irrelevant here — regardless of `visible`/`reduceMotion` (which can
  // otherwise make an *earlier* call's own init value collide with
  // `isEntranceInFlight`'s fixed `false` seed — confirmed empirically, not
  // assumed: `isEntranceLeading` seeds `false` too on exactly the render
  // where `visible` goes `false`, which a value-based match conflated with
  // this one). wrapping every 7th filtered call across the whole test, not
  // only the first, is what lets one
  // `writes` array follow whichever incarnation is actually live when each
  // write happens.
  function spyOnIsEntranceInFlightWrites(): unknown[] {
    const writes: unknown[] = [];
    let ownCallCount = 0;
    const realUseSharedValue = reanimatedMock.useSharedValue;
    jest
      .spyOn(reanimatedMock, 'useSharedValue')
      .mockImplementation((init: unknown): SharedValue<unknown> => {
        const sharedValue = realUseSharedValue(init);
        const callSite = new Error().stack ?? '';
        if (!/\bbottom-sheet\.tsx:\d/.test(callSite)) {
          return sharedValue;
        }
        ownCallCount += 1;
        if (ownCallCount % 9 !== 7) {
          return sharedValue;
        }
        return new Proxy(sharedValue as object, {
          set(target, prop, value, receiver) {
            if (prop === 'value') {
              writes.push(value);
            }
            return Reflect.set(target, prop, value, receiver);
          },
        }) as SharedValue<unknown>;
      });
    return writes;
  }

  it('arms the moment a fresh, non-reduced-motion entrance is requested', async () => {
    const writes = spyOnIsEntranceInFlightWrites();

    await render(sheetTree(true, jest.fn()));

    expect(writes).toEqual([true]);
  });

  // must-hold: a drag interrupting the entrance never fires `sheetOpen` —
  // including a release that snaps the sheet back open, which this test's
  // own `fireDrag(10, 0)` is. bypasses `renderSheet`'s automatic
  // `firePanelLayout()` (see that helper's own doc comment) to reach the
  // panel already mounted — its handle's gestures already live — but not
  // yet through its own first layout, the narrowest window a real drag
  // could start inside.
  it('disarms the moment a drag starts, even before the panel’s own first layout has fired', async () => {
    const writes = spyOnIsEntranceInFlightWrites();

    await render(sheetTree(true, jest.fn()));
    expect(writes).toEqual([true]);

    fireDrag(10, 0); // well under both the distance and velocity thresholds — snaps back

    expect(writes).toEqual([true, false]);
  });

  // must-hold: a dismissal committing mid-entrance (a backdrop tap, here)
  // never leaves the entrance free to still fire `sheetOpen` once whatever
  // is left of its spring crosses the open position. same "before the
  // panel's own first layout" window as the drag test above.
  it('disarms the moment a dismissal commits, even before the panel’s own first layout has fired', async () => {
    const writes = spyOnIsEntranceInFlightWrites();

    await render(sheetTree(true, jest.fn()));
    expect(writes).toEqual([true]);

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    expect(writes).toEqual([true, false]);
  });

  // must-hold: a caller that hides this sheet by any route other than this
  // component's own three dismissal paths never touches `translateY`, so an
  // in-flight entrance's own spring keeps resolving in the background
  // (`cancelAnimation` is best-effort — this component's own doc comment) —
  // this proves the reaction is disarmed regardless, rather than staying
  // eligible to fire `sheetOpen` for a sheet this route already hid.
  it('disarms when the sheet is hidden by a route this component does not own', async () => {
    const writes = spyOnIsEntranceInFlightWrites();
    const onRequestClose = jest.fn();

    const { rerender } = await render(sheetTree(true, onRequestClose));
    expect(writes).toEqual([true]);

    await rerender(sheetTree(false, onRequestClose));

    expect(writes).toEqual([true, false]);
  });

  // pins the *other* arm site: `bottom-sheet.tsx`'s visibility effect sets
  // `isEntranceInFlight.value = true` at two places — the `else` branch
  // above (panel doesn't exist yet, the only one the four tests above ever
  // reach, since each of them renders the sheet exactly once) and the
  // `else if (isPanelRendering)` branch, taken when a re-open arrives while
  // the panel from a previous open/exit is still mounted. deleting only
  // that second branch's own arm write leaves every test above green — none
  // of them ever gets a second `visible: true` while the panel is still
  // around to take this branch — so this is the one test that would catch
  // it. reuses the "keeps rendering after a re-open..." technique further
  // down this file: override `withSpring` to capture the exit's completion
  // callback without invoking it, dismiss via a backdrop tap, then rerender
  // `visible={false}` and `visible={true}` before that callback ever fires
  // — which is what keeps the panel mounted into the reopen and routes it
  // through `isPanelRendering`'s own branch rather than the `else` above.
  it('arms again for a re-open that arrives while the panel from a previous open/exit is still mounted', async () => {
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      // every entrance call (`toValue === 0`, the initial mount and the
      // re-open below) settles immediately, same as the default mock —
      // only the one exit call (`toValue === windowHeight`) is captured,
      // uninvoked, so the panel never tears down.
      if (toValue === 0) {
        callback?.(true);
      }
      return toValue;
    });

    const writes = spyOnIsEntranceInFlightWrites();
    const onRequestClose = jest.fn();

    const { rerender } = await render(sheetTree(true, onRequestClose));
    expect(writes).toEqual([true]); // the `else` branch's own arm, on first mount.

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
    expect(writes).toEqual([true, false]); // disarmed the moment the dismissal commits.

    // the caller's ordinary reaction to `onRequestClose` — the exit spring
    // is still in flight, uncompleted, so the panel stays mounted through
    // this (same as the "keeps rendering..." test further down).
    await rerender(sheetTree(false, onRequestClose));

    // the re-open: `visible` goes back to `true` before that stale exit
    // ever settled, so the panel is still `isPanelRendering` — this is the
    // branch under test.
    await rerender(sheetTree(true, onRequestClose));

    expect(writes).toEqual([true, false, true]);
  });
});

// entrance option B (docs/decisions/
// 2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md):
// the sheet's own travel starts on its first visible frame, never on the
// request to open it, while the scrim leads on a timeline of its own. these
// bypass `renderSheet`'s automatic `firePanelLayout()` call (see that
// helper's own doc comment) so each test can observe the state a real
// device's own layout pass has not reached yet.
describe('<BottomSheet /> entrance start point', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not start the travel before the panel’s first layout, and starts it once that layout fires', async () => {
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');

    await render(sheetTree(true, jest.fn()));

    // the panel is mounted (this component's own two-stage reveal resolves
    // synchronously within `act()` — see `bottom-sheet.tsx`'s
    // `isPanelRendering` doc comment) but RNTL fires no layout on its own,
    // so nothing has told this component its first frame actually painted.
    expect(screen.getByText('sheet content')).toBeTruthy();
    expect(withSpringSpy).not.toHaveBeenCalled();

    firePanelLayout();

    expect(withSpringSpy).toHaveBeenCalledWith(0, motionSpringConfig, expect.any(Function));
  });

  // item 3 of the decision record above: a sheet mounted already
  // `visible={true}` — this test's own render, not a later transition —
  // must travel too, rather than appearing already open. mechanically this
  // is the same "entering" branch the test above already exercises (see
  // `bottom-sheet.tsx`'s visibility effect), but the acceptance criterion
  // names this case on its own, so this pins it directly rather than
  // leaving it to be inferred from the test above.
  it('defers the travel for a sheet mounted already visible, the same as any other open', async () => {
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');

    await render(sheetTree(true, jest.fn()));

    expect(withSpringSpy).not.toHaveBeenCalled();

    firePanelLayout();

    expect(withSpringSpy).toHaveBeenCalledWith(0, motionSpringConfig, expect.any(Function));
  });

  // the scrim leading is what makes option B observably different from
  // option A (the decision record's own wording) — it has to be able to
  // reach the screen before the sheet's contents have finished mounting,
  // which this proves by showing its own fade is already scheduled before
  // the travel is, not merely before it settles. asserts against
  // `mockedMotionColor` (this file's own module-replacement mock, see its
  // own doc comment) rather than spying on `withTiming` directly — spying
  // on the raw reanimated export cannot see a call a `'worklet'`-directive
  // function like `motionColor` makes internally.
  it('starts the scrim’s own fade at the request to open, before the sheet’s travel is even scheduled', async () => {
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');

    await render(sheetTree(true, jest.fn()));

    // scheduled already, on the colour/opacity character and not gated on
    // reduce motion (`false` here) — not the movement spring `translateY`
    // itself waits on a first layout for.
    expect(mockedMotionColor).toHaveBeenCalledWith(1, false);
    // the travel hasn't started yet — proves the scrim didn't wait for it.
    expect(withSpringSpy).not.toHaveBeenCalled();
  });

  // a fresh entrance must reset `scrimOpacity` to fully transparent
  // immediately before starting its own fade toward full strength —
  // mirroring the reset `translateY` already gets to its own offscreen
  // position a few lines above it in the visibility effect
  // (`bottom-sheet.tsx`). without it, `scrimOpacity` carries over whatever a
  // *previous* entrance left it at (`1`, once settled — `BottomSheet` stays
  // mounted whether or not it is currently rendering, per its own doc
  // comment, so this is one long-lived shared value across every open), and
  // `motionColor`'s `withTiming` animates from `1` to `1`: no visible fade,
  // only the very first open a caller ever sees one.
  //
  // the test above (`starts the scrim's own fade...`) only ever asserts
  // `motionColor` was *called* with `(1, false)` — never what value
  // `scrimOpacity` animated *from*. proving that directly, by opening the
  // sheet twice and asserting the second entrance also fades, is not
  // possible here: `react-native-reanimated/mock`'s own `useSharedValue`
  // does not persist a shared value's mutated `.value` across a React
  // re-render the way real Reanimated does, so a second
  // `rerender(sheetTree(true, ...))` gets a *fresh* `scrimOpacity`, reset to
  // `0` by the mock regardless of whether the reset under test is present.
  // What that reset *is* observable in, even under that mock limitation, is
  // the write sequence a single fresh entrance performs: this spies on
  // `useSharedValue` itself and wraps only its fifth call within this
  // render — `translateY`, `dragStartTranslateY`, `dragGateWasOpen`,
  // `dragTranslationYOffset`, `scrimOpacity`, in that order, `bottom-
  // sheet.tsx`'s own hook sequence — so every `.value =` write the
  // visibility effect makes to `scrimOpacity` is recorded, in order, for
  // this one entrance.
  it('resets scrimOpacity to zero immediately before starting its own fade toward full strength', async () => {
    const scrimOpacityWrites: unknown[] = [];
    let useSharedValueCallCount = 0;
    const realUseSharedValue = reanimatedMock.useSharedValue;
    jest
      .spyOn(reanimatedMock, 'useSharedValue')
      .mockImplementation((init: unknown): SharedValue<unknown> => {
        useSharedValueCallCount += 1;
        const sharedValue = realUseSharedValue(init);
        if (useSharedValueCallCount !== 5) {
          return sharedValue;
        }
        return new Proxy(sharedValue as object, {
          set(target, prop, value, receiver) {
            if (prop === 'value') {
              scrimOpacityWrites.push(value);
            }
            return Reflect.set(target, prop, value, receiver);
          },
        }) as SharedValue<unknown>;
      });

    await render(sheetTree(true, jest.fn()));

    // the reset (`0`) immediately followed by the fade's own target (`1`,
    // `motionColor(1, false)`'s return under this mock, which resolves
    // synchronously to its `toValue` — see `motionColor`'s own comment
    // block above) — not a bare `[1]`, which is what this test catches
    // reverting to: a fade with no reset preceding it.
    expect(scrimOpacityWrites).toEqual([0, 1]);
  });
});

// a sheet whose very first render has `visible={true}` needs its very
// first painted frame — built from
// `usePortal`'s own `useLayoutEffect` registration, which flushes *before*
// paint (see that hook's own doc comment) — to already be correct, not
// merely corrected a frame later by a plain `useEffect`, which React runs
// only *after* that frame paints. Left uncorrected, that first frame reads
// `translateY` at its default `0` and `isEntranceLeading` at its default
// `false`, so the backdrop's animated style takes its position-derived
// branch and computes a fully opaque scrim — with the panel not yet built
// (`isPanelRendering` still `false`, by design, for entrance option B's own
// one-commit-later reveal) — a scrim over nothing.
//
// **this is not observable through RNTL.** `render()`/`act()` flush every
// effect — layout and passive alike — before an assertion can run
// (docs/conventions/testing.md's own note on this), so the intervening
// frame this fix corrects can never be queried here; a green suite is not
// proof this is fixed. What *is* observable is the seed the fix computes
// `translateY` and `isEntranceLeading` from, at the exact moment
// `useSharedValue` is first called for each on this fresh mount — the
// values that very first, unobservable frame is actually built from. A real
// device confirms the frame itself never flashes opaque.
describe('<BottomSheet /> seeds the first frame of a sheet mounted already visible', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // spies on `useSharedValue` and records every `init` argument it receives,
  // in call order, for the render under test.
  function spyOnSharedValueInits(): unknown[] {
    const initValues: unknown[] = [];
    const realUseSharedValue = reanimatedMock.useSharedValue;
    jest
      .spyOn(reanimatedMock, 'useSharedValue')
      .mockImplementation((init: unknown): SharedValue<unknown> => {
        initValues.push(init);
        return realUseSharedValue(init);
      });
    return initValues;
  }

  it('seeds translateY offscreen and isEntranceLeading true, not the flat 0/false a later effect would only correct one frame on', async () => {
    const initValues = spyOnSharedValueInits();

    await render(sheetTree(true, jest.fn()));

    // bottom-sheet.tsx's own hook order: translateY, dragStartTranslateY,
    // dragGateWasOpen, dragTranslationYOffset, scrimOpacity,
    // isEntranceLeading.
    const [translateYInit, , , , , isEntranceLeadingInit] = initValues;

    // the window under Jest measures 1334 tall — `bottom-sheet.tsx`'s own
    // offscreen position (see the drag-to-dismiss tests above for the same
    // figure relied on for the dismiss-distance threshold).
    expect(translateYInit).toBe(1334);
    expect(isEntranceLeadingInit).toBe(true);
  });

  it('leaves both at their ordinary defaults for a sheet mounted not visible — no entrance to correct ahead of', async () => {
    const initValues = spyOnSharedValueInits();

    await render(sheetTree(false, jest.fn()));

    const [translateYInit, , , , , isEntranceLeadingInit] = initValues;

    expect(translateYInit).toBe(0);
    expect(isEntranceLeadingInit).toBe(false);
  });
});

// the panel-mount deferral (`isPanelRendering`, `bottom-sheet.tsx`) must not
// run under reduce motion: reduce motion snaps the sheet and the scrim to
// their final values synchronously, with no travel for a staged reveal to
// lead, so deferring the panel's mount there would put a fully-opaque scrim
// on screen with no sheet in it for one whole extra commit, while the
// panel's own heavy content (the deferred effect's own job) still built.
// `<Profiler>` (React's own commit-counting API) is what makes a staged
// reveal observable at all: the sheet's final rendered output is identical
// either way once `act()` finishes flushing every pending commit, so
// asserting against `screen` alone — as every other test in this file
// does — cannot tell a staged reveal apart from one that never happened.
// Counting commits can, because React never folds a `useEffect`'s own
// `setState` into the commit that triggered it — `isPanelRendering`'s own
// effect-deferred `setIsPanelRendering(true)` call always lands one commit
// later.
describe('<BottomSheet /> reduce motion has no staged reveal', () => {
  // `expo-blur`'s own `BlurView` performs a real `setState` inside its own
  // `componentDidMount` (resolving `blurTarget` into a native node handle) —
  // real behaviour worth having on a device, but noise for this describe
  // block's own commit-counting test below, which counts render commits to
  // prove the panel's own one-commit-later reveal exists: an extra,
  // library-owned commit unrelated to what that test measures. Scoped to
  // just this describe block, not the whole file — the file's other tests
  // (the "renders the blur layer" test above) exercise `BlurView`'s real
  // render, per docs/conventions/testing.md's own rule that a unit test
  // mocks a third-party dependency wholesale only where there is no
  // rendered observable to query at all (`bar-chart.test.tsx`'s Skia mock,
  // which `BlurView` is not: it renders a real, reachable `View` under
  // `jest-expo`, as the "renders the blur layer" test's own
  // `UNSAFE_getByType(BlurView)` assertion above relies on).
  let componentDidMountSpy: jest.SpiedFunction<(typeof BlurView.prototype)['componentDidMount']>;

  beforeEach(() => {
    componentDidMountSpy = jest
      .spyOn(BlurView.prototype, 'componentDidMount')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    componentDidMountSpy.mockRestore();
  });

  // renders closed, discards that tree's own initial commit(s), then opens
  // and reports how many further commits that took — the count itself
  // (this project's own portal plumbing adds overhead neither this test nor
  // the component's own logic controls) is not what this test pins; the
  // *difference* between the two motion settings is, asserted below.
  async function commitsToOpen(reduceMotion: boolean) {
    mockedUsePrefersReducedMotion.mockReturnValue(reduceMotion);
    const onCommit = jest.fn();
    const onRequestClose = jest.fn();

    const view = await render(
      <Profiler id="closed" onRender={onCommit}>
        {sheetTree(false, onRequestClose)}
      </Profiler>,
    );
    onCommit.mockClear(); // discard the closed tree's own initial commit(s)

    await view.rerender(
      <Profiler id="open" onRender={onCommit}>
        {sheetTree(true, onRequestClose)}
      </Profiler>,
    );

    expect(view.getByText('sheet content')).toBeTruthy();
    await view.unmount(); // keeps this test's two runs from ever coexisting

    return onCommit.mock.calls.length;
  }

  it('mounts the panel in the same commit as the backdrop under reduce motion — one fewer commit than a non-reduced-motion entrance needs for its own deliberate one-commit-later reveal', async () => {
    mockedTriggerHaptic.mockClear();

    const reducedMotionCommits = await commitsToOpen(true);
    const fullMotionCommits = await commitsToOpen(false);

    // the non-reduced entrance genuinely needs entrance option B's own
    // one-commit-later reveal (so the scrim's own independent lead can
    // reach the screen before the panel's heavy content starts building —
    // `bottom-sheet.tsx`'s own `isPanelRendering` doc comment); reduce
    // motion has no travel for a staged reveal to lead ahead of, so it must
    // land in exactly one commit fewer.
    expect(fullMotionCommits).toBe(reducedMotionCommits + 1);
  });
});

// `onRequestClose` fires immediately, at the moment the dismissal commits,
// rather than waiting for the exit spring's own completion callback — an
// underdamped spring reports that well after the sheet already reads as
// offscreen, so a caller's own state update (adding the player
// `../../../features/hand-ranges/ui/holding-input-sheet/
// holding-input-sheet.tsx`'s `onSubmit` produces, say) would otherwise wait
// on an animation with nothing to do with it. only `sheetClose` still waits
// for the exit to actually settle.
describe('<BottomSheet /> exit timing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fires onRequestClose immediately when a dismissal commits, before the exit spring reports it has finished', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      // the entrance call (`toValue === 0`) settles immediately, same as
      // the default mock — only the exit call (`toValue === windowHeight`,
      // never `0`) is captured, uninvoked, for this test to control.
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    // committed, but the exit spring hasn't reported settling yet.
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetClose);

    completeExit?.(true);

    expect(onRequestClose).toHaveBeenCalledTimes(1); // still exactly once
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('fires sheetClose immediately, with no animation to defer to, when reduce motion is on', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);

    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  // a caller that flips `visible` to `false` from directly inside
  // `onRequestClose` — the ordinary shape, and exactly what
  // `holding-input-sheet.tsx`'s own caller does — does so before the exit
  // has finished playing, since `onRequestClose` does not wait for it. this
  // proves the sheet keeps rendering (and, implicitly, keeps animating)
  // through the exit regardless, rather than unmounting the instant the
  // caller's own `visible` prop goes false.
  it('keeps rendering through the exit even though the caller flips visible to false immediately', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestCloseSpy = jest.fn();
    await render(<ControlledSheet onRequestCloseSpy={onRequestCloseSpy} />);

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    // the harness's own `onRequestClose` already ran (flipping its
    // `visible` state to `false`, the ordinary caller shape), but the exit
    // spring hasn't settled yet — the sheet must still be rendering.
    expect(onRequestCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('sheet content')).toBeTruthy();

    // wrapped in `act`, unlike this file's own `completeEntrance?.(...)`
    // calls elsewhere: those only assert against `mockedTriggerHaptic`'s
    // own call history, which needs no flush to read — this assertion
    // reads the rendered tree itself, which does.
    act(() => {
      completeExit?.(true);
    });

    // now that the exit has genuinely finished, the sheet is gone.
    expect(screen.queryByText('sheet content')).toBeNull();
  });

  // the branch the reset effect's own comment defends against: a re-open
  // that arrives while `isClosingRef` is still `true`, because the
  // previous dismissal's own exit spring hadn't reported settling yet. a
  // real re-open must win outright — the sheet keeps rendering — and the
  // stale exit's own eventual completion must not tear it back down once
  // it finally runs. on a real device `cancelAnimation` (called by the
  // re-open branch) is what stops that stale spring from ever reporting
  // `finished: true`; `completeExit?.(false)` below simulates exactly that
  // cancelled report, the same shape the entrance-haptic-timing block
  // above already uses for an interrupted entrance
  // (`completeEntrance?.(false)`).
  it('keeps rendering after a re-open that arrives before the previous exit settles, and survives that stale exit later reporting it was cancelled', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      // every entrance call (`toValue === 0`, the initial mount and the
      // re-open below) settles immediately, same as the default mock —
      // only the one exit call (`toValue === windowHeight`) is captured,
      // uninvoked, for this test to control.
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestClose = jest.fn();
    const { rerender } = await render(sheetTree(true, onRequestClose));

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    // committed — the exit spring is in flight, uncompleted.
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(completeExit).toBeDefined();

    // the caller's ordinary reaction to `onRequestClose` (`visible` false,
    // see `ControlledSheet` above) — the exit keeps rendering through it,
    // exactly as the test above already proves.
    await rerender(sheetTree(false, onRequestClose));
    expect(screen.getByText('sheet content')).toBeTruthy();

    // the re-open itself: `visible` goes back to `true` before that exit
    // ever settled.
    await rerender(sheetTree(true, onRequestClose));
    expect(screen.getByText('sheet content')).toBeTruthy();

    // the stale exit finally reports — cancelled, not settled — and must
    // change nothing.
    act(() => {
      completeExit?.(false);
    });

    expect(screen.getByText('sheet content')).toBeTruthy();
  });

  // the same re-open, but with the stale exit reporting `finished: true`
  // rather than cancelled. on a real device `cancelAnimation` should stop
  // that from ever happening — but this project's own reanimated mock
  // makes `cancelAnimation` a no-op, so nothing in this suite can observe
  // whether that call is still there. this test therefore pins the
  // component's *own* defence instead of the library's: `handleExitSettled`
  // returns early unless `isClosingRef` is still set, and the re-open
  // cleared it. without that guard this exact sequence hides a sheet the
  // caller has open — `setIsRendering(false)` landing after the re-open
  // already set it true — and no other test in this file would catch it.
  it('ignores a stale exit completion that reports settled after a re-open', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestClose = jest.fn();
    const { rerender } = await render(sheetTree(true, onRequestClose));

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
    await rerender(sheetTree(false, onRequestClose));
    await rerender(sheetTree(true, onRequestClose));
    expect(screen.getByText('sheet content')).toBeTruthy();

    mockedTriggerHaptic.mockClear();

    // the stale exit reports settled, after the re-open already won.
    act(() => {
      completeExit?.(true);
    });

    // the sheet the caller has open stays open ...
    expect(screen.getByText('sheet content')).toBeTruthy();
    // ... and no `sheetClose` haptic fires for a sheet that is opening.
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  // the exit stays off the scrim's own independent colour timeline
  // (`motionColor`) — the plan's own Assumptions and Non-goals keep the
  // exit's behaviour on the scrim's position-derived timeline alone, since
  // entrance option B's own colour timeline belongs to the entrance only.
  // `motionColor` is never called at all for a plain backdrop-tap exit: the
  // scrim instead derives straight from `translateY`'s own position while
  // the exit spring runs — see `bottom-sheet.tsx`'s own `isEntranceLeading`.
  it('does not give the exit its own scrim timeline — only the entrance ever does', async () => {
    await renderSheet(true);
    mockedMotionColor.mockClear(); // discard the entrance's own (1, false) call

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    expect(mockedMotionColor).not.toHaveBeenCalled();
  });
});

// each of this component's three dismissal triggers stays live through its
// own close animation, and `commitClose` (`bottom-sheet.tsx`) guards against
// running a second time while a dismissal it already started is still
// committing — the `isClosingRef.current` guard at the top of
// `commitClose` — since a quick double-tap on the handle, or a
// drag-release immediately followed by a backdrop tap, could otherwise
// resolve the sheet's held input and invoke `onRequestClose` twice for what
// the user experiences as one dismissal. These tests capture the exit
// spring's own
// completion callback without invoking it — the same technique
// `<BottomSheet /> exit timing`'s own `fires onRequestClose immediately...`
// test above already uses — so the close animation is still genuinely
// "playing" (`isClosingRef` still `true`) when the second trigger fires;
// under this file's *default* reanimated mock, `withSpring` resolves
// synchronously and `isClosingRef` would already be cleared by the time a
// second, synchronously-fired trigger ran, proving nothing about the race
// this guard exists for.
describe('<BottomSheet /> dismissal re-entrancy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits only once when the handle is tapped twice in quick succession, before the close animation finishes', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      // the entrance call (`toValue === 0`) settles immediately, same as the
      // default mock — only the exit call (`toValue === windowHeight`) is
      // captured, uninvoked, so this dismissal's own close animation is
      // still "playing" for the second tap below.
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    fireHandleTap();
    fireHandleTap(); // lands while the first tap's own exit animation, captured above, hasn't settled

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    // lets the exit actually settle, proving the guard didn't leave the
    // sheet stuck mid-close either.
    act(() => {
      completeExit?.(true);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('commits only once for a drag past the dismiss threshold immediately followed by a backdrop tap, before the close animation finishes', async () => {
    let completeExit: ((finished?: boolean) => void) | undefined;
    jest.spyOn(reanimatedMock, 'withSpring').mockImplementation((toValue, _config, callback) => {
      if (toValue === 0) {
        callback?.(true);
      } else {
        completeExit = callback;
      }
      return toValue;
    });

    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireDrag(700, 0); // clears DISMISS_DISTANCE_RATIO — see `<BottomSheet /> drag-to-dismiss`'s own comment on this figure
    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true })); // lands while the drag's own exit animation hasn't settled

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    act(() => {
      completeExit?.(true);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  // the reduce-motion counterpart of the first test above: under reduce
  // motion `commitClose` has no exit animation to defer `handleExitSettled`
  // to (see `<BottomSheet /> exit timing`'s own reduce-motion test), so the
  // guard's own re-entrancy window is only as wide as whatever `commitClose`
  // itself does synchronously — this proves that window still excludes a
  // second dismissal trigger landing right after the first, back-to-back,
  // with nothing in between to let `handleExitSettled` run first.
  it('commits only once when the handle is tapped twice in quick succession under reduce motion, with no exit animation to land in between', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);

    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    fireHandleTap();
    fireHandleTap(); // lands synchronously right after the first, before handleExitSettled's own deferred clear runs

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    // lets the deferred `handleExitSettled` actually run, proving the guard
    // didn't leave the sheet stuck mid-close either.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });
});

// `react-native-gesture-handler/jest-utils`'s `fireGestureHandler` can
// inject synthetic BEGAN/ACTIVE/END state transitions and does reach a
// `Gesture.Pan()`'s callbacks (see `../selection-grid/selection-grid.tsx`'s
// own test). what these tests reach is `pan.onEnd`'s own threshold
// decision — real on-device gesture *recognition* (how many pixels of
// travel a touch needs to activate, what velocity a real flick reports)
// still needs a real touchscreen and a real frame loop, neither of which
// exists under Jest, same as `../selection-grid/selection-grid.test.tsx`'s
// own note.
describe('<BottomSheet /> drag-to-dismiss', () => {
  it('commits a dismissal when dragged past the distance threshold: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    // the window under Jest measures 1334 tall (see `useWindowDimensions`'s
    // default test value) — half of that is 667, so 700 clears
    // `DISMISS_DISTANCE_RATIO` regardless of velocity.
    fireDrag(700, 0);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('snaps a short, slow drag back open: neither onRequestClose nor the sheetClose haptic fire', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireDrag(10, 0); // well under both the distance and velocity thresholds

    expect(onRequestClose).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('commits a dismissal on velocity alone for a short but fast drag', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    // 10 is well under the 667 distance threshold; 600 is past
    // `DISMISS_VELOCITY_THRESHOLD` (500pt/s).
    fireDrag(10, 600);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  // the second defect (see `<BottomSheet /> exit timing`'s own comment on
  // it) reaches a drag-release snap-back too — the plan's own acceptance
  // criteria name "the exit and drag-release" together. `motionColor` is
  // never called at all for a snap-back: the scrim derives straight from
  // `translateY`'s own position through that spring, the same as it does
  // through the drag itself, never reaching for a timeline of its own.
  it('does not give a drag-release snap-back its own scrim timeline either', async () => {
    await renderSheet(true);
    mockedMotionColor.mockClear(); // discard the entrance's own (1, false) call

    fireDrag(10, 0); // well under both the distance and velocity thresholds

    expect(mockedMotionColor).not.toHaveBeenCalled();
  });

  // `pendingEntranceLayoutRef` (`bottom-sheet.tsx`) is cleared in
  // `handlePanelLayout`, in `commitClose`, and in the visibility effect's
  // own "hidden by another route" branch — but not here, in a drag
  // released back open rather than past the dismiss threshold. this
  // deliberately bypasses `renderSheet`'s automatic `firePanelLayout()`
  // call (see that helper's own doc comment, and the "entrance start
  // point" describe block above) to reach the exact race this guard exists
  // for: the panel already exists — its handle's gestures are already
  // live — but has not yet had its own first layout, the narrow window a
  // touch can start dragging inside. Without the guard, a delayed layout
  // landing after the snap-back already resolved would consume the still-set
  // flag and start a second, competing spring toward the open position —
  // on top of the snap-back's own already-running one — and fire a
  // `sheetOpen` haptic for an "arrival" that was really just a drag
  // bouncing back.
  it('clears the pending entrance layout on a drag released below the dismiss threshold, so a delayed layout does not restart the entrance', async () => {
    // the snap-back's own spring runs through `motionSpring` (`@/core/
    // motion/tokens`), a `'worklet'`-directive function — this file's own
    // top comment on `mockedMotionColor` explains why a `jest.spyOn` on the
    // raw reanimated export cannot observe a call *that* function makes
    // internally, the same gotcha `motionSpring` shares with `motionColor`.
    // This spy stays useful regardless: `handlePanelLayout`
    // (`bottom-sheet.tsx`) calls the raw `withSpring` directly, never
    // through the wrapper, so a still-visible call here after
    // `firePanelLayout()` below is exactly the second, competing spring
    // this guard must prevent.
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');
    const onRequestClose = jest.fn();

    await render(sheetTree(true, onRequestClose));

    // the panel is mounted (see this test's own doc comment) but its own
    // first layout hasn't fired — nothing has started the entrance's
    // travel yet.
    expect(withSpringSpy).not.toHaveBeenCalled();

    fireDrag(10, 0); // well under both thresholds — snaps back

    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);

    // the delayed layout finally arrives, after the snap-back already won.
    firePanelLayout();

    // must not have started a second, competing spring (`handlePanelLayout`
    // returns early once its own guard sees the flag already cleared), nor
    // fired the haptic a real entrance arrival never happened for.
    expect(withSpringSpy).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });
});

// the handle tap is the one dismissal path `e2e/flows/SCN-011.yaml`
// exercises (`analyze-holding-input-sheet-handle`) — drag and backdrop
// above are covered for completeness, but this is the path a real run of
// that scenario depends on.
describe('<BottomSheet /> tap-to-dismiss', () => {
  // only the test below overrides `withSpring`'s own mock implementation —
  // this restores it afterward for the same reason `<BottomSheet /> exit
  // timing` and `<BottomSheet /> entrance start point` above already do:
  // this project's Jest config sets neither `resetMocks` nor
  // `restoreMocks`, so a `mockImplementation` left in place here would leak
  // into every later test in this file, this describe block's own first
  // test included were it to run after instead of before.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits a dismissal on a handle tap: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    fireHandleTap();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  // the third of the four sites `pendingEntranceLayoutRef`
  // (`bottom-sheet.tsx`) must clear: `commitClose` itself, defensively,
  // for a close committed while the panel exists but has not yet had its
  // own first layout — `handlePanelLayout`'s own consumption and the
  // drag-release path (`<BottomSheet /> drag-to-dismiss`'s own
  // `clears the pending entrance layout on a drag released below the
  // dismiss threshold...` test above) are the two already covered; the
  // visibility effect's own "hidden by another route" branch is the
  // fourth. Bypasses `renderSheet`'s automatic `firePanelLayout()` (see
  // that helper's own doc comment, and the "entrance start point" describe
  // block above) for the same reason the drag-release test does: to reach
  // the panel already mounted — its handle tap gesture already live — but
  // not yet through its own first layout, the exact window `commitClose`'s
  // own clear guards.
  it('clears the pending entrance layout on a close committed before the panel’s own first layout, so a delayed layout does not restart the entrance', async () => {
    // `commitClose` itself starts the exit's own spring toward
    // `windowHeight` — letting that resolve immediately, the way this
    // file's reanimated mock normally does (its own top comment), would
    // call `handleExitSettled` synchronously and unmount the panel before
    // this test ever gets to fire the delayed layout on it (mirrors
    // `<BottomSheet /> exit timing`'s own `withSpring` override). only the
    // entrance's own spring toward `0` — `handlePanelLayout`'s call, the
    // one this guard must keep from ever firing here — resolves
    // immediately, which is what lets the assertions below tell the guarded
    // behaviour apart from an unguarded one.
    const withSpringSpy = jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementation((toValue, _config, callback) => {
        if (toValue === 0) {
          callback?.(true);
        }
        return toValue;
      });
    const onRequestClose = jest.fn();

    await render(sheetTree(true, onRequestClose));

    // the panel is mounted (see this test's own doc comment) but its own
    // first layout hasn't fired yet.
    fireHandleTap();

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    // the delayed layout finally arrives, after the close already committed.
    firePanelLayout();

    // must not have started a second, competing spring toward the open
    // position (`handlePanelLayout` returns early once its own guard sees
    // the flag already cleared), nor fired the haptic a real entrance
    // arrival never happened for.
    expect(withSpringSpy).not.toHaveBeenCalledWith(0, motionSpringConfig, expect.any(Function));
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });
});

// B3's own widened drag surface: the header — a caller's optional top
// chrome, rendered between the handle and `children` — drags along with
// the handle rather than only the 7pt handle pill itself.
describe('<BottomSheet /> header drag surface', () => {
  it('renders no header at all, and no header-drag gesture, when the prop is omitted', async () => {
    await renderSheet(true);

    expect(screen.queryByTestId('header', { includeHiddenElements: true })).toBeNull();
  });

  it('renders the caller-supplied header between the handle and the content', async () => {
    await renderSheet(true, undefined, <Text>tab row</Text>);

    expect(screen.getByText('tab row')).toBeTruthy();
    expect(screen.getByText('sheet content')).toBeTruthy();
  });

  // exercises the header's own pan gesture directly (`headerPan`,
  // `bottom-sheet.tsx`, exposed via `withTestId` as `header-drag`) through
  // the same threshold `pan.onEnd` already uses for the handle — proving
  // this second gesture instance is wired to the identical dismissal rule,
  // not merely a copy that looks right. real on-device recognition —
  // whether a touch starting on an interactive element inside `header`
  // still reaches that element's own `Pressable` rather than being
  // captured by this pan — isn't something `fireGestureHandler` exercises
  // either way.
  it('commits a dismissal when the header itself is dragged past the distance threshold', async () => {
    const onRequestClose = await renderSheet(true, undefined, <Text>tab row</Text>);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('header-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('snaps back on a short, slow header drag: onRequestClose never fires', async () => {
    const onRequestClose = await renderSheet(true, undefined, <Text>tab row</Text>);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('header-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 10, velocityY: 0 },
    ]);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  // a tap on the header's own content — a tab button, say — is never
  // raced against a dismissal the way the handle's tap is (see
  // `bottom-sheet.tsx`'s doc comment): `fireEvent.press` calls straight
  // into the `Pressable`'s handler regardless of gesture wiring, so this
  // proves the button stays reachable through RNTL's own event dispatch,
  // not that a real native touch is never intercepted by `headerPan`
  // first — a real device confirms that half.
  it('presses a header button through fireEvent, exactly as any other Pressable would', async () => {
    const onHeaderPress = jest.fn();
    await renderSheet(
      true,
      undefined,
      <Pressable onPress={onHeaderPress} testID="header-button">
        <Text>tab</Text>
      </Pressable>,
    );

    await fireEvent.press(screen.getByTestId('header-button'));

    expect(onHeaderPress).toHaveBeenCalledTimes(1);
  });
});

// the content area — `children`, whatever a caller renders below
// the handle and `header` — gains the same plain drag surface `header`
// already has (`contentPan`, `bottom-sheet.tsx`), active anywhere inside it
// that isn't already claimed by a pan or swipe gesture belonging to that
// content. Modelled directly on the "header drag surface" describe block
// above: the same threshold exercise, the same tap-passthrough proof, plus
// one further case that block has no equivalent of — a caller's own nested
// pan gesture (the shape `../cards-pane/cards-pane.tsx`'s `FanArc` and
// `../selection-grid/selection-grid.tsx`'s own `Gesture.Pan()` actually
// use) staying reachable and firing on its own once `contentPan` wraps
// around it.
describe('<BottomSheet /> content drag surface', () => {
  it('commits a dismissal when the content area itself is dragged past the distance threshold', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
  });

  it('commits a dismissal on velocity alone for a short but fast content-area drag', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 10, velocityY: 600 },
    ]);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('snaps back on a short, slow content-area drag: onRequestClose never fires', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 10, velocityY: 0 },
    ]);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  // the plain-tap case the plan's own Non-goals name explicitly: a content
  // area with nothing else to claim the touch must not gain a new
  // tap-to-dismiss affordance of its own — only a drag/flick closes it from
  // there, matching how `header` already behaves.
  it('a plain tap on the content area, with no movement, does not dismiss the sheet', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 0, velocityY: 0 },
    ]);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  // mirrors "presses a header button through fireEvent" above, for a
  // control rendered in `children` instead of `header`. `fireEvent.press`
  // calls straight into the `Pressable`'s own handler regardless of gesture
  // wiring, so this proves the button stays reachable through RNTL's own
  // event dispatch, not that a real native touch is never intercepted by
  // `contentPan` first — a real device confirms that half, the same
  // limitation the header test above already states.
  it('presses a Pressable rendered inside the content through fireEvent, exactly as any other Pressable would', async () => {
    const onContentPress = jest.fn();
    await renderSheet(
      true,
      undefined,
      undefined,
      undefined,
      <Pressable onPress={onContentPress} testID="content-button">
        <Text>a card</Text>
      </Pressable>,
    );

    await fireEvent.press(screen.getByTestId('content-button'));

    expect(onContentPress).toHaveBeenCalledTimes(1);
  });

  // the case the header block above has no equivalent of: `children` can
  // carry its own pan gesture (`FanArc`'s and `SelectionGrid`'s own real
  // shape — a `Gesture.Pan()`, built with `.minDistance(0)`, in its own
  // `GestureDetector`), not only a plain `Pressable`. This proves
  // `contentPan`'s own `GestureDetector` wrapping `children` does not
  // remove or otherwise break that nested gesture — it stays reachable and
  // fires its own callback exactly once. `fireGestureHandler`/
  // `getByGestureTestId` drive a named gesture directly, synthesising state
  // transitions rather than routing one real touch through the view
  // hierarchy for both gestures to race over — so this cannot prove which
  // of the two a real device's own arbitration picks when a touch actually
  // starts inside the inner gesture's own bounds; `bottom-sheet.tsx`'s own
  // doc comment on `contentPan` covers that reasoning, and names it not yet
  // confirmed on a real device.
  it('leaves a caller’s own nested pan gesture inside the content reachable and firing on its own', async () => {
    const onInnerPanEnd = jest.fn();
    const innerPan = Gesture.Pan()
      .minDistance(0)
      .withTestId('inner-drag')
      .onEnd(() => {
        onInnerPanEnd();
      });

    const onRequestClose = await renderSheet(
      true,
      undefined,
      undefined,
      undefined,
      <GestureDetector gesture={innerPan}>
        <View testID="inner-target" />
      </GestureDetector>,
    );

    fireGestureHandler(getByGestureTestId('inner-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 5, velocityY: 0 },
    ]);

    expect(onInnerPanEnd).toHaveBeenCalledTimes(1);
    expect(onRequestClose).not.toHaveBeenCalled();
  });
});

// every test in the "content drag surface" block above fires `content-drag`
// while `BottomSheetBody`'s own scroll offset sits at its default `0` — none
// exercises a non-zero scroll offset, so `contentPan`'s own gating logic
// (`buildDragPan`'s `scrollOffset` parameter, `bottom-sheet.tsx`) had no test
// of its own gating condition: a suite that would pass identically whether
// that gate were inverted, removed, or broken. This block drives
// `scrollOffset` for real, through the one channel that reaches
// `useAnimatedScrollHandler`'s actual callback rather than the no-op this
// project's own reanimated mock hands back by default —
// `react-native-reanimated/src/mock.ts`'s own `useAnimatedScrollHandler:
// NOOP_FACTORY` discards whatever callback `BottomSheetBody` passes it,
// confirmed by reading that file, not assumed, so firing a plain
// `fireEvent.scroll` against the unmodified mock would silently do nothing
// at all. Overriding `reanimatedMock.useAnimatedScrollHandler` to hand the
// real callback straight back, instead of `NOOP`, is what lets a scroll
// event actually reach `scrollOffset.value` — the same "spy on the mock's
// own export" technique this file already uses for `withSpring` (see, for
// one, `spyOnIsEntranceInFlightWrites`'s own describe block above), applied
// here to the one Reanimated hook this suite hadn't needed a real
// implementation of before now.
describe('<BottomSheet /> content drag scroll gating', () => {
  beforeEach(() => {
    jest.spyOn(reanimatedMock, 'useAnimatedScrollHandler').mockImplementation(((
      handlers: unknown,
    ) => {
      const onScroll =
        typeof handlers === 'function'
          ? (handlers as (event: unknown, context: unknown) => void)
          : (handlers as { onScroll?: (event: unknown, context: unknown) => void }).onScroll;
      // real Reanimated's own dispatcher calls the processed handler with
      // the native event already unwrapped — `BottomSheetBody`'s own
      // handler (`bottom-sheet.tsx`) reads `event.contentOffset.y` directly,
      // never `event.nativeEvent.contentOffset.y`. `fireEvent.scroll`
      // instead calls whatever `onScroll` prop it finds the ordinary React
      // Native way, wrapped in `{ nativeEvent }` — unwrapping it here is
      // what lets the real handler still read the shape it expects.
      return (event: { nativeEvent: unknown }) => onScroll?.(event.nativeEvent, {});
    }) as unknown as typeof reanimatedMock.useAnimatedScrollHandler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // fires a real scroll event at `BottomSheetBody`'s own root
  // (`sheetTree`'s `testID="body"`, above), reaching `scrollOffset` through
  // the real `useAnimatedScrollHandler` callback the `beforeEach` above
  // restores.
  function fireContentScroll(offsetY: number) {
    fireEvent.scroll(screen.getByTestId('body'), {
      nativeEvent: { contentOffset: { y: offsetY } },
    });
  }

  it('does not dismiss on a content-area drag past the distance threshold while scrolled away from the top', async () => {
    const onRequestClose = await renderSheet(true);
    fireContentScroll(50);

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('does not dismiss on a fast content-area flick while scrolled away from the top', async () => {
    const onRequestClose = await renderSheet(true);
    fireContentScroll(50);

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 10, velocityY: 600 },
    ]);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  // the reset path: a suite that only ever proved the gate closes could
  // still miss a gate stuck closed forever. re-confirms the same threshold
  // this file's own "content drag surface" block already covers, but only
  // after this scroll offset has genuinely been non-zero first.
  it('resumes dismissing on a content-area drag once the scroll position returns to the top', async () => {
    const onRequestClose = await renderSheet(true);
    fireContentScroll(50);

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);
    expect(onRequestClose).not.toHaveBeenCalled();

    fireContentScroll(0);
    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  // regression: `headerPan` (`bottom-sheet.tsx`) is built by the same
  // `buildDragPan` factory but with no `scrollOffset` argument at all, so it
  // must stay unconditional regardless of what `BottomSheetBody`'s own
  // scroll position reads.
  it("keeps the header's own pan-to-dismiss unconditional regardless of the content's scroll position", async () => {
    const onRequestClose = await renderSheet(true, undefined, <Text>tab row</Text>);
    fireContentScroll(50);

    fireGestureHandler(getByGestureTestId('header-drag'), [
      { state: State.BEGAN },
      { state: State.END, translationY: 700, velocityY: 0 },
    ]);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  // finding 2 of the independent review against this branch: a single
  // continuous touch that starts scrolled away from the top and crosses
  // back to it mid-gesture must re-baseline `dragStartTranslateY` at the
  // exact frame the gate opens, rather than computing that frame's
  // `translateY` off `event.translationY`'s full, gated-out-and-all
  // cumulative value against a baseline `onStart` never captured (it began
  // gated closed) — see `dragGateWasOpen`'s and `dragTranslationYOffset`'s
  // own doc comments in `bottom-sheet.tsx`.
  //
  // `react-native-gesture-handler/jestUtils`'s own `fireGestureHandler`
  // dispatches every event of one call synchronously, in one JS call stack —
  // confirmed by reading it, not assumed — so nothing in this project's own
  // test harness can run code *between* two of a single gesture's own
  // `ACTIVE`-state frames the way a real device's own scroll-to-drag handoff
  // would let a scroll event land mid-touch. **This is a genuine limitation
  // of this project's existing gesture-mocking harness, not a gap left
  // uncovered for convenience**: this test works around it by driving one
  // continuous `Gesture.Pan()` sequence — `BEGAN`, four `ACTIVE` frames,
  // `END` — while overriding `scrollOffset`'s own `.value` *reads* to follow
  // a controlled sequence (closed, closed, open, open, open — one entry per
  // call `onStart`/`onUpdate`/`onEnd` make, in order) rather than driving a
  // real scroll event mid-sequence, and reads `translateY`'s own writes
  // directly (the same write-recording technique
  // `spyOnIsEntranceInFlightWrites` above uses) rather than through a
  // rendered style, since `useAnimatedStyle`'s own resolved style isn't
  // reliably observable under this project's reanimated mock
  // (docs/conventions/testing.md). Both shared values are captured the same
  // way that helper captures `isEntranceInFlight`: filtering every
  // `useSharedValue` call's own stack for a frame inside `bottom-sheet.tsx`,
  // then picking out the one at this component's own fixed position within
  // its nine-call-per-render sequence (`translateY` 1st, `scrollOffset`
  // 9th — see that helper's own doc comment for the full ordering and why
  // filtering by stack, not raw call position, is what keeps this reliable
  // across more than one render).
  //
  // this proves `contentPan`'s own worklet math re-baselines correctly
  // against a controlled sequence of gate reads; it does not, and cannot,
  // prove that a real device's own native scroll-to-drag handoff produces
  // gate reads in this same shape — that stays the real-device confirmation
  // `bottom-sheet.tsx`'s own doc comment on `contentPan`, and this project's
  // decision record (docs/decisions/2026-09-05-gate-bottom-sheet-content-
  // drag-on-scroll-position.md), already name as outstanding.
  it('re-baselines translateY at the exact frame a mid-gesture scroll-to-top transition opens the gate, instead of jumping', async () => {
    const translateYWrites: unknown[] = [];
    // one entry per `scrollOffset.value` read `onStart`/`onUpdate`/`onEnd`
    // make, in call order. `react-native-gesture-handler`'s own dispatcher
    // (`eventReceiver.ts`, confirmed by reading it, not assumed) routes the
    // *first* `ACTIVE`-state frame of a gesture to `.onStart()` — a state
    // change from `BEGAN` — and only every later same-state frame to
    // `.onUpdate()`; only `.onEnd()`'s own state change (`ACTIVE` → `END`)
    // ends it. So this sequence reads closed for `onStart` (`translationY`
    // 80) and the first `onUpdate` (`translationY` 100), then open from the
    // second `onUpdate` (`translationY` 120 — the transition frame) onward.
    const scrollOffsetReads = [50, 50, 0, 0, 0];
    let scrollReadIndex = 0;
    let ownCallCount = 0;
    const realUseSharedValue = reanimatedMock.useSharedValue;
    jest
      .spyOn(reanimatedMock, 'useSharedValue')
      .mockImplementation((init: unknown): SharedValue<unknown> => {
        const sharedValue = realUseSharedValue(init);
        const callSite = new Error().stack ?? '';
        if (!/\bbottom-sheet\.tsx:\d/.test(callSite)) {
          return sharedValue;
        }
        ownCallCount += 1;
        const positionInRender = ((ownCallCount - 1) % 9) + 1;
        if (positionInRender === 1) {
          // `translateY`, the 1st of every 9-call render block.
          return new Proxy(sharedValue as object, {
            set(target, prop, value, receiver) {
              if (prop === 'value') {
                translateYWrites.push(value);
              }
              return Reflect.set(target, prop, value, receiver);
            },
          }) as SharedValue<unknown>;
        }
        if (positionInRender === 9) {
          // `scrollOffset`, the 9th of every 9-call render block.
          return new Proxy(sharedValue as object, {
            get(target, prop, receiver) {
              if (prop === 'value') {
                const next =
                  scrollOffsetReads[Math.min(scrollReadIndex, scrollOffsetReads.length - 1)];
                scrollReadIndex += 1;
                return next;
              }
              return Reflect.get(target, prop, receiver);
            },
          }) as SharedValue<unknown>;
        }
        return sharedValue;
      });

    await renderSheet(true);
    translateYWrites.length = 0; // discard the entrance's own writes

    fireGestureHandler(getByGestureTestId('content-drag'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationY: 80 }, // onStart — gated closed
      { state: State.ACTIVE, translationY: 100 }, // onUpdate #1 — gated closed
      { state: State.ACTIVE, translationY: 120 }, // onUpdate #2 — the transition frame
      { state: State.ACTIVE, translationY: 150 }, // onUpdate #3 — gate stays open
      { state: State.END, translationY: 160, velocityY: 0 }, // onEnd — gate open
    ]);

    // `[0, 30, 0]`: the transition frame (`translationY` 120, the first call
    // the gate reads open) picks up at `0` — no displacement carried over
    // from the gated-out 80/100 portion of the touch — then tracks the next
    // 30 of real displacement (150 − 120) normally, before the release
    // (`translationY` 160, under the 667 dismiss threshold —
    // `windowHeight` 1334 × `DISMISS_DISTANCE_RATIO` 0.5) snaps back to `0`.
    // the pre-fix code would have read `[120, 150, 0]` here instead:
    // `dragStartTranslateY` never captured at this gesture's own `onStart`
    // (gated closed), so the transition frame computes straight off
    // `event.translationY` alone — a 120pt jump the instant the gate opens,
    // not a smooth pickup.
    expect(translateYWrites).toEqual([0, 30, 0]);
  });
});
