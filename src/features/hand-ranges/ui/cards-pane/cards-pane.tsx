import type { ComponentProps } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { RANKS, SUITS, type Card, type Suit } from '../../model/card';
import {
  computeFanLayout,
  nearestSelectableCardIndex,
  FAN_ARC,
  PREVIEW_SLOT,
  type FanLayout,
} from '../card-fan-geometry';
import { cardSpokenName } from '../card-spoken-name';
import {
  initialFocusedSlot,
  selectCard,
  takenRankIndicesForSuit,
  tapSlot,
  type CardsPaneState,
} from './cards-pane-selection';
import { PlayingCard } from '../playing-card/playing-card';

export type CardsPaneSlots = readonly [Card | null, Card | null];

// the vertical clearance a drag's own candidate card lifts above its
// resting position in the arc — "the candidate lifts clear of the arc,
// above the finger, so it is visible past the fingertip" (this run's own
// brief). docs/specs/hand-ranges.md and docs/conventions/design-system.md
// carry no measured value for this distance — there is nothing in the
// design file to reproduce faithfully — so this is an implementer's own
// choice, not a design measurement, and stays unverified until a real
// touch on a real device confirms it actually clears a fingertip.
const CANDIDATE_LIFT = 28;

/**
 * one active drag's own candidate: which suit's arc it is in, and the
 * index (within that arc, ascending rank) the drag currently resolves to.
 * `null` — no drag in progress — is the pane's own resting state.
 */
type ActiveDrag = { readonly suit: Suit; readonly index: number } | null;

/**
 * the card/range input sheet's `Cards` tab (docs/specs/hand-ranges.md):
 * two preview slots above four fanned arcs of thirteen cards each, one
 * arc per suit. the hardest surface in this change — see this run's own
 * report for exactly what stays unverified until a real device confirms
 * it.
 *
 * `slots` is this component's whole controlled state; `focusedSlot`
 * (which slot the next pick lands in) is not part of it and stays local,
 * component-owned state instead — focus is a transient UI mode with no
 * meaning to a caller beyond "the next pick replaces this slot," and
 * `resolveHoldingOutcome` (`../../model/holding.ts`) reads only the resolved
 * `holeCards`, never which slot currently has focus. every state
 * transition — a fan tap, a drag's release, or a slot tap — goes through
 * `cards-pane-selection.ts`'s own pure rules; this component owns turning
 * a `Gesture.Pan()` per arc into calls against that module, and rendering
 * whatever it decides.
 */
export function CardsPane({
  slots,
  onSlotsChange,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  slots: CardsPaneSlots;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires with the whole
   * updated pair of slots, whichever of `cards-pane-selection.ts`'s own
   * rules produced it (a fill, an overwrite, or a clear). */
  onSlotsChange: (slots: CardsPaneSlots) => void;
  testID?: string;
}) {
  const { t } = useTranslation('handRanges');

  // lazy initializer — read once, on this component's own first mount,
  // per `initialFocusedSlot`'s own doc comment (`./cards-pane-selection.ts`)
  // for why it derives from `slots` rather than always starting at `0`.
  // Focus never re-derives from `slots` again after mount: it is meant to
  // stay wherever the user's own last tap or pick left it while this
  // component stays mounted, not to jump around on every prop change.
  const [focusedSlot, setFocusedSlot] = useState<0 | 1>(() => initialFocusedSlot(slots));
  const [fanWidth, setFanWidth] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  // rebuilt fresh every render from `slots`/`focusedSlot`; passed down to
  // `FanArc` (for its own `takenRankIndicesForSuit` read) and read
  // locally below, but never captured inside a `useCallback` closure —
  // each callback below reconstructs its own copy from the same two
  // dependencies it already lists, so nothing here depends on this
  // object's own identity surviving between renders.
  const state: CardsPaneState = { slots, focusedSlot };

  const applySelectCard = useCallback(
    (card: Card) => {
      const result = selectCard({ slots, focusedSlot }, card);
      if (result.state.slots !== slots) {
        onSlotsChange(result.state.slots);
      }
      setFocusedSlot(result.state.focusedSlot);
      if (result.haptic !== null) {
        triggerHaptic(result.haptic);
      }
    },
    [slots, focusedSlot, onSlotsChange],
  );

  const handleSlotPress = useCallback(
    (slotIndex: 0 | 1) => {
      const result = tapSlot({ slots, focusedSlot }, slotIndex);
      if (result.state.slots !== slots) {
        onSlotsChange(result.state.slots);
      }
      setFocusedSlot(result.state.focusedSlot);
      if (result.haptic !== null) {
        triggerHaptic(result.haptic);
      }
    },
    [slots, focusedSlot, onSlotsChange],
  );

  const handleFanLayout = useCallback((event: LayoutChangeEvent) => {
    setFanWidth(event.nativeEvent.layout.width);
  }, []);

  const fanLayout = fanWidth !== null ? computeFanLayout(fanWidth) : null;
  const totalFanHeight = fanLayout
    ? FAN_ARC.pitch * fanLayout.scale * 3 + fanLayout.frameHeight
    : 0;

  return (
    // `style` merged last, after this component's own `styles.root`, so a
    // caller extending it does not wipe out the slots-to-fan `gap` layout
    // below depends on; every other rest prop spread after `testID`, the
    // same ordering `SegmentedTabs` uses.
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View style={styles.slots}>
        {([0, 1] as const).map((slotIndex) => {
          const card = slots[slotIndex];
          const focused = focusedSlot === slotIndex;
          const spokenIndex = slotIndex + 1;
          const accessibilityLabel =
            card === null
              ? t('cards.emptySlotAccessibilityLabel', { index: spokenIndex })
              : t(
                  focused
                    ? 'cards.focusedSlotAccessibilityLabel'
                    : 'cards.filledSlotAccessibilityLabel',
                  {
                    index: spokenIndex,
                    card: cardSpokenName(card, t),
                  },
                );

          return (
            <PreviewSlot
              key={slotIndex}
              slotIndex={slotIndex}
              card={card}
              focused={focused}
              onPress={handleSlotPress}
              accessibilityLabel={accessibilityLabel}
              testID={testID ? `slot-${slotIndex}` : undefined}
            />
          );
        })}
      </View>
      <View
        style={[styles.fan, { height: totalFanHeight }]}
        onLayout={handleFanLayout}
        testID={testID ? 'fan' : undefined}
      >
        {fanLayout
          ? SUITS.map((suit, suitIndex) => (
              <FanArc
                key={suit}
                suit={suit}
                suitIndex={suitIndex}
                layout={fanLayout}
                state={state}
                activeDrag={activeDrag}
                onActiveDragChange={setActiveDrag}
                onSelectCard={applySelectCard}
                testID={testID ? `arc-${suit}` : undefined}
              />
            ))
          : null}
      </View>
    </View>
  );
}

type PreviewSlotProps = {
  slotIndex: 0 | 1;
  card: Card | null;
  focused: boolean;
  onPress: (slotIndex: 0 | 1) => void;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * one of the two preview slots above the fan. empty: a dashed border,
 * matching `../../../analyze/ui/board.tsx`'s own empty board slots exactly
 * (same radius, same border colour) — docs/specs/hand-ranges.md's card
 * picker feeds both this sheet's hole cards and, eventually, that same
 * board's community-card slots from one picker, so the two are drawn
 * alike deliberately. filled: a `PlayingCard` at the preview size, ringed
 * in the accent solid colour while it holds focus. every slot is always
 * pressable, empty or filled: under the focus model
 * (`./cards-pane-selection.ts`), tapping *either* slot always does
 * something — the other slot's tap moves focus there, and the focused
 * slot's own tap clears it (or is a no-op only when it is already empty).
 * its own accessibility label is resolved by its caller (`CardsPane`
 * above), not here — a typed `t()` call cannot be threaded through a
 * plain-string prop without losing the literal-key checking
 * `react-i18next`'s own generated types give every other call site in
 * this file.
 *
 * **plain conditional styles, not Unistyles `variants` — deliberately.**
 * `styles` (below) is this whole file's one `StyleSheet.create` result,
 * shared by both `PreviewSlot` instances `CardsPane` renders; each used to
 * call `styles.useVariants({ focused, filled })` on it, and the second
 * instance's call clobbered the first's — both slots ended up rendering
 * whichever slot happened to render last own `focused`/`filled` state,
 * which is why the focus ring was invisible on a real device (see this
 * run's own report for what was and was not confirmed about
 * `useVariants`'s own scoping before landing on this fix). `styles.slot`
 * below is now static — no variant, so no state to share across instances
 * at all — and the two states below are expressed as plain conditional
 * styles instead.
 */
function PreviewSlot({
  slotIndex,
  card,
  focused,
  onPress,
  accessibilityLabel,
  testID,
}: PreviewSlotProps) {
  const handlePress = useCallback(() => {
    onPress(slotIndex);
  }, [onPress, slotIndex]);

  return (
    <Pressable
      style={[styles.slot, card === null ? styles.slotEmpty : null]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
      testID={testID}
    >
      {card !== null ? <PlayingCard card={card} size="preview" scale={1} /> : null}
      {focused ? (
        // the focus ring: an absolutely-positioned sibling, entirely out
        // of flow — never a style on `styles.slot` itself, which the
        // slot's own fixed `PREVIEW_SLOT.width`×`height` and the
        // `PlayingCard` filling it both depend on staying constant. see
        // this component's own doc comment above for why a border-adding
        // `focused` variant on that box was wrong: `width`/`height` are
        // the border box in React Native, so a border there insets the
        // content box while the always-48×75 card inside it does not
        // shrink to match, and the card overflows. an out-of-flow overlay
        // instead means neither this slot's own box nor the sibling
        // slot's position can ever move for it.
        <View style={styles.focusRing} pointerEvents="none" testID={testID ? 'ring' : undefined} />
      ) : null}
    </Pressable>
  );
}

type FanArcProps = {
  suit: Suit;
  suitIndex: number;
  layout: FanLayout;
  state: CardsPaneState;
  activeDrag: ActiveDrag;
  onActiveDragChange: (drag: ActiveDrag) => void;
  onSelectCard: (card: Card) => void;
  testID?: string;
};

/**
 * everything one arc's gesture callbacks need that can change between the
 * gesture's own build and an actual touch arriving — read through a ref,
 * never captured by value, for exactly the reason
 * `../../../../shared/ui/selection-grid/selection-grid.tsx`'s own
 * `GestureContext` is: `pan` below is built once (`useMemo`), and this
 * component's own `onActiveDragChange` call, on every `dragTick`, would
 * otherwise re-render this component and rebuild `pan` mid-drag — tearing
 * down and reattaching the native handler underneath an active touch.
 */
type FanArcGestureContext = {
  suit: Suit;
  layout: FanLayout;
  takenIndices: ReadonlySet<number>;
  onActiveDragChange: (drag: ActiveDrag) => void;
  onSelectCard: (card: Card) => void;
};

/**
 * one suit's own thirteen-card arc — its own `Gesture.Pan()`, bounded to
 * this arc's own frame, so "touch and pan horizontally within one arc"
 * (this run's own brief) resolves against this arc's cards alone, never a
 * neighbouring suit's.
 *
 * a touch's own x, resolved through `nearestSelectableCardIndex`, decides
 * the candidate — skipping any card already taken in either slot,
 * `./cards-pane-selection.ts`'s own `takenRankIndicesForSuit`. the
 * candidate is silent on `onBegin` (a plain tap, which never moves,
 * resolves entirely through `onEnd` below) and fires `dragTick` on every
 * further crossing `onUpdate` finds — the same "silent first touch, a
 * haptic on each further crossing" shape
 * `../../../../shared/ui/selection-grid/selection-grid.tsx`'s own paint
 * gesture uses, adapted to a fan whose selection commits on release
 * rather than on touch-down.
 */
function FanArc({
  suit,
  suitIndex,
  layout,
  state,
  activeDrag,
  onActiveDragChange,
  onSelectCard,
  testID,
}: FanArcProps) {
  const takenIndices = takenRankIndicesForSuit(state, suit);

  const contextRef = useRef<FanArcGestureContext>({
    suit,
    layout,
    takenIndices,
    onActiveDragChange,
    onSelectCard,
  });
  // see `FanArcGestureContext`'s own doc comment for why this is a
  // layout effect, not a write during render — the same reasoning
  // `selection-grid.tsx`'s own matching effect gives.
  useLayoutEffect(() => {
    contextRef.current = { suit, layout, takenIndices, onActiveDragChange, onSelectCard };
  });

  // the drag's own last-known candidate index, compared against on every
  // `onUpdate` crossing so a `dragTick` fires only when it actually
  // changes — not read from `activeDrag` (this component's own prop),
  // which lags a frame behind the gesture's own JS-thread callbacks the
  // same way `selection-grid.tsx`'s own `lastCellIndexRef` does.
  const lastIndexRef = useRef<number | null>(null);

  // built once, not on every render — see `FanArcGestureContext`'s own
  // doc comment above for why rebuilding this mid-drag would be wrong.
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      // eslint-disable-next-line react-hooks/refs -- see `selection-grid.tsx`'s own matching suppression: reading `contextRef.current` fresh at call time is this file's whole reason for the ref.
      .onBegin((event) => {
        const { suit, layout, takenIndices, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, takenIndices);
        lastIndexRef.current = index;
        onActiveDragChange(index !== null ? { suit, index } : null);
      })
      // eslint-disable-next-line react-hooks/refs
      .onUpdate((event) => {
        const { suit, layout, takenIndices, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, takenIndices);
        if (index === null || index === lastIndexRef.current) {
          return;
        }
        lastIndexRef.current = index;
        triggerHaptic(HapticEvent.DragTick);
        onActiveDragChange({ suit, index });
      })
      // eslint-disable-next-line react-hooks/refs
      .onEnd((event) => {
        const { suit, layout, takenIndices, onSelectCard, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, takenIndices);
        lastIndexRef.current = null;
        onActiveDragChange(null);
        if (index !== null) {
          onSelectCard({ rank: RANKS[index], suit });
        }
      })
      // eslint-disable-next-line react-hooks/refs
      .onFinalize(() => {
        lastIndexRef.current = null;
        contextRef.current.onActiveDragChange(null);
      });

    if (testID) {
      gesture.withTestId(testID);
    }

    return gesture;
  }, [testID]);

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.arc,
          {
            top: FAN_ARC.pitch * layout.scale * suitIndex,
            width: layout.frameWidth,
            height: layout.frameHeight,
          },
        ]}
        testID={testID}
      >
        {layout.cards.map((cardLayout, index) => {
          const card: Card = { rank: RANKS[index], suit };
          const taken = takenIndices.has(index);
          const lifted =
            !taken && activeDrag !== null && activeDrag.suit === suit && activeDrag.index === index;

          return (
            <View
              key={index}
              style={[
                styles.fanCard,
                {
                  left: cardLayout.centerX - cardLayout.width / 2,
                  top: cardLayout.centerY - cardLayout.height / 2 - (lifted ? CANDIDATE_LIFT : 0),
                  transform: [{ rotate: `${cardLayout.rotation}deg` }],
                  zIndex: lifted ? 1 : 0,
                },
              ]}
              // required so a touch reaches the arc's own `Gesture.Pan()`
              // above rather than this card — but it also removes this
              // card's own accessible element from hit-testing entirely,
              // across all fifty-two cards in the fan; see
              // docs/specs/hand-ranges.md's "Known accessibility gap in
              // the fan" for the residual risk this leaves unfixed.
              pointerEvents="none"
            >
              <PlayingCard card={card} size="fan" scale={layout.scale} taken={taken} />
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

// the "slots to fan" gap this run's own brief names, one of the sheet's
// four uniform 40-apart landmark gaps (see
// `./holding-input-sheet.tsx`'s own `LANDMARK_GAP`) — not one of
// `theme.space`'s own steps (`x32`, `x48`), so it stays this pane's own
// named constant rather than reaching for a step that does not match.
const SLOTS_TO_FAN_GAP = 40;
// the focus ring's own clearance outside the slot's edge, and its own
// border width (`theme.borderWidth.thick`) — not a measured design value,
// same as `CANDIDATE_LIFT` above: this run's own report flags both the
// same way.
const FOCUS_RING_OFFSET = 3;

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: SLOTS_TO_FAN_GAP,
  },
  slots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: PREVIEW_SLOT.gap,
  },
  // static — no `variants` here; see `PreviewSlot`'s own doc comment for
  // why a variant on this shared stylesheet is what let one slot's own
  // focused/filled state leak onto the other. `position: 'relative'` is
  // what anchors `focusRing` below's negative offsets to this box rather
  // than to some further ancestor.
  slot: {
    width: PREVIEW_SLOT.width,
    height: PREVIEW_SLOT.height,
    borderRadius: PREVIEW_SLOT.radius,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // an empty slot draws its own dashed border, matching
  // ../../../analyze/ui/board.tsx's own empty board slots exactly; a filled
  // slot draws none of its own — `PlayingCard` already draws its own
  // border — so `PreviewSlot` only ever merges this in when there is no
  // card to draw one itself.
  slotEmpty: {
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
  // the focus ring — an absolutely-positioned overlay, entirely out of
  // flow, rendered as a sibling of the card inside the slot
  // (`PreviewSlot`'s own body) rather than as a style on `slot` itself:
  // `width`/`height` are the border box in React Native, so a border
  // added to the same fixed-size box the card fills would inset the
  // content box while the card stayed the same size and overflowed it —
  // the geometry bug this replaces. an out-of-flow overlay instead can
  // never move either this slot's own box or the sibling slot's position.
  // exactly one of the two slots renders this at a time — one of the two
  // slots always has focus, per `./cards-pane-selection.ts`'s own
  // `CardsPaneState`.
  focusRing: {
    position: 'absolute',
    top: -FOCUS_RING_OFFSET,
    left: -FOCUS_RING_OFFSET,
    right: -FOCUS_RING_OFFSET,
    bottom: -FOCUS_RING_OFFSET,
    borderWidth: theme.borderWidth.thick,
    borderRadius: PREVIEW_SLOT.radius + FOCUS_RING_OFFSET,
    borderColor: theme.colors.solid.accent.rest,
  },
  fan: {
    width: '100%',
  },
  arc: {
    position: 'absolute',
    left: 0,
  },
  fanCard: {
    position: 'absolute',
  },
}));
