// registers this project's real themes and namespaces — see
// `../segmented-tabs/segmented-tabs.test.tsx` for why this
// side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../selection-grid/selection-grid.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import Animated from 'react-native-reanimated';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { Card } from '@/shared/model/card';
import { computeFanLayout, FAN_ARC, PREVIEW_SLOT } from '@/shared/ui/card-fan-geometry';

import { CardsPane } from './cards-pane';
import { SlotFillPolicy, type CardsPaneSlots } from './selection';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

// matches computeFanLayout's own scale-1 reference content width (see
// card-fan-geometry.test.ts's "is exactly 1.0000" case): the frame's 399
// width plus the 1px inset on each side.
const FAN_CONTENT_WIDTH = FAN_ARC.frameWidth + 2;
const LAYOUT = computeFanLayout(FAN_CONTENT_WIDTH);
// ascending rank order (2..A) — the same index card-fan-geometry.ts's own
// `FAN_CARDS` uses. index 0 is the deuce, index 12 the ace.
const TWO_X = LAYOUT.cards[0].centerX;
const THREE_X = LAYOUT.cards[1].centerX;
const ACE_X = LAYOUT.cards[12].centerX;

const EMPTY_SLOTS: CardsPaneSlots = [null, null];

// this pane carries no copy of its own any more (see its doc comment), so
// every test here supplies it, standing in for whichever sheet mounts it.
// the empty-slot wording is the player sheet's own literal copy, so the
// assertions below still read as what a screen reader announces; the
// filled forms are a bare stand-in, since nothing here asserts one — the
// real filled labels are asserted where they are actually composed, in
// `../../../features/hand-ranges/ui/holding-input-sheet/`'s own test.
function playerSlotAccessibilityLabel({
  index,
  card,
  focused,
}: {
  index: number;
  card: Card | null;
  focused: boolean;
}): string {
  const slot = index === 0 ? 'The left card' : 'The right card';
  if (card === null) {
    return `${slot} is not selected`;
  }
  return `${slot}${focused ? ' (focused)' : ''}: ${card.rank}${card.suit}`;
}

const EMPTY_SLOTS_LABEL = 'Neither card is selected';

async function renderPane(
  slots: CardsPaneSlots,
  onSlotsChange: jest.Mock = jest.fn(),
  options: {
    fillPolicy?: SlotFillPolicy;
    initialFocusedSlot?: number;
    unavailableCards?: readonly Card[];
  } = {},
) {
  await render(
    <GestureHandlerRootView>
      <CardsPane
        slots={slots}
        fillPolicy={options.fillPolicy ?? SlotFillPolicy.Independent}
        initialFocusedSlot={options.initialFocusedSlot}
        unavailableCards={options.unavailableCards}
        slotAccessibilityLabel={playerSlotAccessibilityLabel}
        emptySlotsAccessibilityLabel={EMPTY_SLOTS_LABEL}
        onSlotsChange={onSlotsChange}
        testID="pane"
      />
    </GestureHandlerRootView>,
  );

  // the fan needs a measured width before `computeFanLayout` can resolve
  // any touch to a card — see `hand-range-pane.test.tsx`'s own matching
  // layout fire for the grid.
  await fireEvent(screen.getByTestId('fan'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: FAN_CONTENT_WIDTH, height: 400 } },
  });

  return onSlotsChange;
}

// unlike `fireEvent`, `fireGestureHandler` isn't itself `act()`-aware —
// its synthetic events reach `Gesture.Pan()`'s callbacks through
// `react-native-gesture-handler`'s own event emitter, which drives this
// component's `setFocusedSlot`/`setActiveDrag` updates outside any `act()`
// boundary RNTL sets up automatically. wrapping every call here keeps
// those updates flushed and visible to the next assertion, same as
// `selection-grid.test.tsx`'s calls need for a component that (unlike
// `SelectionGrid` itself) holds real React state of its own.
async function fireArcTap(suit: string, x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`arc-${suit}`), [
      { state: State.BEGAN, x, y: 40 },
      { state: State.END, x, y: 40 },
    ]);
  });
}

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

describe('<CardsPane />', () => {
  it('renders both slots empty, each naming its own side, and the row summarising both', async () => {
    await renderPane(EMPTY_SLOTS);

    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'The left card is not selected',
    );
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'The right card is not selected',
    );

    const slotsRow = screen.getByTestId('slots');
    expect(slotsRow.props.accessibilityRole).toBe('summary');
    expect(slotsRow.props.accessibilityLabel).toBe('Neither card is selected');
  });

  it('drops the row’s own summary once either slot holds a card, leaving the still-empty slot’s own line in place', async () => {
    await renderPane([{ rank: '2', suit: 's' }, null]);

    const slotsRow = screen.getByTestId('slots');
    expect(slotsRow.props.accessibilityRole).toBeUndefined();
    expect(slotsRow.props.accessibilityLabel).toBeUndefined();
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'The right card is not selected',
    );
  });

  it('a tap on a fan card fills the initially-focused slot 0, firing toggleOn', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await fireArcTap('s', TWO_X);

    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '2', suit: 's' }, null]);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
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
    // `nearestSelectableCardIndex` (`../card-fan-geometry.ts`) already
    // skips a taken card, so a real touch at `TWO_X` while the deuce of
    // spades sits in slot 0 never resolves back onto it — the same
    // guarantee `selection.test.ts`'s `selectCard` tests cover directly,
    // exercised here through this component's actual touch-resolution
    // path instead.
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

    expect(screen.getByTestId('slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('tapping the non-focused slot moves focus there, reporting accessibilityState.selected and firing selectionChange', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('slot-1'));

    expect(screen.getByTestId('slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByTestId('slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });

  it('tapping an empty, non-focused slot moves focus there too — an empty slot is always tappable', async () => {
    // both slots start empty, so `initialFocusedSlot` (`./selection.ts`)
    // focuses slot 0, leaving slot 1 both empty and non-focused — the one
    // configuration where an "empty, non-focused" slot exists to tap.
    await renderPane(EMPTY_SLOTS);

    await fireEvent.press(screen.getByTestId('slot-1'));

    expect(screen.getByTestId('slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });

  // regression coverage for the invisible-ring bug found on a real device
  // (both slots rendered the last-rendered slot's own armed/filled state —
  // see `./cards-pane.tsx`'s `PreviewSlot` doc comment for its old shape).
  // the ring is one shared, always-mounted element now (PR #70's motion
  // system, travelling between the two slots rather than mounting fresh
  // on whichever one holds focus), so the failure mode this test used to
  // catch — both slots rendering one, or neither — is now structurally
  // impossible: there is only ever one `ring` element in the tree to
  // begin with, focus change or not. RNTL runs no layout engine and
  // Reanimated is mocked in every component test that reaches this
  // module (docs/conventions/testing.md), so this cannot observe the
  // ring actually travel — only that exactly one persists across a focus
  // change, never more and never fewer.
  it('renders exactly one focus ring, regardless of which slot holds focus', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    expect(screen.getAllByTestId('ring')).toHaveLength(1);

    await fireEvent.press(screen.getByTestId('slot-1')); // move focus to slot 1

    expect(screen.getAllByTestId('ring')).toHaveLength(1);
  });

  // regression coverage for the focus-ring geometry bug: the previous
  // `variants.armed` block added a border to the same box fixed at
  // `PREVIEW_SLOT.width`×`height`, insetting its content box while the
  // `PlayingCard` filling it stayed the same size. neither slot's box
  // dimensions may change now, focused or not — the ring is an
  // absolutely-positioned overlay entirely out of flow. RNTL runs no
  // layout engine, so this asserts the style values alone, not real
  // on-device measured geometry.
  it('keeps both slots at their fixed 48×75 box regardless of which one is focused', async () => {
    await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    const expectedBox = expect.objectContaining({
      width: PREVIEW_SLOT.width,
      height: PREVIEW_SLOT.height,
    });
    const slot0StyleBefore = screen.getByTestId('slot-0').props.style;
    const slot1StyleBefore = screen.getByTestId('slot-1').props.style;
    expect(slot0StyleBefore[0]).toEqual(expectedBox);
    expect(slot1StyleBefore[0]).toEqual(expectedBox);

    await fireEvent.press(screen.getByTestId('slot-1')); // move focus to slot 1

    const slot0StyleAfter = screen.getByTestId('slot-0').props.style;
    const slot1StyleAfter = screen.getByTestId('slot-1').props.style;
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

    await fireEvent.press(screen.getByTestId('slot-0')); // slot 0 already has focus — clears it

    expect(onSlotsChange).toHaveBeenLastCalledWith([null, { rank: '3', suit: 'h' }]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOff');
    expect(screen.getByTestId('slot-0').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('after clearing the focused slot, the next fan pick fills that same slot — the deliberate asymmetry with a pick', async () => {
    const onSlotsChange = await renderPane([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
    ]);

    await fireEvent.press(screen.getByTestId('slot-0')); // clear slot 0; focus stays on it
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

    await fireEvent.press(screen.getByTestId('slot-1')); // move focus to slot 1
    await fireArcTap('c', ACE_X); // pick the ace of clubs from the fan

    expect(onSlotsChange).toHaveBeenLastCalledWith([
      { rank: '2', suit: 's' },
      { rank: 'A', suit: 'c' },
    ]);
    expect(mockedTriggerHaptic).toHaveBeenLastCalledWith('toggleOn');
  });

  it('renders one slot per entry in `slots`, taking its count from the row it is handed', async () => {
    await renderPane([null, null, null, null, null], jest.fn(), {
      fillPolicy: SlotFillPolicy.LeftPacked,
    });

    expect(screen.getAllByTestId(/^slot-\d$/)).toHaveLength(5);
    expect(screen.getAllByTestId('ring')).toHaveLength(1);
  });

  it('seeds focus from `initialFocusedSlot`, clamped by the fill policy', async () => {
    // slot 2 is the first empty one, so a request for slot 4 lands on 2 —
    // the clamp `./selection.ts` applies, observed here through the only
    // thing a component test can see of focus, `accessibilityState`.
    await renderPane(
      [{ rank: '2', suit: 's' }, { rank: '3', suit: 'h' }, null, null, null],
      jest.fn(),
      {
        fillPolicy: SlotFillPolicy.LeftPacked,
        initialFocusedSlot: 4,
      },
    );

    expect(screen.getByTestId('slot-2').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('slot-4').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('seeds focus from `initialFocusedSlot` even where the derived fallback would differ', async () => {
    // the case the clamped test above cannot make: there, the requested
    // slot and the slot derived from `slots` alone are the same number, so
    // it passes whether or not the caller's request is read at all. here
    // the board is filled through slot 2, so the derived seed
    // (`./selection.ts`'s `initialFocusedSlot`, the first empty slot)
    // would be 3 — and the caller asks for 1. focus landing on 1 is only
    // possible if the request is what seeds it.
    await renderPane(
      [{ rank: '2', suit: 's' }, { rank: '3', suit: 'h' }, { rank: '4', suit: 'd' }, null, null],
      jest.fn(),
      {
        fillPolicy: SlotFillPolicy.LeftPacked,
        initialFocusedSlot: 1,
      },
    );

    expect(screen.getByTestId('slot-1').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('slot-3').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('a drag that crosses into a new card fires dragTick, and releasing selects the card under the finger', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('arc-s'), [
        { state: State.BEGAN, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: THREE_X, y: 40 },
        { state: State.END, x: THREE_X, y: 40 },
      ]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragTick);
    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '3', suit: 's' }, null]);
  });
});

describe('<CardsPane /> unavailable cards', () => {
  it('a tap at an unavailable card’s own position resolves to the nearest available card instead, never filling a slot with it', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS, jest.fn(), {
      unavailableCards: [{ rank: '2', suit: 's' }],
    });

    await fireArcTap('s', TWO_X);

    // the same "skip and resolve to the nearest other card" outcome the
    // already-taken case gets, exercised here through the touch-resolution
    // path rather than through `selectCard` directly.
    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '3', suit: 's' }, null]);
    expect(onSlotsChange).not.toHaveBeenCalledWith([{ rank: '2', suit: 's' }, null]);
  });

  it('a drag release at an unavailable card’s own position never selects it either', async () => {
    const onSlotsChange = await renderPane(EMPTY_SLOTS, jest.fn(), {
      unavailableCards: [{ rank: '3', suit: 's' }],
    });

    await act(async () => {
      fireGestureHandler(getByGestureTestId('arc-s'), [
        { state: State.BEGAN, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: TWO_X, y: 40 },
        { state: State.ACTIVE, x: THREE_X, y: 40 },
        { state: State.END, x: THREE_X, y: 40 },
      ]);
    });

    // the drag's release point is the three of spades' own position, but
    // it's unavailable — `nearestSelectableCardIndex` already skipped it,
    // so the drag's own candidate (and the card it releases onto) is the
    // deuce instead.
    expect(onSlotsChange).toHaveBeenCalledWith([{ rank: '2', suit: 's' }, null]);
    expect(onSlotsChange).not.toHaveBeenCalledWith([{ rank: '3', suit: 's' }, null]);
  });

  it('renders an unavailable card and a taken card with two distinct accessibility states', async () => {
    // one slot already holds the deuce of spades (`taken`); the three of
    // spades is unavailable through the prop instead — two different
    // reasons a card can't be picked, which must stay two different
    // rendered states. scoped to the fan itself: the preview slot above it
    // renders the identical deuce card, with the identical plain label, so
    // an unscoped query would find two.
    await renderPane([{ rank: '2', suit: 's' }, null], jest.fn(), {
      unavailableCards: [{ rank: '3', suit: 's' }],
    });
    const fan = within(screen.getByTestId('fan'));

    const takenCard = fan.getByLabelText('deuce of spades');
    expect(takenCard.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );

    const unavailableCard = fan.getByLabelText('three of spades, unavailable');
    expect(unavailableCard.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('renders a card that is both taken and unavailable as taken, not unavailable', async () => {
    await renderPane([{ rank: '2', suit: 's' }, null], jest.fn(), {
      unavailableCards: [{ rank: '2', suit: 's' }],
    });
    const fan = within(screen.getByTestId('fan'));

    // the plain spoken name and a non-disabled state — the taken
    // treatment — rather than the ", unavailable" suffix and
    // `disabled: true` the same card would carry if only unavailable.
    const card = fan.getByLabelText('deuce of spades');
    expect(card.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    expect(fan.queryByLabelText('deuce of spades, unavailable')).toBeNull();
  });
});

// proves docs/conventions/component-styling.md's first rule is real for
// `FanArc`'s own root `View`, not merely type-level — the same shape
// `submit-bar.test.tsx`'s own style-merge assertion (commit 86f2859)
// takes. `FanArc` is a file-private subcomponent with no export of its own
// (see component-styling.md's own worked-example table), so there is no
// way to render it in isolation with an arbitrary test-supplied style the
// way an exported component's test can; its one caller is `CardsPane`'s
// own `SUITS.map`, which always supplies its real computed placement —
// `position: 'absolute'` included, alongside `top`/`left`/`width`/`height`
// — rather than a value this test controls. What this asserts instead is
// still an honest, non-vacuous check of the same thing: that this
// caller-supplied placement actually reaches `FanArc`'s rendered root — if
// the caller's `style` prop were ever dropped on the way there, this
// assertion would fail. `FanArc`'s own stylesheet holds no root style any
// more to merge that placement onto: `styles.arc` used to hold `position:
// 'absolute'` by itself, and is gone from this file's stylesheet entirely
// now that the property moved to this same caller per rule 1, so `style`
// lands on `FanArc`'s root directly rather than through a merge — this
// test still proves the property survives that path to the rendered node.
describe('<CardsPane /> FanArc style', () => {
  it("carries each arc's caller-supplied placement — positioning mode included — through to FanArc's rendered root", async () => {
    await renderPane(EMPTY_SLOTS);

    const spadesStyle = StyleSheet.flatten(screen.getByTestId('arc-s').props.style);
    // `CardsPane`'s own caller-supplied `position: 'absolute'` reaches the
    // rendered node...
    expect(spadesStyle.position).toBe('absolute');
    // ...alongside `CardsPane`'s own caller-supplied placement, computed
    // from `fanLayout` and this arc's own index within `SUITS` (spades is
    // index 0, so `top` is `0` here).
    expect(spadesStyle).toMatchObject({
      top: FAN_ARC.pitch * LAYOUT.scale * 0,
      left: LAYOUT.offsetX,
      width: LAYOUT.frameWidth,
      height: LAYOUT.frameHeight,
    });

    // hearts is index 1 within `SUITS`, so only its own `top` differs —
    // proof this isn't one hardcoded value shared by every arc.
    const heartsStyle = StyleSheet.flatten(screen.getByTestId('arc-h').props.style);
    expect(heartsStyle.position).toBe('absolute');
    expect(heartsStyle.top).toBe(FAN_ARC.pitch * LAYOUT.scale * 1);
  });
});

// the sibling of the `FanArc style` block above, for `FanCard` — the last
// open finding from PR #98's independent review (issue #94's per-component
// style-propagation criterion). `FanCard`'s own root style array is now
// `[{ zIndex }, animatedStyle, style]`, with `style` itself — `position:
// 'absolute'` and the `left`/`top` `FanArc`'s own `.map` computes from
// `cardLayout` — arriving from that same call site, per
// docs/conventions/component-styling.md's first rule (see `FanCard`'s own
// doc comment). nothing before this asserted all three array members
// survive together: if the caller's `style` were ever dropped from that
// array, every one of the fifty-two cards would render at the same
// position, and no existing test would fail.
//
// `FanCard` carries no `testID` of its own (`FanArc`'s own `.map` call
// site above passes none), so it can't be queried directly the way `arc-s`
// is. It's reached instead through the already-rendered tree beneath that
// same `arc-<suit>` node: `within(arc).UNSAFE_getAllByType(Animated.View)`
// walks the whole subtree for elements of type `Animated.View` — this
// finds two per card (`FanCard`'s own root, and the `Animated.View`
// `PlayingCard` renders inside it), so the results are narrowed to the
// ones carrying a `zIndex` — a key only `FanCard`'s own root style ever
// sets (never `PlayingCard`'s) — leaving exactly the thirteen `FanCard`
// roots for that arc, in `layout.cards`' own ascending-rank order.
describe('<CardsPane /> FanCard style', () => {
  it("carries each card's own caller-supplied left/top and position through FanCard's rendered root, alongside FanCard's own zIndex", async () => {
    await renderPane(EMPTY_SLOTS);

    function fanCardStyles(suit: string) {
      const arc = screen.getByTestId(`arc-${suit}`);
      return within(arc)
        .UNSAFE_getAllByType(Animated.View)
        .filter((view) => StyleSheet.flatten(view.props.style).zIndex !== undefined)
        .map((view) => StyleSheet.flatten(view.props.style));
    }

    // the deuce of spades — `layout.cards[0]`, the same index `TWO_X`
    // (module-level above) resolves a touch against.
    const spadesTwo = fanCardStyles('s')[0];
    const twoLayout = LAYOUT.cards[0];
    expect(spadesTwo.position).toBe('absolute');
    expect(spadesTwo.left).toBe(twoLayout.centerX - twoLayout.width / 2);
    expect(spadesTwo.top).toBe(twoLayout.centerY - twoLayout.height / 2);
    expect(spadesTwo.zIndex).toBe(0);

    // the three of hearts — `layout.cards[1]`, a different suit and a
    // different index than the deuce of spades above — proof this is each
    // card's own geometry, not one value shared by every card.
    const heartsThree = fanCardStyles('h')[1];
    const threeLayout = LAYOUT.cards[1];
    expect(heartsThree.position).toBe('absolute');
    expect(heartsThree.left).toBe(threeLayout.centerX - threeLayout.width / 2);
    expect(heartsThree.top).toBe(threeLayout.centerY - threeLayout.height / 2);
    expect(heartsThree.zIndex).toBe(0);

    // the deuce of spades and the three of hearts sit at genuinely
    // different positions — otherwise the assertions above would pass
    // whether or not this is really per-card geometry.
    expect(spadesTwo.left).not.toBe(heartsThree.left);
  });
});
