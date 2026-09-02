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
import type { ReactNode } from 'react';
import { Profiler, useState } from 'react';
import { Pressable, StyleSheet as RNStyleSheet, Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionColor, motionSpringConfig } from '@/core/motion/tokens';
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
//
// also fires the panel's first layout (`firePanelLayout` below) once the
// panel has mounted — RNTL runs no layout engine (docs/conventions/
// testing.md), so `onLayout` never fires on its own the way a real device's
// always would, and `bottom-sheet.tsx`'s own entrance now hangs its spring
// on exactly that event (its own doc comment, entrance option B). every
// caller here that doesn't itself need to inspect the pre-layout state —
// which is every existing test in this file, and every one this project's
// own reanimated mock already resolved synchronously before this change —
// gets that layout for free, the same way a real device's own layout pass
// would follow immediately. the "entrance start point" describe block below
// is the one place that deliberately bypasses this helper, to observe the
// state a real device's own layout pass has not reached yet.
async function renderSheet(
  visible: boolean,
  onRequestClose: jest.Mock = jest.fn(),
  header?: ReactNode,
) {
  await render(sheetTree(visible, onRequestClose, header));
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

  // Part B (PR #70): `../cards-pane/cards-pane.tsx` computes its fan's
  // content width via `sheetContentWidth` instead of measuring it with
  // `onLayout` — this cross-checks that function's output against this
  // panel's own *rendered* padding, read independently off `panelStyle`
  // rather than re-deriving the same formula a second time: if `styles.panel`
  // below and `sheetContentWidth` ever drift apart (one changed without the
  // other), this is what would catch it. react-native-unistyles' Jest mock
  // reports a fixed `rt.screen.width` of `0` (see
  // `../cards-pane/cards-pane.tsx`'s own `handleFanLayout` doc comment),
  // which this test reuses rather than fights — the cross-check holds at any
  // width, this one included.
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
    // schedules the entrance spring the capture above needs — see
    // `renderSheet`'s own doc comment; this test bypasses that helper since
    // it needs the mocked `withSpring` installed first.
    firePanelLayout();

    await rerender(sheetTree(false, onRequestClose));

    completeEntrance?.(true);

    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
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
});

// covers the first of the three defects an independent reviewer found
// against the entrance-retiming revision this branch built on: the
// panel-mount deferral (`isPanelRendering`, `bottom-sheet.tsx`) ran
// unconditionally, reduce motion included — even though reduce motion
// snaps the sheet and the scrim to their final values synchronously, with
// no travel for a staged reveal to lead. The result was a fully-opaque
// scrim on screen with no sheet in it for one whole extra commit, while
// the panel's own heavy content (the deferred effect's own job) still
// built. `<Profiler>` (React's own commit-counting API) is what makes this
// observable at all: the sheet's final rendered output is identical either
// way once `act()` finishes flushing every pending commit, so asserting
// against `screen` alone — as every other test in this file does — cannot
// tell a staged reveal apart from one that never happened. Counting commits
// can, because React can never fold a `useEffect`'s own `setState` into the
// commit that triggered it — a hard rule this project didn't have to place
// any faith in on its own, since it is exactly what the buggy code's own
// second, effect-deferred `setIsPanelRendering(true)` call demonstrates.
describe('<BottomSheet /> reduce motion has no staged reveal', () => {
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
    // motion has no travel for a staged reveal to lead ahead of, so it
    // must land in exactly one commit fewer — the defect this block covers
    // is exactly that extra commit reduce motion used to also pay for.
    expect(fullMotionCommits).toBe(reducedMotionCommits + 1);
  });
});

// covers the defect the maintainer's own on-device pass over PR #93 found:
// `onRequestClose` used to wait for the exit spring's own completion
// callback, which an underdamped spring reports well after the sheet
// already reads as offscreen — so a caller's own state update (adding the
// player `../../../features/hand-ranges/ui/holding-input-sheet/
// holding-input-sheet.tsx`'s `onSubmit` produces, say) waited on an
// animation with nothing to do with it. `onRequestClose` now fires
// immediately, at the moment the dismissal commits; only `sheetClose`
// still waits for the exit to actually settle.
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

  // the scenario `onRequestClose`'s own timing change makes newly possible:
  // a caller that flips `visible` to `false` from directly inside
  // `onRequestClose` — the ordinary shape, and exactly what
  // `holding-input-sheet.tsx`'s own caller does — now does so *before* the
  // exit has finished playing, since `onRequestClose` no longer waits for
  // it. this proves the sheet keeps rendering (and, implicitly, keeps
  // animating) through the exit regardless, rather than unmounting the
  // instant the caller's own `visible` prop goes false.
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

  // covers the second of the three defects an independent reviewer found:
  // the exit had been retimed onto the scrim's own independent colour
  // timeline (`motionColor`) — the plan's own Assumptions and Non-goals
  // both keep the exit's behaviour exactly as it was before entrance
  // option B, and that timeline belongs to the entrance alone. `motionColor`
  // is never called at all for a plain backdrop-tap exit now: the scrim
  // instead derives straight from `translateY`'s own position while the
  // exit spring runs, the same as it always did before this scrim had a
  // timeline of its own — see `bottom-sheet.tsx`'s own `isEntranceLeading`.
  it('does not give the exit its own scrim timeline — only the entrance ever does', async () => {
    await renderSheet(true);
    mockedMotionColor.mockClear(); // discard the entrance's own (1, false) call

    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    expect(mockedMotionColor).not.toHaveBeenCalled();
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

  // covers the third of the three defects an independent reviewer found:
  // `pendingEntranceLayoutRef` (`bottom-sheet.tsx`) was cleared in
  // `handlePanelLayout`, in `commitClose`, and in the visibility effect's
  // own "hidden by another route" branch — but not here, in a drag
  // released back open rather than past the dismiss threshold. this
  // deliberately bypasses `renderSheet`'s automatic `firePanelLayout()`
  // call (see that helper's own doc comment, and the "entrance start
  // point" describe block above) to reach the exact race this defect's fix
  // guards: the panel already exists — its handle's gestures are already
  // live — but has not yet had its own first layout, the narrow window a
  // touch can start dragging inside. Without the fix, a delayed layout
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
    // this defect's fix must prevent.
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
