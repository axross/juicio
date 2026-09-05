import { BlurView } from 'expo-blur';
import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronLeftIcon } from '@/core/icons/chevron-left-icon';

// 52 is the design's own `Header Bar` height (node
// `I600:31822;600:26553`), corroborated independently in
// docs/conventions/design-system.md's Spacing and Radius section: the
// Settings frame's scrollable content is offset 112px from the top, which
// is exactly the 60px status bar plus this 52px nav bar.
const NAV_BAR_CONTENT_HEIGHT = 52;
/** matches the back button's icon at a 44×44 touch target either side of
 * the title, so the title stays centred whether or not a back button is
 * present. */
const SIDE_SLOT_WIDTH = 44;

// the scroll offset, in dp, at which this header's scroll-linked
// translucency and blur reach full strength — issue #260's own design
// review, recorded in docs/specs/navigation.md's Nav Bar section. a
// negative offset (a screen's own overscroll bounce) is clamped to zero
// before this runs, so the effect never runs in reverse.
const SCROLL_BLUR_RANGE_DP = 24;
// this header's own tint overlay opacity at full scroll-linked strength —
// the design review's own measured value (issue #260), not derived from
// anything else here.
const FULL_STRENGTH_TINT_OPACITY = 0.55;
// expo-blur's `intensity` (1-100) carries no documented mapping to a
// pixel blur radius, so this is a tuned approximation of the design
// review's own "~8px" figure rather than a value derived from it —
// unverified on a real device; see issue #260's own residual-risk note.
const FULL_STRENGTH_BLUR_INTENSITY = 30;

// `Animated.createAnimatedComponent(BlurView)` is `BlurView`'s own
// documented pattern for an animated `intensity` (its own `getAnimatableRef`
// method exists specifically so Reanimated finds the right native view to
// animate) — not a workaround invented here.
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

/**
 * the nav bar every screen in the app shares: 52px tall (plus the top
 * safe-area inset), centred title, flat background matching the screen
 * behind it, no border and no shadow at rest (issue #260) — the app's one
 * screen that used to opt out of a permanent shadow through a
 * `suppressShadow` prop now gets the same flat look as every other screen,
 * unconditionally. a screen pushed onto the stack passes `onBack` for its
 * back affordance (Feedback, Language, and Theme, for example); a
 * top-level tab screen has nowhere to go back to and omits it. no screen
 * carries a share icon — see docs/specs/navigation.md.
 *
 * **`scrollOffset`, this header's own scroll-linked translucency+blur
 * contract**, is what replaced the old permanent shadow's visual job of
 * separating the header from scrolled content: while its value climbs from
 * `0` to `SCROLL_BLUR_RANGE_DP`, this header fades in a `BlurView` (the
 * blur pass) beneath a flat tint overlay at the same colour as this
 * header's own rest background (the "translucent background" the design
 * review names), both driven by one `useDerivedValue`-free pair of
 * worklets reading `scrollOffset.value` directly — entirely on the UI
 * thread, the same `useAnimatedScrollHandler`-writes-a-shared-value pattern
 * `../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s `BottomSheetBody`
 * already establishes for this codebase, so no screen this header serves
 * adds any JS-thread work to scrolling. see docs/specs/navigation.md for
 * the interpolation this reads back out to a human description.
 */
export function NavBar({
  title,
  onBack,
  backAccessibilityLabel,
  scrollOffset,
  style,
  ...props
}: ComponentProps<typeof View> & {
  title: string;
  /** present on a screen pushed onto the stack — Feedback, Language, and
   * Theme, for example — which has somewhere to go back to; every
   * top-level tab screen has nowhere to go back to, so it stays unset there. */
  onBack?: () => void;
  backAccessibilityLabel?: string;
  /** a screen's own live scroll offset (dp), written on the UI thread by
   * that screen's own `ScrollView`/`FlatList` scroll handler — see
   * `../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s `BottomSheetBody` for
   * this project's own precedent for that write. this header reads it,
   * clamped to zero, to drive its own scroll-linked translucency and blur
   * (see this component's own doc comment above); it never mutates it.
   * omitted by a screen with nothing to scroll today — the preset editor's
   * field-less stub — which keeps this header's flat, non-blurred rest
   * look unconditionally rather than mounting a blur view that would never
   * animate. */
  scrollOffset?: SharedValue<number>;
  testID: string;
}) {
  const { theme, rt } = useUnistyles();

  const handleBack = useCallback(() => {
    triggerHaptic(HapticEvent.SecondaryAction);
    onBack?.();
  }, [onBack]);

  // `blurAnimatedProps` and `tintAnimatedStyle` each read `scrollOffset.value`
  // directly rather than through one shared `useDerivedValue` — Reanimated
  // already memoises each hook's own worklet independently, and a shared
  // derived value here would only add a second UI-thread write for the
  // same one number these two already compute on their own.
  const blurAnimatedProps = useAnimatedProps(() => {
    const offset = scrollOffset ? Math.max(scrollOffset.value, 0) : 0;
    const strength = interpolate(offset, [0, SCROLL_BLUR_RANGE_DP], [0, 1], Extrapolation.CLAMP);
    return { intensity: strength * FULL_STRENGTH_BLUR_INTENSITY };
  });

  const tintAnimatedStyle = useAnimatedStyle(() => {
    const offset = scrollOffset ? Math.max(scrollOffset.value, 0) : 0;
    const strength = interpolate(offset, [0, SCROLL_BLUR_RANGE_DP], [0, 1], Extrapolation.CLAMP);
    return { opacity: strength * FULL_STRENGTH_TINT_OPACITY };
  });

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the nav bar's own background/shadow — a
    // spread `style` would replace it instead of merging; every other rest
    // prop, `testID` included, spreads last, letting a caller override an
    // explicit default (`accessibilityRole`, say).
    <View style={[styles.root, style]} {...props}>
      {
        // only mounted for a screen that actually scrolls — see this
        // prop's own doc comment above for why a screen with nothing to
        // scroll (the preset editor) omits `scrollOffset` entirely rather
        // than reaching this branch with a value pinned at `0`.
        scrollOffset ? (
          <>
            <AnimatedBlurView
              pointerEvents="none"
              tint={rt.themeName === 'light' ? 'light' : 'dark'}
              animatedProps={blurAnimatedProps}
              style={styles.scrollEffect}
              testID="nav-bar-blur"
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.scrollEffect, styles.scrollTint, tintAnimatedStyle]}
              testID="nav-bar-scroll-tint"
            />
          </>
        ) : null
      }
      <View style={styles.sideSlot}>
        {onBack ? (
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            testID="back"
          >
            <ChevronLeftIcon color={theme.colors.text.neutral.high} size={24} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1} testID="title">
        {title}
      </Text>
      <View style={styles.sideSlot} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: NAV_BAR_CONTENT_HEIGHT + rt.insets.top,
    paddingTop: rt.insets.top,
    paddingStart: Math.max(rt.insets.left, theme.space.x16),
    paddingEnd: Math.max(rt.insets.right, theme.space.x16),
    // matches the screen behind it, per issue #260's own acceptance
    // criteria — no border, no shadow, ever, at rest. every screen's own
    // `styles.screen` uses this identical token (`background.neutral.app`),
    // so this always matches regardless of which screen renders it.
    backgroundColor: theme.colors.background.neutral.app,
    // establishes the coordinate space `scrollEffect` below is positioned
    // within — not this component placing itself; see
    // docs/conventions/component-styling.md's "A Positioning Context for a
    // Component's Own Children Is Not Placement".
    position: 'relative',
    overflow: 'hidden',
  },
  // the blur view and its tint overlay both fill this header's own root —
  // a non-root child's own style, outside docs/conventions/
  // component-styling.md's placement rule, which governs only a
  // component's own root.
  scrollEffect: {
    ...StyleSheet.absoluteFillObject,
  },
  scrollTint: {
    backgroundColor: theme.colors.background.neutral.app,
  },
  sideSlot: {
    width: SIDE_SLOT_WIDTH,
    height: SIDE_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: SIDE_SLOT_WIDTH,
    height: SIDE_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
  },
  backButtonPressed: {
    backgroundColor: theme.colors.component.neutral.hovered,
  },
  title: {
    ...theme.typography.navBarTitle,
    color: theme.colors.text.neutral.high,
    flex: 1,
    textAlign: 'center',
  },
}));
