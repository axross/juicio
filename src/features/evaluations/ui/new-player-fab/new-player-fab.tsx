import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, Text } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { WithTimingConfig } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';
import { motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';

// `Pressable` is a plain React Native component; wrapping it once, at
// module scope, lets an animated style (the breathing glow's `boxShadow`,
// and the press-down `scale`, both below) apply to it — the same reason
// `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s and
// `../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`'s own
// `AnimatedPressable` exist.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * the Analyze players section's own add-player affordance (issue #155):
 * a persistent floating action button — the design's `PlusIcon` beside a
 * `New Player` label — replacing the two state-dependent entry points this
 * project shipped before it (the empty state's own pill `Button`, and
 * `PlayerList`'s trailing `NewPlayerRow`). Single-purpose and
 * single-caller, the same shape `NewPlayerRow` (the component it replaces)
 * already took: the icon and the label are fixed rather than props, since
 * there is exactly one thing this button ever does.
 *
 * styled from the same tokens the pill `Button` this replaces already
 * used — `theme.radius.md` (not `theme.radius.full`; a deliberate,
 * human-approved departure from a typical FAB's fully-rounded pill, per
 * the plan's own UI design section), `solid.accent.rest`/`.hovered`, and
 * `text.accent.onSolid`.
 *
 * **the resting shadow is a colored, continuously breathing glow, not
 * `theme.effects.sheetInverted`'s plain dark one** (issue #210). It reuses
 * that same token's own two-layer `boxShadow` shape and bottom-anchored
 * direction (`docs/conventions/design-system.md`'s Effects section) —
 * `GLOW_CONTACT`/`GLOW_BLOOM` below carry `sheetInverted`'s own negated
 * offsets, blur, and spread unchanged — but recoloured to this button's own
 * `solid.accent.rest` (the same lime the fill already uses) instead of
 * black, and animated: `glowPhase`, a Reanimated shared value looping
 * between `0` and `1` (`withRepeat(withTiming(1, GLOW_TIMING_CONFIG), -1,
 * true)`, a roughly 9s round trip — `GLOW_HALF_CYCLE_MS` each direction —
 * on an ease-in-out curve), drives each layer's own alpha between a dimmer
 * and a brighter figure inside `animatedGlowStyle`, via `glowOpacitiesAt`
 * below. Reduced motion
 * (`usePrefersReducedMotion`) freezes `glowPhase` at `1`, its brighter end,
 * instead of running the loop — the glow stays visibly present and
 * coloured, never reverting to the old plain shadow, but perfectly still;
 * `docs/conventions/design-system.md`'s Motion section records why this one
 * surface's loop doesn't use `@/core/motion/tokens`'s `motionColor` for
 * that collapse. The opacity ranges, the loop's duration, and its easing
 * curve are this change's own pick within the plan's "soft" character, not
 * a design-file measurement.
 *
 * **held down, the button now visibly sinks in.** `scale`, a second shared
 * value, springs to `PRESS_SCALE` on `onPressIn` and back to `1` on
 * `onPressOut`, through `@/core/motion/tokens`'s own `motionSpring` —
 * `../player-row/player-row.tsx`'s `dragScale`/`DRAG_LIFT_SCALE` is the
 * one other scale animation in this app, and this reuses its exact
 * mechanism rather than inventing a second one. `motionSpring` already
 * collapses to an instant jump under reduced motion, so no separate branch
 * is needed here the way the glow above needs one.
 *
 * **why `pressed` is now local state, not `Pressable`'s own render-prop
 * `state.pressed`.** `AnimatedPressable`'s own wrapper
 * (`react-native-reanimated` 4.5.1's `createAnimatedComponent/
 * AnimatedComponent.tsx`) discovers which of its incoming `style` prop's
 * array entries are `useAnimatedStyle` results by walking that array
 * directly (`filterStyles(flattenArray(props.style))`) — a *function*
 * `style` prop (react-native 0.86.3's own `Pressable.js`, `style={typeof
 * style === 'function' ? style({pressed}) : style}`) is invisible to that
 * walk, since it is Pressable's own render, not this wrapper, that ever
 * calls it. Nesting `animatedGlowStyle`/`animatedPressStyle` inside the old
 * `state => [...]` form this component used to pass would therefore have
 * type-checked and rendered once, but never received a live update on a
 * real device — confirmed by reading both files above, not assumed. This
 * component now tracks `pressed` itself, in `onPressIn`/`onPressOut`
 * (already needed for `scale` above), and composes the root's `style` as a
 * plain array instead, so `animatedGlowStyle`/`animatedPressStyle` sit as
 * direct siblings that wrapper can actually see. A caller-supplied `style`
 * function is still normalized against this same `{ pressed }`, just
 * resolved here rather than by `Pressable` itself — see
 * `resolvedCallerStyle` below — keeping docs/conventions/
 * component-styling.md's own caller-style contract intact; this is also
 * what now lets the swap itself be driven, and asserted, through
 * `onPressIn`/`onPressOut` directly — `Pressable`'s own internal press
 * state stayed unobservable to a component test, per
 * docs/conventions/design-system.md's "Board Slot Pressed State" entry.
 *
 * **takes no position of its own.** Per
 * docs/conventions/component-styling.md's "Placement Is the Caller's"
 * rule, this component's own root sets no `position`, `bottom`, `right`,
 * or `zIndex` — `../analyze-screen/analyze-screen.tsx`, its only caller,
 * supplies the screen's own bottom-right offset through this component's
 * `style` prop, over a `position: relative` container it establishes
 * itself. No portal: unlike `BottomSheet` and `Toast`, this button never
 * needs to escape a clipping ancestor or stack above another screen — it
 * only ever floats above the Analyze screen's own content (the plan's own
 * Alternatives Considered section).
 *
 * fires the `primaryAction` haptic on every press, the same event the two
 * entry points this button replaces both fired
 * (docs/conventions/haptics.md) — Apple's Consistency Rule is explicit
 * that the same gesture must not read as a different sensation on two
 * different screens, and this button now the only one raising it here.
 * Unaffected by this change: the haptic still fires from `handlePress`
 * alone, on `onPress`, never on `onPressIn`/`onPressOut`.
 */
export function NewPlayerFab({
  onPress,
  onPressIn: onPressInProp,
  onPressOut: onPressOutProp,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  onPress: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const label = t('newPlayerFab.label');
  const reduceMotion = usePrefersReducedMotion();

  const [pressed, setPressed] = useState(false);
  const glowPhase = useSharedValue(0);
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress();
  }, [onPress]);

  // plain functions, rebuilt fresh every render, rather than `useCallback` —
  // the same shape `../player-row/player-row.tsx`'s own `handleDragPickup`/
  // `handleDragRelease` take, and for the same reason given there:
  // `react-hooks/immutability` flags a shared value's `.value` write once
  // that value has been passed as a `useAnimatedStyle` dependency anywhere
  // in this component (`scale` already is, below) — nested inside a plain
  // function instead, the rule doesn't flag it.
  function handlePressIn(event: GestureResponderEvent) {
    scale.value = motionSpring(PRESS_SCALE, reduceMotion);
    setPressed(true);
    onPressInProp?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    scale.value = motionSpring(1, reduceMotion);
    setPressed(false);
    onPressOutProp?.(event);
  }

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(glowPhase);
      glowPhase.value = 1;
      return;
    }
    glowPhase.value = 0;
    glowPhase.value = withRepeat(withTiming(1, GLOW_TIMING_CONFIG), -1, true);
    return () => {
      cancelAnimation(glowPhase);
    };
  }, [reduceMotion, glowPhase]);

  // `#rrggbb` (this project's own colour tokens, `theme.colors.solid.
  // accent.rest` included, are always this six-digit form — the same
  // assumption `../../model/band-color.ts`'s own `parseHexColor` makes)
  // parsed to its three 0–255 channels, comma-joined for the `rgba(...)`
  // strings `animatedGlowStyle` below builds every frame. Kept local
  // rather than imported from `band-color.ts`: that module is scoped to
  // the Equity Breakdown chart's own colour ramp, and three `parseInt`
  // calls are cheaper here than coupling this button to it.
  const accentRgbChannels = hexToRgbChannels(theme.colors.solid.accent.rest);

  const animatedGlowStyle = useAnimatedStyle(() => {
    const { contactOpacity, bloomOpacity } = glowOpacitiesAt(glowPhase.value);
    return {
      boxShadow:
        `0px ${GLOW_CONTACT.offsetY}px ${GLOW_CONTACT.blurRadius}px ${GLOW_CONTACT.spreadDistance}px ` +
        `rgba(${accentRgbChannels}, ${contactOpacity}), ` +
        `0px ${GLOW_BLOOM.offsetY}px ${GLOW_BLOOM.blurRadius}px ${GLOW_BLOOM.spreadDistance}px ` +
        `rgba(${accentRgbChannels}, ${bloomOpacity})`,
    };
  });

  const animatedPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // normalizes a caller-supplied `style` against this component's own
  // `pressed` state — see this component's own doc comment above for why
  // that state is now tracked locally rather than read from `Pressable`'s
  // own render-prop callback.
  const resolvedCallerStyle = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // own → variant → transient state → animated → caller
      // (docs/conventions/component-styling.md) — a plain array, not the
      // render-prop function this component used to pass; see this
      // component's own doc comment above for why.
      style={[
        styles.root,
        pressed && styles.rootPressed,
        animatedGlowStyle,
        animatedPressStyle,
        resolvedCallerStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      {...props}
    >
      <PlusIcon color={theme.colors.text.accent.onSolid} size={24} />
      <Text style={styles.label}>{label}</Text>
    </AnimatedPressable>
  );
}

// the press-down "sinks in" response's own target scale (issue #210) —
// the plan itself only specifies "a slight, springy scale-down while
// held", naming no numeric range; 0.96 is this change's own pick for that
// "slight" reduction, not a design-file measurement. see
// `../player-row/player-row.tsx`'s own `DRAG_LIFT_SCALE` for this app's one
// other scale animation, which this button's press response otherwise
// mirrors (`@/core/motion/tokens`'s `motionSpring`).
export const PRESS_SCALE = 0.96;

// the breathing glow's own timing (issue #210): a plain `withTiming` call,
// not `@/core/motion/tokens`'s `motionColor` — that helper's collapse-to-
// target reduced-motion semantics fit a discrete, one-shot transition, not
// a perpetual loop with no single target value to collapse to (see this
// component's own doc comment, and docs/conventions/design-system.md's
// Motion section). `GLOW_HALF_CYCLE_MS` is one direction of the breathing
// cycle — `withRepeat`'s own `reverse: true` plays it back the other way,
// for a roughly 9s full round trip, this change's own pick within the
// plan's "soft", not-jarring character rather than a design-file
// measurement. `Easing.inOut` reads the same on both halves of the cycle,
// which is what keeps the dim→bright and bright→dim legs from reading as
// two different speeds.
const GLOW_HALF_CYCLE_MS = 4500;
const GLOW_TIMING_CONFIG: WithTimingConfig = {
  duration: GLOW_HALF_CYCLE_MS,
  easing: Easing.inOut(Easing.sin),
};

// the glow's own two `boxShadow` layers (issue #210) — `theme.effects.
// sheetInverted`'s own negated offsets, blur, and spread
// (`src/core/theme/tokens.ts`'s `sheetLayers`), unchanged: only the colour
// (recoloured to the button's own accent, animated) and this component's
// own name for each ("contact", the tighter layer; "bloom", the wider one)
// are new. Kept as this component's own local constants rather than
// exported from `tokens.ts`, since nothing else in this project draws a
// glow — see that file's own two-layer `sheetInverted`/`sheet` doc comment
// for why the *unrecoloured* shape lives there instead.
const GLOW_CONTACT = { offsetY: -4, blurRadius: 6, spreadDistance: -2 };
const GLOW_BLOOM = { offsetY: -10, blurRadius: 15, spreadDistance: -3 };

// each layer's own opacity range, animated between `dim` and `bright` by
// `glowPhase` above (`0` → `dim`, `1` → `bright`) — this change's own pick,
// not a design-file measurement, within the plan's "gentle" character.
// `GLOW_BLOOM` stays dimmer than `GLOW_CONTACT` at both ends: a glow's
// natural falloff is brightest near its source and softens across its
// wider radius. That is the opposite of `theme.effects.sheetInverted`'s
// own two dark-shadow layers, where the wider layer is the MORE opaque
// one (0.1 vs 0.05) — those serve an unrelated goal, an ambient drop
// shadow rather than a light source, so their relative order does not
// carry over here.
const GLOW_CONTACT_OPACITY = { dim: 0.35, bright: 0.7 };
const GLOW_BLOOM_OPACITY = { dim: 0.25, bright: 0.55 };

/**
 * `glowPhase.value` (`0`–`1`) → each layer's own alpha at that point along
 * `GLOW_CONTACT_OPACITY`/`GLOW_BLOOM_OPACITY`'s dim→bright range — the exact
 * math `animatedGlowStyle` above calls this for, pulled out to a named, pure
 * function rather than left inline for one reason: exported, so a unit test
 * can call it directly with a plain numeric `phase` and assert the `dim`/
 * `bright` constants map to the correct end without ever going through a
 * render or an effect. `new-player-fab.test.tsx`'s own "resting glow" suite
 * doc comment explains why observing that mapping any other way — a live
 * render+effect cycle — cannot work under this project's Reanimated Jest
 * mock, which resolves `useAnimatedStyle` synchronously at render and never
 * re-resolves it once an effect mutates `glowPhase` afterwards; this
 * function sidesteps that limitation entirely rather than fighting it.
 *
 * marked `'worklet'` for the same reason `@/core/motion/tokens`'s own
 * `motionSpring`/`motionColor`/`motionQuick` are: `animatedGlowStyle` still
 * calls it from inside its own worklet, and the worklets Babel plugin only
 * auto-workletizes a function it can see is never imported elsewhere — this
 * one now is, for the test above.
 */
export function glowOpacitiesAt(phase: number): { contactOpacity: number; bloomOpacity: number } {
  'worklet';
  return {
    contactOpacity:
      GLOW_CONTACT_OPACITY.dim + phase * (GLOW_CONTACT_OPACITY.bright - GLOW_CONTACT_OPACITY.dim),
    bloomOpacity:
      GLOW_BLOOM_OPACITY.dim + phase * (GLOW_BLOOM_OPACITY.bright - GLOW_BLOOM_OPACITY.dim),
  };
}

function hexToRgbChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

// this component's own design-fixed intrinsic dimension, per
// docs/conventions/component-styling.md's "A Design-Fixed Intrinsic
// Dimension Stays With the Component" rule — not a placement choice a
// caller is making. 44 is this project's own touch-target floor
// (docs/conventions/design-system.md), the same value the pill `Button`
// this component's visual identity is drawn from already uses as its own
// measured height.
const FAB_HEIGHT = 44;

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.x8,
    height: FAB_HEIGHT,
    minWidth: FAB_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.solid.accent.rest,
    // no `boxShadow` here any more (issue #210) — `animatedGlowStyle`
    // above supplies it now, composed later in the root's own `style`
    // array, so a value set here would only ever be immediately
    // overridden. See this component's own doc comment for the breathing
    // glow that replaces the plain `theme.effects.sheetInverted` this key
    // used to carry.
  },
  rootPressed: {
    backgroundColor: theme.colors.solid.accent.hovered,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.text.accent.onSolid,
  },
}));
