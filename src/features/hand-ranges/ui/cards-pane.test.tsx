// registers this project's real themes and namespaces — see
// `../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own
// comment on why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../shared/ui/selection-grid/selection-grid.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { triggerHaptic } from '@/core/haptics/haptics';

import { computeFanLayout, FAN_ARC, PREVIEW_SLOT } from './card-fan-geometry';
import { CardsPane, type CardsPaneSlots } from './cards-pane';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

// matches computeFanLayout's own scale-1 reference content width (see
// card-fan-geometry.test.ts's own "is exactly 1.0000" case): the frame's
// 399 width plus the 1px inset on each side.
const FAN_CONTENT_WIDTH = FAN_ARC.frameWidth + 2;
const LAYOUT = computeFanLayout(FAN_CONTENT_WIDTH);
// ascending rank order (2..A) — the same index card-fan-geometry.ts's own
// `FAN_CARDS` uses. index 0 is the deuce, index 12 the ace.
const TWO_X = LAYOUT.cards[0].centerX;
const THREE_X = LAYOUT.cards[1].centerX;
const ACE_X = LAYOUT.cards[12].centerX;

const EMPTY_SLOTS: CardsPaneSlots = [null, null];

async function renderPane(slots: CardsPaneSlots, onSlotsChange: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <CardsPane slots={slots} onSlotsChange={onSlotsChange} testID="pane" />
    </GestureHandlerRootView>,
  );

  // the fan needs a measured width before `computeFanLayout` can resolve
  // any touch to a card — see `hand-range-pane.test.tsx`'s own matching
  // layout fire for the grid.
  await fireEvent(screen.getByTestId('pane-fan'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: FAN_CONTENT_WIDTH, height: 400 } },
  });

  return onSlotsChange;
}

// unlike `fireEvent`, `fireGestureHandler` is not itself `act()`-aware —
// its synthetic events reach `Gesture.Pan()`'s callbacks through
// `react-native-gesture-handler`'s own event emitter, which drives this
// component's `setFocusedSlot`/`setActiveDrag` updates outside any `act()`
// boundary RNTL sets up automatically. wrapping every call here is what
// keeps those updates flushed and visible to the very next assertion,
// same as `selection-grid.test.tsx`'s own calls need for a component that
// (unlike `SelectionGrid` itself) holds real React state of its own.
async function fireArcTap(suit: string, x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`pane-arc-${suit}`), [
      { state: State.BEGAN, x, y: 40 },
      { state: State.END, x, y: 40 },
    ]);
  });
}

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<CardsPane />', () => {
  it('renders both slots empty, with a spoken index and "empty"', async () => {
    await renderPane(EMPTY_SLOTS);

    expect(screen.getByTestId('pane-slot-0').props.accessibilityLabel).toBe('Hole card 1, empty');
    expect(screen.getByTestId('pane-slot-1').props.accessibilityLabel).toBe('Hole card 2, empty');
  });

  it('a tap on a fan card fills the initially-focused slot 0, firing toggleOn', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await fireArcTap('s', TWO_X);

    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '2', suit: 's' }, null]);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOn');
  });

  it('a second tap on a different card fills the second slot — focus advances after a pick', async () => {
    const onSlotsChange = await renderPane([{ rank: '2', suit: 's' }, null]);

    await fireArcTap('h', THREE_X);

    expect(onSlotsChange).toHaveBeenCalledWith([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);
  });

  it('a tap at an already-taken card’s own position resolves to the nearest untaken card instead — the distinctness rule', async () => {
    // `nearestSelectableCardIndex` (`./card-fan-geometry.ts`) already
    // skips a taken card, so a real touch at `TWO_X` while the deuce of
    // spades sits in slot 0 never resolves back onto it — the same
    // guarantee `cards-pane-selection.test.ts`'s own `selectCard` tests
    // cover directly, exercised here through this component's actual
    // touch-resolution path instead.
    const onSlotsChange = await renderPane([{ rank: '2', suit: 's' }, null]);

    await fireArcTap('s', TWO_X);

    expect(onSlotsChange).toHaveBeenCalledWith([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 's' },
    ]);
  });

  it('slot 0 holds focus from the moment the pane mounts, reporting accessibilityState.selected', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    expect(screen.getByTestId('pane-slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('pane-slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('tapping the non-focused slot moves focus there, reporting accessibilityState.selected and firing selectionChange', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('pane-slot-1'));

    expect(screen.getByTestId('pane-slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByTestId('pane-slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('selectionChange');
  });

  it('tapping an empty, non-focused slot moves focus there too — an empty slot is always tappable', async () => {
    // both slots start empty, so `initialFocusedSlot` (`./cards-pane-selection.ts`)
    // focuses slot 0, leaving slot 1 both empty and non-focused — the one
    // configuration where an "empty, non-focused" slot exists to tap.
    await renderPane(EMPTY_SLOTS);

    await fireEvent.press(screen.getByTestId('pane-slot-1'));

    expect(screen.getByTestId('pane-slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('selectionChange');
  });

  // regression coverage for the invisible-ring bug found on a real device
  // (both slots rendered the last-rendered slot's own armed/filled state —
  // see `./cards-pane.tsx`'s own `PreviewSlot` doc comment): the focus
  // ring is a sibling element with its own testID, present on exactly one
  // slot at a time — one of the two slots always holds focus, never both
  // and never neither.
  it('renders the focus ring on exactly one slot at a time', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    expect(screen.getByTestId('pane-slot-0-ring')).toBeTruthy();
    expect(screen.queryByTestId('pane-slot-1-ring')).toBeNull();

    await fireEvent.press(screen.getByTestId('pane-slot-1')); // move focus to slot 1

    expect(screen.queryByTestId('pane-slot-0-ring')).toBeNull();
    expect(screen.getByTestId('pane-slot-1-ring')).toBeTruthy();
  });

  // regression coverage for the focus-ring geometry bug: the previous
  // `variants.armed` block added a border to the same box fixed at
  // `PREVIEW_SLOT.width`×`height`, insetting its content box while the
  // `PlayingCard` filling it stayed the same size. neither slot's own box
  // dimensions may change now, focused or not — the ring is an
  // absolutely-positioned overlay entirely out of flow (see this file's
  // own closing comment on what RNTL cannot additionally prove about real
  // measured geometry).
  it('keeps both slots at their fixed 48×75 box regardless of which one is focused', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    const expectedBox = expect.objectContaining({
      width: PREVIEW_SLOT.width,
      height: PREVIEW_SLOT.height,
    });
    const slot0StyleBefore = screen.getByTestId('pane-slot-0').props.style;
    const slot1StyleBefore = screen.getByTestId('pane-slot-1').props.style;
    expect(slot0StyleBefore[0]).toEqual(expectedBox);
    expect(slot1StyleBefore[0]).toEqual(expectedBox);

    await fireEvent.press(screen.getByTestId('pane-slot-1')); // move focus to slot 1

    const slot0StyleAfter = screen.getByTestId('pane-slot-0').props.style;
    const slot1StyleAfter = screen.getByTestId('pane-slot-1').props.style;
    expect(slot0StyleAfter).toEqual(slot0StyleBefore);
    expect(slot1StyleAfter).toEqual(slot1StyleBefore);
    expect(slot0StyleAfter[0]).toEqual(expectedBox);
    expect(slot1StyleAfter[0]).toEqual(expectedBox);
  });

  it('tapping the focused slot clears it, firing toggleOff, and leaves focus in place', async () => {
    // both slots start filled, so `initialFocusedSlot` falls back to slot
    // 0 — the one configuration among the fixtures used elsewhere in this
    // file where the slot that starts focused is also filled.
    const onSlotsChange = await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // slot 0 already has focus — clears it

    expect(onSlotsChange).toHaveBeenLastCalledWith([null, { rank: '3', suit: 'h' }]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOff');
    expect(screen.getByTestId('pane-slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('after clearing the focused slot, the next fan pick fills that same slot — the deliberate asymmetry with a pick', async () => {
    const onSlotsChange = await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // clear slot 0; focus stays on it
    await fireArcTap('c', ACE_X); // pick the ace of clubs from the fan

    expect(onSlotsChange).toHaveBeenLastCalledWith([
      { rank: 'A', suit: 'c' },
      { rank: '3', suit: 'h' },
    ]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOn');
  });

  it('with both slots full, a fan pick always replaces whichever slot is focused — no dead state', async () => {
    const onSlotsChange = await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('pane-slot-1')); // move focus to slot 1
    await fireArcTap('c', ACE_X); // pick the ace of clubs from the fan

    expect(onSlotsChange).toHaveBeenLastCalledWith([
      { rank: '2', suit: 's' },
      { rank: 'A', suit: 'c' },
    ]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOn');
  });

  it('a drag that crosses into a new card fires dragTick, and releasing selects the card under the finger', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('pane-arc-s'), [
        { state: State.BEGAN, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: THREE_X, y: 40 },
        { state: State.END, x: THREE_X, y: 40 },
      ]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith('dragTick');
    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '3', suit: 's' }, null]);
  });
});
