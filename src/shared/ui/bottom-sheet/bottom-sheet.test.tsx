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
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { triggerHaptic } from '@/core/haptics/haptics';
import { PortalHost } from '@/shared/ui/portal/portal';

import { BottomSheet } from './bottom-sheet';

// this component imports `react-native-reanimated` directly (its drag
// runs on the UI thread — see its own doc comment), and importing that at
// all reaches into `react-native-worklets`' native module the moment it
// initialises — needed for `GestureHandlerRootView` to mount at all under
// Jest, same as `../selection-grid/selection-grid.test.tsx`. `require()`
// inside the factory, exactly as both libraries' own Jest testing guides
// show, rather than a same-file `import` above: an import-based version
// was tried and reproducibly reaches deeper into Reanimated's real module
// init before failing — `react-native-reanimated/mock`'s own source
// transitively re-imports Reanimated's real entry point, and getting the
// load order right (worklets fully mocked before that re-import runs)
// needs the lazy indirection `require()` gives; the two eslint warnings
// this trades for are addressed below rather than fought.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// the *real* `withTiming`/`withSpring` schedule an actual multi-frame
// animation, which never resolves inside one synchronous test tick.
// `react-native-reanimated/mock`'s own versions call their completion
// callback immediately instead, and its `runOnJS` is the identity
// function — which is what lets `commitClose`'s animate-then-call-
// `onRequestClose` sequence (see `bottom-sheet.tsx`) resolve synchronously
// under this mock, with no timer or `waitFor` needed below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// `BottomSheet` renders through `<PortalHost />` now (`usePortal`, see
// `bottom-sheet.tsx`'s own doc comment on why) rather than in place, so
// every render here needs a `<PortalHost />` ancestor the same way
// `src/app/_layout.tsx` provides one for real — `usePortal` throws without
// one.
async function renderSheet(visible: boolean, onRequestClose: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <PortalHost>
        <BottomSheet
          visible={visible}
          onRequestClose={onRequestClose}
          accessibilityLabel="Test sheet"
          testID="sheet"
        >
          <Text>sheet content</Text>
        </BottomSheet>
      </PortalHost>
    </GestureHandlerRootView>,
  );
  return onRequestClose;
}

/**
 * a drag on the handle's own pan gesture (`bottom-sheet.tsx`'s `pan`,
 * exposed via `withTestId` as `sheet-drag`), ending with the given
 * `translationY`/`velocityY` — the two fields `pan.onEnd`'s threshold
 * check actually reads. a bare `BEGAN` then `END` is enough:
 * `fireGestureHandler` synthesises the `ACTIVE` transition in between (see
 * `../selection-grid/selection-grid.test.tsx`'s own `fireTap` for the same
 * two-event shape), and `onStart`'s own `dragStartTranslateY` capture does
 * not affect `onEnd`'s decision, which compares `translationY`/`velocityY`
 * directly rather than the shared value they drove.
 */
function fireDrag(translationY: number, velocityY: number) {
  fireGestureHandler(getByGestureTestId('sheet-drag'), [
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
  fireGestureHandler(getByGestureTestId('sheet-tap'), [
    { state: State.BEGAN },
    { state: State.END },
  ]);
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

  // the backdrop's own opacity fades with `translateY`, a Reanimated
  // shared value updated on the UI thread — under
  // `react-native-reanimated/mock`, `useAnimatedStyle`'s returned style is
  // not reliably observable through a rendered element's own `style` prop
  // the way a plain RN style is, so this only asserts the backdrop is
  // there at all, never a particular opacity. proving the fade itself
  // stays a manual device check, same as this file's other drag-gesture
  // caveats.
  it('renders the backdrop while visible', async () => {
    await renderSheet(true);

    expect(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true })).toBeTruthy();
  });

  it('never calls onRequestClose while not visible', async () => {
    const onRequestClose = await renderSheet(false);

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('fires sheetOpen exactly once when it becomes visible', async () => {
    await renderSheet(true);

    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('sheetOpen');
  });

  // the panel's own `accessibilityViewIsModal` (see `bottom-sheet.tsx`)
  // gives it an accessible identity of its own, distinct from the drag
  // handle's `accessibilityLabel` (which names the dismiss affordance,
  // not the sheet) — a screen reader entering the modal needs to hear
  // what it is, not only how to leave it.
  it('gives the panel the caller-supplied accessibilityLabel', async () => {
    await renderSheet(true);

    expect(
      screen.getByTestId('sheet-panel', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe('Test sheet');
  });

  it('commits a dismissal on a backdrop press: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    // `includeHiddenElements` is required here, and is itself a sign this
    // component's accessibility is doing its job: the panel's own
    // `accessibilityViewIsModal` (see `bottom-sheet.tsx`) makes RNTL treat
    // every sibling — the backdrop included — as hidden from the default,
    // accessibility-aware query the same way a real screen reader would,
    // so a default `getByTestId` can no longer find it. the backdrop
    // stays perfectly pressable either way — hidden-from-accessibility and
    // untouchable are different things — this option only reaches past
    // the query's own default filtering to locate it.
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('sheetClose');
  });
});

// run 4a's own brief (correctly, at plan time) assumed the drag-to-dismiss
// gesture below was unreachable under Jest and left it untested; building
// `../selection-grid/selection-grid.tsx` in that same run discovered
// `react-native-gesture-handler/jest-utils`' `fireGestureHandler` can
// inject synthetic BEGAN/ACTIVE/END state transitions and does reach a
// `Gesture.Pan()`'s callbacks after all (see that component's own test).
// this closes the gap that discovery left open: what these tests reach is
// `pan.onEnd`'s own threshold decision — real on-device gesture
// *recognition* (how many pixels of travel a touch needs before it
// activates, what velocity a real flick reports) still needs a real
// touchscreen and a real frame loop, neither of which exists under Jest,
// same as `../selection-grid/selection-grid.test.tsx`'s own note.
describe('<BottomSheet /> drag-to-dismiss', () => {
  it('commits a dismissal when dragged past the distance threshold: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    // the window under Jest measures 1334 tall (see `useWindowDimensions`'s
    // own default test value) — half of that is 667, so 700 is past
    // `DISMISS_DISTANCE_RATIO` regardless of velocity.
    fireDrag(700, 0);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('sheetClose');
  });

  it('snaps a short, slow drag back open: neither onRequestClose nor the sheetClose haptic fire', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    fireDrag(10, 0); // well under both the distance and velocity thresholds

    expect(onRequestClose).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).not.toHaveBeenCalledWith('sheetClose');
  });

  it('commits a dismissal on velocity alone for a short but fast drag', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear();

    // 10 is well under the 667 distance threshold; 600 is past
    // `DISMISS_VELOCITY_THRESHOLD` (500pt/s).
    fireDrag(10, 600);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('sheetClose');
  });
});

// the handle tap is the one dismissal path `e2e/flows/SCN-009.yaml`
// actually exercises (`analyze-holding-input-sheet-handle`) — drag and
// backdrop above are covered for completeness, but this is the path a
// real run of that scenario depends on.
describe('<BottomSheet /> tap-to-dismiss', () => {
  it('commits a dismissal on a handle tap: onRequestClose and sheetClose each fire exactly once', async () => {
    const onRequestClose = await renderSheet(true);
    mockedTriggerHaptic.mockClear(); // discard the sheetOpen call from mounting

    fireHandleTap();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('sheetClose');
  });
});
