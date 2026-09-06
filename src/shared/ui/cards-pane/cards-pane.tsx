import type { ComponentProps } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionQuick, motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { RANKS, SUITS, type Card, type Suit } from '@/shared/model/card';
import { sheetContentWidth } from '@/shared/ui/bottom-sheet/bottom-sheet';
import {
  computeFanLayout,
  nearestSelectableCardIndex,
  FAN_ARC,
  FAN_CARD,
  PREVIEW_SLOT,
  type FanCardLayout,
  type FanLayout,
} from '@/shared/ui/card-fan-geometry';
import { PlayingCard } from '@/shared/ui/playing-card/playing-card';

import {
  clampFocusedSlot,
  initialFocusedSlot,
  selectCard,
  takenRankIndicesForSuit,
  tapSlot,
  unavailableRankIndicesForSuit,
  type CardsPaneSlots,
  type CardsPaneState,
  type SlotFillPolicy,
} from './selection';

// the vertical clearance a drag's candidate card lifts above its resting
// position in the arc, so it's visible past the fingertip.
// docs/specs/hand-ranges.md and docs/conventions/design-system.md carry no
// measured value for this distance — nothing in the design file to
// reproduce faithfully — so this is an implementer's own choice, not a
// design measurement, and stays unverified until a real touch on a real
// device confirms it actually clears a fingertip.
const CANDIDATE_LIFT = 28;

// `CardsPane`'s own `unavailableCards` default — a module-scope constant
// rather than an inline `[]` literal in the destructure below, so a caller
// that never passes this prop hands every render's worth of `FanArc`s the
// same empty array reference instead of a fresh one each time.
const EMPTY_UNAVAILABLE_CARDS: readonly Card[] = [];

/**
 * one active drag's own candidate: which suit's arc it is in, and the
 * index (within that arc, ascending rank) the drag currently resolves to.
 * `null` — no drag in progress — is the pane's own resting state.
 */
type ActiveDrag = { readonly suit: Suit; readonly index: number } | null;

/**
 * the fanned card picker both of this app's card input sheets are built
 * on: a row of preview slots above four fanned arcs of thirteen cards
 * each, one arc per suit. the hardest surface in either sheet — several
 * details below stay unverified until a real device confirms them.
 *
 * **it holds no copy of its own.** every string a slot announces arrives
 * through `slotAccessibilityLabel`/`emptySlotsAccessibilityLabel`, so a
 * component mounted by both a player's hole-card sheet and the board's own
 * carries neither one's wording — and reads no i18n namespace named for
 * either. the fan's own card faces are the exception, and not this
 * component's doing: `PlayingCard` reads its own labels itself.
 *
 * **how many slots there are, and what a slot means, both come from the
 * caller** — the slot count from `slots`' own length, and the rules over
 * it from `fillPolicy` (see `./selection.ts`'s `SlotFillPolicy`). two
 * unordered hole cards and five ordered, gap-free community cards are the
 * two the app has.
 *
 * **the fan paints on its first frame, alongside the preview slots** —
 * `computedFanWidth` above computes its content width synchronously, from
 * `@/shared/ui/bottom-sheet/bottom-sheet.tsx`'s own exported
 * `sheetContentWidth`, so `computeFanLayout` never waits a frame for
 * `onLayout` to measure it first. every term that call needs
 * (`useUnistyles()`'s `rt.screen`/`rt.insets`) is already read
 * synchronously by that component's own styles for the identical content
 * box this fan sits inside, so there is nothing left to measure. this
 * does couple this pane to the sheet's own geometry — both sit in
 * `shared/ui/`, so the import stays within one tier, which the import
 * direction allows (docs/conventions/directory-structure.md), and the
 * alternative (duplicating `sheetContentWidth`'s cap-and-inset formula
 * here) would silently drift the moment either copy changed, which is
 * worse than the coupling it avoids.
 *

 * `slots` is this component's whole controlled state; `focusedSlot` (which
 * slot the next pick lands in) isn't part of it and stays local,
 * component-owned state instead — focus is a transient UI mode with no
 * meaning to a caller beyond "the next pick replaces this slot," and
 * neither sheet's own close-time rule
 * (`resolveHoldingOutcome`/`resolveBoardOutcome`) reads which slot
 * currently has focus. every state transition — a fan tap, a drag's
 * release, or a slot tap — goes through `selection.ts`'s own pure rules;
 * this component owns turning a `Gesture.Pan()` per arc into calls against
 * that module, and rendering whatever it decides.
 */
export function CardsPane({
  slots,
  fillPolicy,
  initialFocusedSlot: requestedFocusedSlot,
  unavailableCards = EMPTY_UNAVAILABLE_CARDS,
  slotAccessibilityLabel,
  emptySlotsAccessibilityLabel,
  onSlotsChange,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  slots: CardsPaneSlots;
  /** which rule set governs fills, focus, and clears — see
   * `./selection.ts`'s `SlotFillPolicy`. */
  fillPolicy: SlotFillPolicy;
  /** the slot to focus on this pane's first render, clamped by
   * `fillPolicy`. read once, as a lazy initializer, so it seeds focus
   * without fighting the user's own taps afterwards; omitted, focus is
   * derived from `slots` instead (`./selection.ts`'s
   * `initialFocusedSlot`). */
  initialFocusedSlot?: number;
  /** the cards this pane's own caller has ruled out of reach — every card
   * already spoken for elsewhere, on the board or in another player's own
   * exact holding (`@/features/evaluations/model/unavailable-cards.ts`).
   * defaults to none, so a caller that never mounts against another
   * sheet's cards (today, none does) has nothing new to pass. distinct
   * from a card already sitting in *this* pane's own `slots` — see
   * `./selection.ts`'s own `isCardTaken`/`isCardUnavailable` doc
   * comments, and `FanCard`'s below for how the two render differently. */
  unavailableCards?: readonly Card[];
  /** one slot's spoken label, resolved by the caller rather than here —
   * a typed `t()` call can't be threaded through a plain-string prop
   * without losing the literal-key checking `react-i18next`'s generated
   * types give every call site, and the wording is the mounting sheet's
   * anyway (hole cards, or the board's community cards). */
  slotAccessibilityLabel: (slot: { index: number; card: Card | null; focused: boolean }) => string;
  /** the slots row's own summary, announced only while every slot is
   * empty — see the row's own comment below for why it can't collapse its
   * slots to say this. */
  emptySlotsAccessibilityLabel: string;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires with the whole
   * updated row of slots, whichever of `selection.ts`'s own
   * rules produced it (a fill, an overwrite, or a clear). */
  onSlotsChange: (slots: CardsPaneSlots) => void;
  testID?: string;
}) {
  const { rt } = useUnistyles();
  const reduceMotion = usePrefersReducedMotion();

  // lazy initializer — read once, on this component's first mount, per
  // `initialFocusedSlot`'s doc comment (`./selection.ts`) for why the
  // derived fallback isn't just `0`. focus never re-derives from `slots`
  // or from `requestedFocusedSlot` again after mount: it stays wherever
  // the user's last tap or pick left it while this component stays
  // mounted, not jumping around on every prop change. a sheet that needs
  // focus re-seeded per open gets it for free — `../bottom-sheet/`
  // renders through a portal that unmounts its whole subtree while
  // hidden, so reopening remounts this component.
  const [focusedSlot, setFocusedSlot] = useState<number>(() =>
    requestedFocusedSlot === undefined
      ? initialFocusedSlot(slots, fillPolicy)
      : clampFocusedSlot(slots, fillPolicy, requestedFocusedSlot),
  );

  // the focus ring's own travel across the slots — a single shared
  // element, not one owned by each slot (see
  // `styles.slots`/`styles.slotsInner` and this component's render body
  // below), so it can slide rather than teleport. its horizontal offset
  // is entirely static geometry — every slot is fixed-width and abuts a
  // fixed `PREVIEW_SLOT.gap`, so slot n always sits exactly `n *
  // FOCUS_RING_SLOT_PITCH` right of slot 0, regardless of how the row
  // itself is centred — seeded to the initially-focused slot's own
  // position so the very first render needs no animation to reach it.
  const ringTranslateX = useSharedValue(focusedSlot * FOCUS_RING_SLOT_PITCH);
  useEffect(() => {
    ringTranslateX.value = motionSpring(focusedSlot * FOCUS_RING_SLOT_PITCH, reduceMotion);
    // `ringTranslateX` is a stable shared-value ref — see
    // `../bottom-sheet/bottom-sheet.tsx`'s own reset
    // effect for the same reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSlot, reduceMotion]);
  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ringTranslateX.value }],
  }));

  // the fan's own content width, computed synchronously rather than
  // measured, so the fan paints on the same first frame as the preview
  // slots (see `handleFanLayout` and `fanLayout` below for the rest of
  // it). `sheetContentWidth` (`@/shared/ui/bottom-sheet/
  // bottom-sheet.tsx`) is the sheet's own geometry — its panel's cap, and
  // its side padding, inset-widened exactly as that component's own
  // styles apply it — read here from `useUnistyles()`'s `rt` on every
  // render, the same synchronous read `bottom-sheet.tsx`'s own
  // `StyleSheet.create` factory already makes for the identical box this
  // fan sits inside. `measuredFanWidth` is `onLayout`'s own correction,
  // not this component's primary source of truth — see
  // `handleFanLayout`'s doc comment for why it stays as a fallback rather
  // than being dropped outright.
  const computedFanWidth = sheetContentWidth(rt.screen.width, rt.insets.left, rt.insets.right);
  const [measuredFanWidth, setMeasuredFanWidth] = useState<number | null>(null);
  const fanWidth = measuredFanWidth ?? computedFanWidth;

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  // rebuilt fresh every render from `slots`/`focusedSlot`; passed down to
  // `FanArc` (for its `takenRankIndicesForSuit` read) and read locally
  // below, but never captured inside a `useCallback` closure — each
  // callback below reconstructs its own copy from the same two
  // dependencies it already lists, so nothing here depends on this
  // object's identity surviving between renders.
  const state: CardsPaneState = { slots, focusedSlot };

  const applySelectCard = useCallback(
    (card: Card) => {
      const result = selectCard({ slots, focusedSlot }, card, fillPolicy, unavailableCards);
      if (result.state.slots !== slots) {
        onSlotsChange(result.state.slots);
      }
      setFocusedSlot(result.state.focusedSlot);
      if (result.haptic !== null) {
        triggerHaptic(result.haptic);
      }
    },
    [slots, focusedSlot, fillPolicy, unavailableCards, onSlotsChange],
  );

  const handleSlotPress = useCallback(
    (slotIndex: number) => {
      const result = tapSlot({ slots, focusedSlot }, slotIndex, fillPolicy);
      if (result.state.slots !== slots) {
        onSlotsChange(result.state.slots);
      }
      setFocusedSlot(result.state.focusedSlot);
      if (result.haptic !== null) {
        triggerHaptic(result.haptic);
      }
    },
    [slots, focusedSlot, fillPolicy, onSlotsChange],
  );

  // a correction, not this component's primary measurement:
  // `computedFanWidth` above already matches what this measurement
  // reports (verified in `cards-pane.test.tsx` and `card-fan-geometry.
  // test.ts` against `bottom-sheet.tsx`'s own panel styles, the same
  // formula this shares rather than duplicates) — kept rather than
  // dropped because Jest's react-native-unistyles mock reports a fixed
  // `rt.screen.width` of `0` (see `.test.tsx`'s own layout-fire helper),
  // which leaves no way for a test to drive `computedFanWidth` to a
  // useful value; a real device never disagrees with the computed width,
  // so this only ever fires once, matching, and skips the update either
  // way — `setMeasuredFanWidth`'s own guard below.
  const handleFanLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setMeasuredFanWidth((current) => (current === width ? current : width));
  }, []);

  const fanLayout = computeFanLayout(fanWidth);
  const totalFanHeight = FAN_ARC.pitch * fanLayout.scale * 3 + fanLayout.frameHeight;

  // drives the slots row's own summary label — see that `View`'s own
  // comment below for why the label lives on `accessibilityRole` +
  // `accessibilityLabel` rather than `accessible` + `accessibilityLabel`.
  const allSlotsEmpty = slots.every((slot) => slot === null);

  return (
    // `style` merged last, after this component's `styles.root`, so a
    // caller extending it doesn't wipe the slots-to-fan `gap` layout below
    // depends on; every other rest prop spreads after `testID`, same
    // ordering `SegmentedTabs` uses.
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View
        style={styles.slots}
        // announces the summary only while every slot is empty — this
        // can't be `accessible` + `accessibilityLabel`: `accessible={true}`
        // collapses every descendant accessibility element into this one,
        // which would swallow each `PreviewSlot`'s own per-slot label
        // below. `accessibilityRole` carries no such collapsing behaviour
        // in React Native's own docs — only `accessible` does — so this
        // row exposes the summary through `accessibilityRole="summary"` +
        // `accessibilityLabel` instead, with no `accessible` prop of its
        // own, leaving each `PreviewSlot` (already its own accessible
        // `Pressable`) independently reachable.
        accessibilityRole={allSlotsEmpty ? 'summary' : undefined}
        accessibilityLabel={allSlotsEmpty ? emptySlotsAccessibilityLabel : undefined}
        testID={testID ? 'slots' : undefined}
      >
        <View style={styles.slotsInner}>
          {slots.map((card, slotIndex) => {
            const focused = focusedSlot === slotIndex;

            return (
              <PreviewSlot
                key={slotIndex}
                slotIndex={slotIndex}
                card={card}
                focused={focused}
                onPress={handleSlotPress}
                accessibilityLabel={slotAccessibilityLabel({ index: slotIndex, card, focused })}
                testID={testID ? `slot-${slotIndex}` : undefined}
              />
            );
          })}
          {
            // the focus ring: one shared, always-mounted element — see
            // this component's own `ringTranslateX` comment above for why
            // it lives here, anchored to slot 0's own position, rather
            // than inside any one `PreviewSlot`.
            <Animated.View
              style={[styles.focusRing, animatedRingStyle]}
              pointerEvents="none"
              testID={testID ? 'ring' : undefined}
            />
          }
        </View>
      </View>
      <View
        style={[styles.fan, { height: totalFanHeight }]}
        onLayout={handleFanLayout}
        testID={testID ? 'fan' : undefined}
      >
        {
          // `fanLayout` is never `null` — `computeFanLayout` runs
          // synchronously off `computedFanWidth` above, on this
          // component's very first render, rather than waiting for
          // `onLayout` — see this file's own doc comment for why.
          // `position`/`top`/`left`/`width`/`height` are this arc's whole
          // placement, computed or declared here and handed down through
          // `FanArc`'s own `style` prop — `FanArc` computes none of its
          // own root position, positioning mode included, per
          // docs/conventions/component-styling.md's first rule (see that
          // component's own doc comment for the rest of it): `position:
          // 'absolute'` is what lets `top`/`left`/`width`/`height` below
          // mean anything at all, so it belongs alongside them here rather
          // than baked into `FanArc`'s own stylesheet. `top` and `left`
          // are computed from `fanLayout` and this arc's own index within
          // `SUITS` — `left` specifically comes from `fanLayout.offsetX`:
          // `../card-fan-geometry.ts`'s `computeFanLayout` picks it per
          // render so the ink span sits exactly 16px from the sheet's own
          // outer edge, usually placing the frame's own origin slightly
          // outside this box (see that function's own doc comment).
          SUITS.map((suit, suitIndex) => (
            <FanArc
              key={suit}
              suit={suit}
              layout={fanLayout}
              state={state}
              unavailableCards={unavailableCards}
              activeDrag={activeDrag}
              onActiveDragChange={setActiveDrag}
              onSelectCard={applySelectCard}
              reduceMotion={reduceMotion}
              style={{
                position: 'absolute',
                top: FAN_ARC.pitch * fanLayout.scale * suitIndex,
                left: fanLayout.offsetX,
                width: fanLayout.frameWidth,
                height: fanLayout.frameHeight,
              }}
              testID={testID ? `arc-${suit}` : undefined}
            />
          ))
        }
      </View>
    </View>
  );
}

type PreviewSlotProps = {
  slotIndex: number;
  card: Card | null;
  focused: boolean;
  onPress: (slotIndex: number) => void;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * one preview slot above the fan. empty: a dashed border, matching
 * `Board`'s own empty board slots exactly (same radius, same border
 * colour) — this one picker feeds both a player's hole cards and the
 * board's community cards, so the two are drawn alike deliberately.
 * filled: a `PlayingCard` at the preview size — a card landing here fades
 * its own fill and border in from the empty slot's own look
 * (`PlayingCard`'s `animateEntrance` prop; see that component's own doc
 * comment for why the transition lives there rather than on a separate box
 * behind it). every slot is always
 * pressable, empty or filled: under the focus model (`./selection.ts`),
 * tapping a slot always resolves to something — a tap away from focus
 * moves focus, and a tap on the focused slot clears it (or is a no-op
 * only when it's already empty). its accessibility label is resolved by
 * its caller (`CardsPane` above), not here.
 *
 * **renders no focus ring of its own.** the ring travels across the slots
 * rather than mounting fresh on whichever slot holds focus —
 * `CardsPane`'s own render body renders it once, as a sibling of every
 * `PreviewSlot`, and animates its position instead, so there is only ever
 * one ring element in the tree — nothing for a shared stylesheet variant
 * to clobber between instances.
 *
 * **plain conditional styles, not Unistyles `variants`.** `styles`
 * (below) is this whole file's one `StyleSheet.create` result, shared by
 * every `PreviewSlot` instance `CardsPane` renders — `styles.slot` stays
 * static, and the empty/filled state below is a plain conditional style
 * rather than a variant, for the same reason the paragraph above gives.
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
      {card !== null ? (
        <PlayingCard
          card={card}
          variant="stacked"
          style={{ width: PREVIEW_SLOT.width, height: PREVIEW_SLOT.height }}
          animateEntrance
        />
      ) : null}
    </Pressable>
  );
}

/**
 * everything one arc's gesture callbacks need that can change between the
 * gesture's build and an actual touch arriving — read through a ref,
 * never captured by value, for exactly the reason
 * `../selection-grid/selection-grid.tsx`'s own
 * `GestureContext` is: `pan` below is built once (`useMemo`), and this
 * component's `onActiveDragChange` call, on every `dragTick`, would
 * otherwise re-render this component and rebuild `pan` mid-drag — tearing
 * down and reattaching the native handler underneath an active touch.
 */
type FanArcGestureContext = {
  suit: Suit;
  layout: FanLayout;
  /** `takenIndices` and `unavailableIndices` (`./selection.ts`'s
   * `takenRankIndicesForSuit`/`unavailableRankIndicesForSuit`) unioned
   * together — every index a drag in this arc must skip, regardless of
   * which of the two rules put it out of reach. the union exists only for
   * this gesture-resolution path; `FanArc`'s own render body below reads
   * the two sets separately, since `taken` and `unavailable` stay distinct
   * rendered states. */
  skipIndices: ReadonlySet<number>;
  onActiveDragChange: (drag: ActiveDrag) => void;
  onSelectCard: (card: Card) => void;
};

/**
 * one suit's own thirteen-card arc — its own `Gesture.Pan()`, bounded to
 * this arc's frame, so touching and panning horizontally within one arc
 * resolves against this arc's cards alone, never a neighbouring suit's.
 *
 * a touch's x, resolved through `nearestSelectableCardIndex`, decides the
 * candidate — skipping any card already taken in any slot,
 * `./selection.ts`'s `takenRankIndicesForSuit`. the candidate is silent on
 * `onBegin` (a plain tap, which never moves, resolves entirely through
 * `onEnd` below) and fires `dragTick` on every further crossing
 * `onUpdate` finds — the same "silent first touch, a haptic on each
 * further crossing" shape `../selection-grid/selection-grid.tsx`'s own
 * paint gesture uses, adapted to a fan whose
 * selection commits on release rather than on touch-down.
 *
 * **its root child element is the `View` inside `GestureDetector`, not
 * `GestureDetector` itself** — the same case
 * docs/conventions/component-contracts.md names and
 * `../selection-grid/selection-grid.tsx`'s own matching comment explains:
 * `GestureDetector` renders no native view of its own and accepts no rest
 * props to receive them, so `ComponentProps<typeof View>` below, and the
 * rest spread onto that same `View`, both target the element a caller
 * actually sees.
 *
 * **carries no placement of its own — not even its own positioning
 * mode.** `position`/`top`/`left`/`width`/`height`, derived from `layout`
 * and this arc's own index within `SUITS`, are computed at `CardsPane`'s
 * own `SUITS.map` call site above and handed down through this
 * component's `style` prop, per docs/conventions/component-styling.md's
 * first rule — this file's stylesheet holds no `styles.arc` key for them.
 * `layout` itself stays a required prop regardless — `layout.cards` and
 * `layout.scale` below still read it, and so does every gesture callback's
 * own `nearestSelectableCardIndex` call, which resolves a touch against
 * the whole object, not just the five values `style` derives from it.
 */
function FanArc({
  suit,
  layout,
  state,
  unavailableCards,
  activeDrag,
  onActiveDragChange,
  onSelectCard,
  reduceMotion,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  suit: Suit;
  layout: FanLayout;
  state: CardsPaneState;
  unavailableCards: readonly Card[];
  activeDrag: ActiveDrag;
  onActiveDragChange: (drag: ActiveDrag) => void;
  onSelectCard: (card: Card) => void;
  reduceMotion: boolean;
}) {
  const takenIndices = takenRankIndicesForSuit(state, suit);
  const unavailableIndices = unavailableRankIndicesForSuit(unavailableCards, suit);
  // every index a drag in this arc must skip — see
  // `FanArcGestureContext`'s own `skipIndices` doc comment for why the two
  // sets stay separate everywhere but here.
  const skipIndices = new Set([...takenIndices, ...unavailableIndices]);

  const contextRef = useRef<FanArcGestureContext>({
    suit,
    layout,
    skipIndices,
    onActiveDragChange,
    onSelectCard,
  });
  // see `FanArcGestureContext`'s own doc comment for why this is a
  // layout effect, not a write during render — the same reasoning
  // `selection-grid.tsx`'s own matching effect gives.
  useLayoutEffect(() => {
    contextRef.current = { suit, layout, skipIndices, onActiveDragChange, onSelectCard };
  });

  // the drag's own last-known candidate index, compared against on every
  // `onUpdate` crossing so a `dragTick` fires only when it actually
  // changes — not read from `activeDrag` (this component's prop), which
  // lags a frame behind the gesture's own JS-thread callbacks the same
  // way `selection-grid.tsx`'s `lastCellIndexRef` does.
  const lastIndexRef = useRef<number | null>(null);

  // built once, not on every render — see `FanArcGestureContext`'s own
  // doc comment above for why rebuilding this mid-drag would be wrong.
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      // eslint-disable-next-line react-hooks/refs -- see `selection-grid.tsx`'s own matching suppression: reading `contextRef.current` fresh at call time is this file's whole reason for the ref.
      .onBegin((event) => {
        const { suit, layout, skipIndices, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, skipIndices);
        lastIndexRef.current = index;
        onActiveDragChange(index !== null ? { suit, index } : null);
      })
      // eslint-disable-next-line react-hooks/refs
      .onUpdate((event) => {
        const { suit, layout, skipIndices, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, skipIndices);
        if (index === null || index === lastIndexRef.current) {
          return;
        }
        lastIndexRef.current = index;
        triggerHaptic(HapticEvent.DragTick);
        onActiveDragChange({ suit, index });
      })
      // eslint-disable-next-line react-hooks/refs
      .onEnd((event) => {
        const { suit, layout, skipIndices, onSelectCard, onActiveDragChange } = contextRef.current;
        const index = nearestSelectableCardIndex(event.x, layout, skipIndices);
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
      {/* `style` — this arc's whole placement, positioning mode included,
       * per `CardsPane`'s own `SUITS.map` call site above and
       * docs/conventions/component-styling.md's first rule — is applied
       * directly, with no stylesheet key of this component's own to merge
       * it onto: this file's stylesheet holds no `styles.arc` key;
       * `position: 'absolute'` arrives through this same `style` prop
       * alongside `top`/`left`/`width`/`height`. every other rest prop
       * spreads after `testID`, same default ordering `CardsPane`'s own
       * root `View` uses — nothing about this component's own explicit
       * props here is load-bearing wiring a caller-supplied override
       * would break. */}
      <View style={style} testID={testID} {...props}>
        {layout.cards.map((cardLayout, index) => {
          const card: Card = { rank: RANKS[index], suit };
          const taken = takenIndices.has(index);
          // `taken` wins when a card is somehow both — the plan's own
          // rule: it is unpickable either way, but the two stay distinct
          // *rendered* states, so `unavailable` here is deliberately
          // `false` whenever `taken` already is `true`, never the other
          // way round.
          const unavailable = !taken && unavailableIndices.has(index);
          const isCandidate =
            !taken &&
            !unavailable &&
            activeDrag !== null &&
            activeDrag.suit === suit &&
            activeDrag.index === index;

          return (
            <FanCard
              key={index}
              card={card}
              cardLayout={cardLayout}
              scale={layout.scale}
              taken={taken}
              unavailable={unavailable}
              isCandidate={isCandidate}
              reduceMotion={reduceMotion}
              style={{
                // `position: 'absolute'` travels with `left`/`top` — this
                // card's whole placement, per
                // docs/conventions/component-styling.md's first rule —
                // rather than living on `FanCard`'s own stylesheet.
                position: 'absolute',
                left: cardLayout.centerX - cardLayout.width / 2,
                top: cardLayout.centerY - cardLayout.height / 2,
              }}
            />
          );
        })}
      </View>
    </GestureDetector>
  );
}

/**
 * one card in a `FanArc`'s thirteen-card fan. its own
 * `useSharedValue` is what forces this out of `FanArc`'s `.map` into a
 * component of its own — a hook cannot be called inside a loop, and each
 * of the fifty-two cards across the four arcs needs an animated lift
 * independent of every other's.
 *
 * **`translateY`, not `top`.** `top` still places the card at its resting
 * arc position, exactly as `FanArc`'s own `computeFanLayout` derives it —
 * it arrives, alongside `position: 'absolute'`, through this card's own
 * `style` prop, computed at `FanArc`'s `.map` call site from `cardLayout`
 * rather than inline here (docs/conventions/component-styling.md's first
 * rule), which changes nothing about what follows. the lift moves *out* of
 * that layout value and into the transform instead — `[{ translateY:
 * -lift.value }, { rotate }]`, ahead of the rotation — so the card travels
 * straight up rather than along its own rotated axis (`rotate` first would
 * do that), and the animation never touches layout.
 *
 * **`zIndex` is a plain, non-animated style, derived from identity, never
 * from `lift.value`.** `isCandidate` flips synchronously with the pan's
 * own JS-thread state (`CardsPane`'s `activeDrag`), so the card currently
 * under the finger draws above everything the instant it becomes the
 * candidate, regardless of how far its lift has actually animated —
 * deriving `zIndex` from the lift instead would put the rising card
 * *below* the falling one for the first half of every transition, exactly
 * what deriving it from identity instead avoids. `elevated` is this card's own
 * record of "still elevated because it was just replaced as the
 * candidate": it goes `true` the moment `isCandidate` does (below), and
 * back to `false` once this card's own `lift` is at rest at `0` — a level
 * check on `lift.value` read fresh on the UI thread every time
 * `useAnimatedReaction`'s mapper runs, not a check for a transition into
 * `0` from some previously-observed nonzero value. A transition check can
 * miss: if this card's candidacy flips on and off before the UI thread
 * ever samples a nonzero `lift.value` for it — plausible during a fast
 * sweep, and more likely still under reduce-motion, where the effect
 * below assigns `lift.value` straight to its target with no intermediate
 * frames to sample at all — the reaction never observes an intermediate
 * nonzero sample to transition away from, and `elevated` would be
 * stranded `true` forever.
 * Reading the level instead has no such gap: whatever frame the mapper
 * happens to run on, `lift.value === 0` is either true or it isn't,
 * independent of what came before. `runOnJS` is what reports that back to
 * this card's own JS-thread state with a single call rather than a
 * JS-thread render on every frame of the descent.
 */
function FanCard({
  card,
  cardLayout,
  scale,
  taken,
  unavailable,
  isCandidate,
  reduceMotion,
  style,
  ...props
}: ComponentProps<typeof Animated.View> & {
  card: Card;
  cardLayout: FanCardLayout;
  scale: number;
  taken: boolean;
  /** true once this card is spoken for elsewhere — the board, or another
   * player's own exact holding — rather than sitting in *this* pane's own
   * `slots`. `FanArc`'s own render body above already keeps this and
   * `taken` mutually exclusive (`taken` wins when a card is somehow both),
   * so this card never receives both `true` at once; forwarded to
   * `PlayingCard`'s own `unavailable` prop unchanged. */
  unavailable: boolean;
  /** whether a pan in this card's own arc currently resolves to it — see
   * `FanArc`'s own `isCandidate` derivation above, which already excludes
   * a taken or an unavailable card. */
  isCandidate: boolean;
  reduceMotion: boolean;
}) {
  const lift = useSharedValue(0);
  const [elevated, setElevated] = useState(isCandidate);

  // raising `elevated` the instant `isCandidate` goes true is a render-phase
  // state adjustment, not a `useEffect` one — React's own supported pattern
  // for deriving state from a prop change mid-render (see "Adjusting some
  // state when a prop changes" at https://react.dev/learn/you-might-not-need-an-effect):
  // a second state slot remembers the previous render's `isCandidate`, and
  // `setElevated` is called directly in the render body when it changes,
  // rather than from a `useEffect`, which would cost this card an extra,
  // avoidable render for a value already known synchronously.
  const [wasCandidate, setWasCandidate] = useState(isCandidate);
  if (isCandidate !== wasCandidate) {
    setWasCandidate(isCandidate);
    if (isCandidate) {
      setElevated(true);
    }
  }

  useEffect(() => {
    lift.value = motionQuick(isCandidate ? CANDIDATE_LIFT : 0, reduceMotion);
    // `lift` is a stable shared-value ref — see `CardsPane`'s own
    // `ringTranslateX` effect for the same reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCandidate, reduceMotion]);

  useAnimatedReaction(
    () => lift.value === 0,
    (isAtRest) => {
      if (!isCandidate && isAtRest) {
        runOnJS(setElevated)(false);
      }
    },
    [isCandidate],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value }, { rotate: `${cardLayout.rotation}deg` }],
  }));

  return (
    // the rest spread goes before this component's own explicit
    // `pointerEvents` here, the opposite order from this file's default
    // (see `CardsPane`'s own root `View` comment above for that default,
    // and `SelectionGrid`'s own matching `onLayout` comment in
    // `../selection-grid/selection-grid.tsx` for the same reasoning) —
    // `pointerEvents="none"` below is load-bearing wiring this card's own
    // hit-testing depends on, not a mere default a caller may reasonably
    // replace: the arc's own `Gesture.Pan()` (`FanArc` above) only
    // receives the touch because each card declines it, and a
    // caller-supplied `pointerEvents` silently replacing it through the
    // rest spread would break the fan's hit-testing from the outside.
    // `style` is still pulled out and merged last, after this card's own
    // `zIndex`/`animatedStyle`, so a caller extending it doesn't wipe
    // either — `position`/`left`/`top` live neither inline here nor on any
    // stylesheet key of this card's own; `FanArc`'s own `.map` call site
    // computes all three from `cardLayout` and hands them down as this
    // same `style` prop's own value (per
    // docs/conventions/component-styling.md's first rule), so they still
    // land in this exact merge slot, just supplied by the caller instead
    // of hardcoded below.
    <Animated.View
      {...props}
      style={[
        {
          // not placement this card's caller could take over, unlike
          // `position`/`left`/`top` above (arriving through this same
          // `style` prop from `FanArc`'s `.map`): `zIndex` is derived from
          // `isCandidate` (a prop) and `elevated` — this card's own
          // record of "still elevated because it was just replaced as
          // the candidate," driven by its own `useAnimatedReaction` on
          // its own `lift` shared value (see this function's own doc
          // comment above for why). the caller has no access to
          // `elevated` and cannot compute this value itself.
          zIndex: isCandidate ? 2 : elevated ? 1 : 0,
        },
        animatedStyle,
        style,
      ]}
      // required so a touch reaches the arc's own `Gesture.Pan()` above
      // rather than this card — but it also removes this card's
      // accessible element from hit-testing entirely, across all
      // fifty-two cards in the fan; see docs/specs/hand-ranges.md's
      // "Known accessibility gap in the fan" for the residual risk this
      // leaves unfixed.
      pointerEvents="none"
    >
      <PlayingCard
        card={card}
        variant="corner"
        style={{ width: FAN_CARD.width * scale, height: FAN_CARD.height * scale }}
        selected={taken}
        unavailable={unavailable}
      />
    </Animated.View>
  );
}

// the "slots to fan" gap, one of the sheet's four uniform 40-apart
// landmark gaps (see `HoldingInputSheet`'s own `LANDMARK_GAP`) — not
// one of `theme.space`'s steps (`x32`, `x48`), so it stays this pane's own
// named constant rather than reaching for a step that doesn't match.
const SLOTS_TO_FAN_GAP = 40;
// the focus ring's clearance outside the slot's edge, and its border
// width (`theme.borderWidth.thick`) — see
// [decisions/2026-09-05-set-the-focus-rings-clearance-to-6.md](../../../../docs/decisions/2026-09-05-set-the-focus-rings-clearance-to-6.md)
// for why 6.
export const FOCUS_RING_OFFSET = 6;
// the fixed horizontal distance from one slot's own left edge to the next
// slot's — every slot is `PREVIEW_SLOT.width` wide, `PREVIEW_SLOT.gap`
// apart, in a row with no other spacing between them, so this is exact
// geometry, not a measurement. `CardsPane`'s own `ringTranslateX`
// multiplies it by the focused slot's index to place the shared focus
// ring, which holds for two slots and for five alike.
const FOCUS_RING_SLOT_PITCH = PREVIEW_SLOT.width + PREVIEW_SLOT.gap;

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: SLOTS_TO_FAN_GAP,
  },
  // centres `slotsInner` (below) within this component's own width — kept
  // apart from it so `slotsInner`'s own width stays the slots' exact
  // combined size, the fixed geometry `focusRing` below's travel depends
  // on (`CardsPane`'s own `ringTranslateX` comment).
  slots: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  // the slots plus the gaps between them, and nothing else — `position:
  // 'relative'` anchors `focusRing` below against this box, at the fixed
  // offset slot 0 always sits at within it (slot 0 is this row's first
  // child, so that offset is `(0, 0)` before any transform).
  slotsInner: {
    flexDirection: 'row',
    gap: PREVIEW_SLOT.gap,
    position: 'relative',
  },
  // static — no `variants` here; see `PreviewSlot`'s doc comment for why a
  // variant on this shared stylesheet is what let one slot's focused/filled
  // state leak onto the other.
  slot: {
    width: PREVIEW_SLOT.width,
    height: PREVIEW_SLOT.height,
    borderRadius: PREVIEW_SLOT.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // an empty slot draws its own dashed border, matching `Board`'s own empty
  // board slots exactly; a filled slot draws none of its own — `PlayingCard`
  // already draws its own border — so `PreviewSlot` only ever merges this in
  // when there is no card to draw one itself.
  slotEmpty: {
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
  // the focus ring: one shared element now, a sibling of every slot inside
  // `slotsInner` rather than nested inside whichever one holds focus — see
  // `PreviewSlot`'s doc comment for why, and `CardsPane`'s own
  // `ringTranslateX` for how it travels. an explicit `width`/`height`
  // rather than `right`/`bottom` insets, since this box's own parent is no
  // longer sized to match a single slot the way `slot` above is.
  focusRing: {
    position: 'absolute',
    top: -FOCUS_RING_OFFSET,
    left: -FOCUS_RING_OFFSET,
    width: PREVIEW_SLOT.width + FOCUS_RING_OFFSET * 2,
    height: PREVIEW_SLOT.height + FOCUS_RING_OFFSET * 2,
    borderWidth: theme.borderWidth.thick,
    borderRadius: PREVIEW_SLOT.radius + FOCUS_RING_OFFSET,
    borderColor: theme.colors.solid.accent.rest,
  },
  fan: {
    width: '100%',
  },
}));
