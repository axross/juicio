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
// component's `setArmedSlot`/`setActiveDrag` updates outside any `act()`
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

  it('a tap on a fan card fills the first empty slot, firing toggleOn', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await fireArcTap('spades', TWO_X);

    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '2', suit: 'spades' }, null]);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOn');
  });

  it('a second tap on a different card fills the second slot', async () => {
    const onSlotsChange = await renderPane([{ rank: '2', suit: 'spades' }, null]);

    await fireArcTap('hearts', THREE_X);

    expect(onSlotsChange).toHaveBeenCalledWith([
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
    ]);
  });

  it('a tap at an already-taken card’s own position resolves to the nearest untaken card instead — the distinctness rule', async () => {
    // `nearestSelectableCardIndex` (`./card-fan-geometry.ts`) already
    // skips a taken card, so a real touch at `TWO_X` while the deuce of
    // spades sits in slot 0 never resolves back onto it — the same
    // guarantee `cards-pane-selection.test.ts`'s own `selectCard` tests
    // cover directly, exercised here through this component's actual
    // touch-resolution path instead.
    const onSlotsChange = await renderPane([{ rank: '2', suit: 'spades' }, null]);

    await fireArcTap('spades', TWO_X);

    expect(onSlotsChange).toHaveBeenCalledWith([
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'spades' },
    ]);
  });

  it('tapping a filled slot arms it, reporting accessibilityState.selected and firing selectionChange', async () => {
    await renderPane([{ rank: '2', suit: 'spades' }, null]);

    await fireEvent.press(screen.getByTestId('pane-slot-0'));

    expect(screen.getByTestId('pane-slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('selectionChange');
  });

  // regression coverage for the invisible-ring bug found on a real device
  // (both slots rendered the last-rendered slot's own armed/filled state —
  // see `./cards-pane.tsx`'s own `PreviewSlot` doc comment): the armed
  // ring is now a sibling element with its own testID, present only on
  // the armed slot, never on the other one.
  it('renders the armed ring only on the armed slot, never on the unarmed one', async () => {
    await renderPane([
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
    ]);

    expect(screen.queryByTestId('pane-slot-0-ring')).toBeNull();
    expect(screen.queryByTestId('pane-slot-1-ring')).toBeNull();

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // arm slot 0

    expect(screen.getByTestId('pane-slot-0-ring')).toBeTruthy();
    expect(screen.queryByTestId('pane-slot-1-ring')).toBeNull();
  });

  // regression coverage for the armed-ring geometry bug: the previous
  // `variants.armed` block added a border to the same box fixed at
  // `PREVIEW_SLOT.width`×`height`, insetting its content box while the
  // `PlayingCard` filling it stayed the same size. neither slot's own box
  // dimensions may change now, armed or not — the ring is an
  // absolutely-positioned overlay entirely out of flow (see this file's
  // own closing comment on what RNTL cannot additionally prove about real
  // measured geometry).
  it('keeps both slots at their fixed 48×75 box regardless of which one is armed', async () => {
    await renderPane([
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
    ]);

    const expectedBox = expect.objectContaining({
      width: PREVIEW_SLOT.width,
      height: PREVIEW_SLOT.height,
    });
    const slot0StyleBefore = screen.getByTestId('pane-slot-0').props.style;
    const slot1StyleBefore = screen.getByTestId('pane-slot-1').props.style;
    expect(slot0StyleBefore[0]).toEqual(expectedBox);
    expect(slot1StyleBefore[0]).toEqual(expectedBox);

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // arm slot 0

    const slot0StyleAfter = screen.getByTestId('pane-slot-0').props.style;
    const slot1StyleAfter = screen.getByTestId('pane-slot-1').props.style;
    expect(slot0StyleAfter).toEqual(slot0StyleBefore);
    expect(slot1StyleAfter).toEqual(slot1StyleBefore);
    expect(slot0StyleAfter[0]).toEqual(expectedBox);
    expect(slot1StyleAfter[0]).toEqual(expectedBox);
  });

  it('tapping the armed slot again clears it, firing toggleOff', async () => {
    const onSlotsChange = await renderPane([{ rank: '2', suit: 'spades' }, null]);

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // arm
    await fireEvent.press(screen.getByTestId('pane-slot-0')); // clear

    expect(onSlotsChange).toHaveBeenLastCalledWith([null, null]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOff');
  });

  it('while a slot is armed, the next fan pick replaces that slot rather than filling the other', async () => {
    const onSlotsChange = await renderPane([
      { rank: '2', suit: 'spades' },
      { rank: '3', suit: 'hearts' },
    ]);

    await fireEvent.press(screen.getByTestId('pane-slot-0')); // arm slot 0
    await fireArcTap('clubs', ACE_X); // pick the ace of clubs from the fan

    expect(onSlotsChange).toHaveBeenLastCalledWith([
      { rank: 'A', suit: 'clubs' },
      { rank: '3', suit: 'hearts' },
    ]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOn');
  });

  it('a drag that crosses into a new card fires dragTick, and releasing selects the card under the finger', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('pane-arc-spades'), [
        { state: State.BEGAN, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: THREE_X, y: 40 },
        { state: State.END, x: THREE_X, y: 40 },
      ]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith('dragTick');
    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '3', suit: 'spades' }, null]);
  });
});
