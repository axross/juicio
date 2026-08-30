// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` throws (`RNGestureHandlerModule.install is not
// a function`) the moment it tries to reach the native module Jest has no
// binary for.
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet as RNStyleSheet, Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { PortalHost } from '@/shared/ui/portal/portal';

import { BottomSheet, sheetContentWidth } from './bottom-sheet';

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

const mockedTriggerHaptic = jest.mocked(triggerHaptic);
const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);

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
});

// the JSX every render in this file mounts. `renderSheet` below wraps it
// for a fire-and-forget render; the F1 test calls it directly for RNTL's
// `rerender`, flipping `visible` on the same instance — `wasVisible`'s ref
// state needs to carry across that transition, which a fresh render would
// reset.
function sheetTree(visible: boolean, onRequestClose: jest.Mock, header?: ReactNode) {
  return (
    <GestureHandlerRootView>
      <PortalHost>
        <BottomSheet
          visible={visible}
          onRequestClose={onRequestClose}
          accessibilityLabel="Test sheet"
          header={header}
          testID="sheet"
        >
          <Text>sheet content</Text>
        </BottomSheet>
      </PortalHost>
    </GestureHandlerRootView>
  );
}

// `BottomSheet` renders through `<PortalHost />` now (`usePortal`, see
// `bottom-sheet.tsx`'s doc comment) rather than in place, so every render
// here needs a `<PortalHost />` ancestor, same as `src/app/_layout.tsx`
// provides for real. builds on `sheetTree` above for one tree definition.
async function renderSheet(
  visible: boolean,
  onRequestClose: jest.Mock = jest.fn(),
  header?: ReactNode,
) {
  await render(sheetTree(visible, onRequestClose, header));
  return onRequestClose;
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

  // `react-native-reanimated/mock`'s `withSpring` invokes its callback
  // synchronously, so this alone cannot distinguish "fired on the
  // scheduling frame" from "fired once it settles" — the entrance haptic
  // timing block below takes control of `withSpring` to draw that
  // distinction.
  it('fires sheetOpen exactly once when it becomes visible', async () => {
    await renderSheet(true);

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetOpen);
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

  // item on a wide viewport (a tablet, or an unfolded foldable) real-device
  // feedback: the panel must cap its own width and centre, rather than
  // stretching to the full screen. RNTL runs no layout engine (docs/
  // conventions/testing.md), so this cannot observe real centring on a real
  // wide screen — it only pins the resolved style values Yoga would act on.
  it('caps the panel width and centres it', async () => {
    await renderSheet(true);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    expect(panelStyle.width).toBe('100%');
    expect(panelStyle.maxWidth).toBe(430); // bottom-sheet.tsx's own PANEL_MAX_WIDTH
    expect(panelStyle.alignSelf).toBe('center');
  });

  // Part B (PR #70): `../../../features/hand-ranges/ui/cards-pane/
  // cards-pane.tsx` computes its fan's content width via
  // `sheetContentWidth` instead of measuring it with `onLayout` — this
  // cross-checks that function's output against this panel's own
  // *rendered* padding, read independently off `panelStyle` rather than
  // re-deriving the same formula a second time: if `styles.panel` below
  // and `sheetContentWidth` ever drift apart (one changed without the
  // other), this is what would catch it. react-native-unistyles' Jest
  // mock reports a fixed `rt.screen.width` of `0` (see
  // `../../../features/hand-ranges/ui/cards-pane/cards-pane.tsx`'s own
  // `handleFanLayout` doc comment), which this test reuses rather than
  // fights — the cross-check holds at any width, this one included.
  it('sheetContentWidth agrees with the panel’s own rendered padding', async () => {
    await renderSheet(true);

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    const screenWidth = 0; // react-native-unistyles' Jest mock's rt.screen.width
    const renderedContentWidth =
      Math.min(screenWidth, panelStyle.maxWidth) - panelStyle.paddingStart - panelStyle.paddingEnd;

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

// covers the timing this issue fixed: `sheetOpen` now waits for the
// entrance spring's own completion, the same bar `commitClose` already
// holds `sheetClose` to. `withSpring` is overridden per case to capture
// that callback instead of letting the mock invoke it immediately.
describe('<BottomSheet /> entrance haptic timing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defers sheetOpen until the entrance spring reports it has finished, not the frame it is scheduled', async () => {
    let completeEntrance: ((finished?: boolean) => void) | undefined;
    jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementationOnce((toValue, _config, callback) => {
        completeEntrance = callback;
        return toValue;
      });

    await renderSheet(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalled();

    completeEntrance?.(true);

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetOpen);
  });

  it('fires no sheetOpen when the entrance spring is interrupted before it settles', async () => {
    let completeEntrance: ((finished?: boolean) => void) | undefined;
    jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementationOnce((toValue, _config, callback) => {
        completeEntrance = callback;
        return toValue;
      });

    await renderSheet(true);

    completeEntrance?.(false);

    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });

  it('fires sheetOpen exactly once, immediately, when reduce motion is on', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');

    await renderSheet(true);

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetOpen);
    // the reduce-motion branch never reaches for a spring at all — nothing
    // left to complete, so nothing to defer the haptic to.
    expect(withSpringSpy).not.toHaveBeenCalled();
  });

  // a caller that hides this sheet by any route other than this
  // component's own three dismissal paths never touches `translateY`, so
  // an in-flight entrance keeps running unattended — this proves it does
  // not still fire `sheetOpen` once it settles, after the sheet is gone.
  it('fires no sheetOpen if the entrance settles after the sheet was already hidden by a route that never touches translateY', async () => {
    let completeEntrance: ((finished?: boolean) => void) | undefined;
    jest
      .spyOn(reanimatedMock, 'withSpring')
      .mockImplementationOnce((toValue, _config, callback) => {
        completeEntrance = callback;
        return toValue;
      });

    const onRequestClose = jest.fn();
    const { rerender } = await render(sheetTree(true, onRequestClose));

    await rerender(sheetTree(false, onRequestClose));

    completeEntrance?.(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
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
});

// the handle tap is the one dismissal path `e2e/flows/SCN-011.yaml`
// exercises (`analyze-holding-input-sheet-handle`) — drag and backdrop
// above are covered for completeness, but this is the path a real run of
// that scenario depends on.
describe('<BottomSheet /> tap-to-dismiss', () => {
  it('commits a dismissal on a handle tap: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    fireHandleTap();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SheetClose);
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
