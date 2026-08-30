import type { ComponentProps } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  PREVIEW_SLOT,
  type FanCardLayout,
  type FanLayout,
} from '@/shared/ui/card-fan-geometry';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { PlayingCard } from '@/shared/ui/playing-card/playing-card';

import {
  initialFocusedSlot,
  selectCard,
  takenRankIndicesForSuit,
  tapSlot,
  type CardsPaneState,
} from './selection';

export type CardsPaneSlots = readonly [Card | null, Card | null];

// the vertical clearance a drag's candidate card lifts above its resting
// position in the arc, so it's visible past the fingertip.
// docs/specs/hand-ranges.md and docs/conventions/design-system.md carry no
// measured value for this distance — nothing in the design file to
// reproduce faithfully — so this is an implementer's own choice, not a
// design measurement, and stays unverified until a real touch on a real
// device confirms it actually clears a fingertip.
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
 * arc per suit. the hardest surface in that sheet — several details
 * below stay unverified until a real device confirms them.
 *
 * **the fan paints on the first frame now, alongside the preview
 * slots** (PR #70) — it used to wait a frame for `onLayout` to measure
 * its own width before `computeFanLayout` could resolve anything, which
 * read as sluggish next to the preview slots' fixed 48×75 size painting
 * immediately. `computedFanWidth` above computes that same width
 * synchronously instead, from `@/shared/ui/bottom-sheet/bottom-sheet.tsx`'s
 * own exported `sheetContentWidth` — every term it needs
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
 * `resolveHoldingOutcome` reads only the resolved `holeCards`, never which
 * slot currently has focus. every state transition — a fan tap, a drag's
 * release, or a slot tap — goes through `selection.ts`'s own pure rules;
 * this component owns turning a `Gesture.Pan()` per arc into calls against
 * that module, and rendering whatever it decides.
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
   * updated pair of slots, whichever of `selection.ts`'s own
   * rules produced it (a fill, an overwrite, or a clear). */
  onSlotsChange: (slots: CardsPaneSlots) => void;
  testID?: string;
}) {
  const { t } = useTranslation('handRanges');
  const { rt } = useUnistyles();
  const reduceMotion = usePrefersReducedMotion();

  // lazy initializer — read once, on this component's first mount, per
  // `initialFocusedSlot`'s doc comment (`./selection.ts`) for why it
  // derives from `slots` rather than always starting at `0`. focus never
  // re-derives from `slots` again after mount: it stays wherever the
  // user's last tap or pick left it while this component stays mounted,
  // not jumping around on every prop change.
  const [focusedSlot, setFocusedSlot] = useState<0 | 1>(() => initialFocusedSlot(slots));

  // the focus ring's own travel between the two slots (PR #70's motion
  // system) — a single shared element, not one owned by each slot (see
  // `styles.slots`/`styles.slotsInner` and this component's render body
  // below), so it can slide rather than teleport. its horizontal offset
  // is entirely static geometry — both slots are fixed-width and abut a
  // fixed `PREVIEW_SLOT.gap`, so slot 1 always sits exactly
  // `FOCUS_RING_SLOT_GAP` right of slot 0, regardless of how the row
  // itself is centred — seeded to the initially-focused slot's own
  // position so the very first render needs no animation to reach it.
  const ringTranslateX = useSharedValue(focusedSlot === 1 ? FOCUS_RING_SLOT_GAP : 0);
  useEffect(() => {
    ringTranslateX.value = motionSpring(focusedSlot === 1 ? FOCUS_RING_SLOT_GAP : 0, reduceMotion);
    // `ringTranslateX` is a stable shared-value ref — see
    // `../bottom-sheet/bottom-sheet.tsx`'s own reset
    // effect for the same reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSlot, reduceMotion]);
  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ringTranslateX.value }],
  }));

  // the fan's own content width, computed synchronously rather than
  // measured — PR #70's fix for the fan painting one frame after the
  // preview slots (see `handleFanLayout` and `fanLayout` below for the
  // rest of it). `sheetContentWidth` (`@/shared/ui/bottom-sheet/
  // bottom-sheet.tsx`) is the sheet's own geometry — its panel's cap, and
  // its side padding, inset-widened exactly as that component's own
  // styles apply it — read here from `useUnistyles()`'s `rt` on every
  // render, the same synchronous read `bottom-sheet.tsx`'s own
  // `StyleSheet.create` factory already makes for the identical box this
  // fan sits inside. `measuredFanWidth` is `onLayout`'s own correction,
  // not this component's primary source of truth any more — see
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

  // a correction, not this component's primary measurement any more:
  // `computedFanWidth` above already matches what this measurement
  // reports (verified in `cards-pane.test.tsx` and `card-fan-geometry.
  // test.ts` against `bottom-sheet.tsx`'s own panel styles, the same
  // formula this now shares rather than duplicates) — kept rather than
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
  const bothEmpty = slots[0] === null && slots[1] === null;

  return (
    // `style` merged last, after this component's `styles.root`, so a
    // caller extending it doesn't wipe the slots-to-fan `gap` layout below
    // depends on; every other rest prop spreads after `testID`, same
    // ordering `SegmentedTabs` uses.
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View
        style={styles.slots}
        // announces the summary only while both slots are empty — see this
        // component's own `bothEmpty` comment below for why this can't be
        // `accessible` + `accessibilityLabel` the way `Board`'s single
        // label is: `accessible={true}` collapses
        // every descendant accessibility element into this one, which
        // would swallow both `PreviewSlot`s' own per-slot labels below —
        // exactly the outcome `bothSlotsEmptyAccessibilityLabel`'s own
        // i18n comment (`src/core/i18n/resources/en.ts`) warns against.
        // `accessibilityRole` carries no such collapsing behaviour in
        // React Native's own docs — only `accessible` does — so this row
        // exposes the summary through `accessibilityRole="summary"` +
        // `accessibilityLabel` instead, with no `accessible` prop of its
        // own, leaving each `PreviewSlot` (already its own accessible
        // `Pressable`) independently reachable.
        accessibilityRole={bothEmpty ? 'summary' : undefined}
        accessibilityLabel={bothEmpty ? t('cards.bothSlotsEmptyAccessibilityLabel') : undefined}
        testID={testID ? 'slots' : undefined}
      >
        <View style={styles.slotsInner}>
          {([0, 1] as const).map((slotIndex) => {
            const card = slots[slotIndex];
            const focused = focusedSlot === slotIndex;
            const spokenIndex = slotIndex + 1;
            const slotName = t(slotIndex === 0 ? 'cards.slotName.left' : 'cards.slotName.right');
            const accessibilityLabel =
              card === null
                ? t('cards.emptySlotAccessibilityLabel', { slot: slotName })
                : focused
                  ? t('cards.focusedSlotAccessibilityLabel', {
                      slot: slotName,
                      card: cardSpokenName(card, t),
                    })
                  : t('cards.filledSlotAccessibilityLabel', {
                      index: spokenIndex,
                      card: cardSpokenName(card, t),
                    });

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
          {
            // the focus ring: one shared, always-mounted element (PR #70's
            // motion system) — see this component's own `ringTranslateX`
            // comment above for why it lives here, anchored to slot 0's
            // own position, rather than inside either `PreviewSlot`.
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
          // `fanLayout` is never `null` now — `computeFanLayout` runs
          // synchronously off `computedFanWidth` above, on this
          // component's very first render, rather than waiting for
          // `onLayout` — see this file's own doc comment for why.
          SUITS.map((suit, suitIndex) => (
            <FanArc
              key={suit}
              suit={suit}
              suitIndex={suitIndex}
              layout={fanLayout}
              state={state}
              activeDrag={activeDrag}
              onActiveDragChange={setActiveDrag}
              onSelectCard={applySelectCard}
              reduceMotion={reduceMotion}
              testID={testID ? `arc-${suit}` : undefined}
            />
          ))
        }
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
 * matching `Board`'s own empty board slots exactly (same radius, same border
 * colour) — docs/specs/hand-ranges.md's card picker feeds both this sheet's
 * hole cards and, eventually, that same board's community-card slots from
 * one picker, so the two are drawn alike deliberately. filled: a
 * `PlayingCard` at the preview size — a card landing here fades its own fill
 * and border in from the empty slot's own look (`PlayingCard`'s
 * `animateEntrance` prop, PR #70's motion system; see that component's own
 * doc comment for why the transition lives there rather than on a separate
 * box behind it). every slot is always pressable, empty or filled: under the
 * focus model (`./selection.ts`), tapping *either* slot always does
 * something — the other slot's tap moves focus there, and the focused slot's
 * tap clears it (or is a no-op only when it's already empty). its
 * accessibility label is resolved by its caller (`CardsPane` above), not
 * here — a typed `t()` call can't be threaded through a plain-string prop
 * without losing the literal-key checking `react-i18next`'s generated types
 * give every other call site in this file.
 *
 * **renders no focus ring of its own any more.** the ring travels between
 * the two slots now (PR #70's motion system) rather than mounting fresh
 * on whichever slot holds focus — `CardsPane`'s own render body renders
 * it once, as a sibling of both `PreviewSlot`s, and animates its position
 * instead. this component's own doc comment used to explain a real-device
 * bug where a `styles.useVariants` call one instance made clobbered the
 * other's — moving the ring out of this component entirely removes that
 * failure mode along with the ring itself, rather than merely working
 * around it: there is only ever one ring element in the tree to clobber.
 *
 * **plain conditional styles, not Unistyles `variants`.** `styles`
 * (below) is this whole file's one `StyleSheet.create` result, shared by
 * both `PreviewSlot` instances `CardsPane` renders — `styles.slot` stays
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
      {card !== null ? <PlayingCard card={card} size="preview" scale={1} animateEntrance /> : null}
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
  reduceMotion: boolean;
  testID?: string;
};

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
  takenIndices: ReadonlySet<number>;
  onActiveDragChange: (drag: ActiveDrag) => void;
  onSelectCard: (card: Card) => void;
};

/**
 * one suit's own thirteen-card arc — its own `Gesture.Pan()`, bounded to
 * this arc's frame, so touching and panning horizontally within one arc
 * resolves against this arc's cards alone, never a neighbouring suit's.
 *
 * a touch's x, resolved through `nearestSelectableCardIndex`, decides the
 * candidate — skipping any card already taken in either slot,
 * `./selection.ts`'s `takenRankIndicesForSuit`. the candidate is silent on
 * `onBegin` (a plain tap, which never moves, resolves entirely through
 * `onEnd` below) and fires `dragTick` on every further crossing
 * `onUpdate` finds — the same "silent first touch, a haptic on each
 * further crossing" shape `../selection-grid/selection-grid.tsx`'s own
 * paint gesture uses, adapted to a fan whose
 * selection commits on release rather than on touch-down.
 */
function FanArc({
  suit,
  suitIndex,
  layout,
  state,
  activeDrag,
  onActiveDragChange,
  onSelectCard,
  reduceMotion,
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
            left: layout.offsetX,
            width: layout.frameWidth,
            height: layout.frameHeight,
          },
        ]}
        testID={testID}
      >
        {layout.cards.map((cardLayout, index) => {
          const card: Card = { rank: RANKS[index], suit };
          const taken = takenIndices.has(index);
          const isCandidate =
            !taken && activeDrag !== null && activeDrag.suit === suit && activeDrag.index === index;

          return (
            <FanCard
              key={index}
              card={card}
              cardLayout={cardLayout}
              scale={layout.scale}
              taken={taken}
              isCandidate={isCandidate}
              reduceMotion={reduceMotion}
            />
          );
        })}
      </View>
    </GestureDetector>
  );
}

/**
 * one card in a `FanArc`'s thirteen-card fan (issue #83). its own
 * `useSharedValue` is what forces this out of `FanArc`'s `.map` into a
 * component of its own — a hook cannot be called inside a loop, and each
 * of the fifty-two cards across the four arcs needs an animated lift
 * independent of every other's.
 *
 * **`translateY`, not `top`.** `top` below still places the card at its
 * resting arc position, exactly as `FanArc`'s own `computeFanLayout`
 * derives it; the lift moves *out* of that layout value and into the
 * transform instead — `[{ translateY: -lift.value }, { rotate }]`, ahead
 * of the rotation — so the card travels straight up rather than along its
 * own rotated axis (`rotate` first would do that), and the animation
 * never touches layout.
 *
 * **`zIndex` is a plain, non-animated style, derived from identity, never
 * from `lift.value`.** `isCandidate` flips synchronously with the pan's
 * own JS-thread state (`CardsPane`'s `activeDrag`), so the card currently
 * under the finger draws above everything the instant it becomes the
 * candidate, regardless of how far its lift has actually animated —
 * deriving `zIndex` from the lift instead would put the rising card
 * *below* the falling one for the first half of every transition, exactly
 * the defect this issue exists to fix. `elevated` is this card's own
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
  isCandidate,
  reduceMotion,
  style,
  ...props
}: ComponentProps<typeof Animated.View> & {
  card: Card;
  cardLayout: FanCardLayout;
  scale: number;
  taken: boolean;
  /** whether a pan in this card's own arc currently resolves to it — see
   * `FanArc`'s own `isCandidate` derivation above, which already excludes
   * a taken card. */
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
    // `../../../../shared/ui/selection-grid/selection-grid.tsx` for the
    // same reasoning) — `pointerEvents="none"` below is load-bearing
    // wiring this card's own hit-testing depends on, not a mere default a
    // caller may reasonably replace: the arc's own `Gesture.Pan()`
    // (`FanArc` above) only receives the touch because each card declines
    // it, and a caller-supplied `pointerEvents` silently replacing it
    // through the rest spread would break the fan's hit-testing from the
    // outside. `style` is still pulled out and merged last, after this
    // card's own `styles.fanCard`/position/`animatedStyle`, so a caller
    // extending it doesn't wipe any of those.
    <Animated.View
      {...props}
      style={[
        styles.fanCard,
        {
          left: cardLayout.centerX - cardLayout.width / 2,
          top: cardLayout.centerY - cardLayout.height / 2,
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
      <PlayingCard card={card} size="fan" scale={scale} selected={taken} />
    </Animated.View>
  );
}

// the "slots to fan" gap, one of the sheet's four uniform 40-apart
// landmark gaps (see `HoldingInputSheet`'s own `LANDMARK_GAP`) — not
// one of `theme.space`'s steps (`x32`, `x48`), so it stays this pane's own
// named constant rather than reaching for a step that doesn't match.
const SLOTS_TO_FAN_GAP = 40;
// the focus ring's clearance outside the slot's edge, and its border
// width (`theme.borderWidth.thick`) — not a measured design value, same
// as `CANDIDATE_LIFT` above. a 6 offset with the 2-wide (`thick`) border
// below leaves a 4px gap between the slot's edge and the ring's inner
// edge — the maintainer's chosen option, over the previous 4 offset's 2px
// gap, itself over a 3 offset's 1px gap, both found too small on a real
// device.
const FOCUS_RING_OFFSET = 6;
// the fixed horizontal distance from slot 0's own left edge to slot 1's —
// both slots are `PREVIEW_SLOT.width` wide, `PREVIEW_SLOT.gap` apart, in a
// row with no other spacing between them, so this is exact geometry, not
// a measurement. `CardsPane`'s own `ringTranslateX` animates the shared
// focus ring by exactly this distance to travel from slot 0 to slot 1.
const FOCUS_RING_SLOT_GAP = PREVIEW_SLOT.width + PREVIEW_SLOT.gap;

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: SLOTS_TO_FAN_GAP,
  },
  // centres `slotsInner` (below) within this component's own width — kept
  // apart from it so `slotsInner`'s own width stays the two slots' exact
  // combined size, the fixed geometry `focusRing` below's travel depends
  // on (`CardsPane`'s own `ringTranslateX` comment).
  slots: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  // the two slots plus the gap between them, and nothing else — `position:
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
  // the focus ring: one shared element now, a sibling of both slots inside
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
  // `left` comes from `layout.offsetX` at the call site, not a static
  // value here — `../card-fan-geometry.ts`'s `computeFanLayout` picks it
  // per render so the ink span sits exactly 16px from the sheet's own
  // outer edge (item 3, PR #70), usually placing the frame's own origin
  // slightly outside this box (see that function's own doc comment).
  arc: {
    position: 'absolute',
  },
  fanCard: {
    position: 'absolute',
  },
}));
