import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionColor, motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';

export type SegmentedTabsItem = {
  key: string;
  label: string;
};

/**
 * a domain-light segmented control: the 44-tall track and 38-tall selected
 * pill from design node `128:33644`, rendering whatever labels `items`
 * gives it — it knows nothing about a hand range, a position, or any
 * other domain concept. the design draws three tabs at 131px wide in a
 * 399px track; this component lets flex divide the track evenly across
 * however many `items` gives it, rather than hardcoding a tab width, so a
 * two-tab caller (this project's first) and a three-tab one both render
 * correctly from the same geometry.
 *
 * **the selected pill slides between tabs now** (PR #70's motion system)
 * — one shared, always-mounted `Animated.View` (`styles.pill` below,
 * positioned by `pillTranslateX`), not a `backgroundColor` variant on
 * whichever `Tab` happens to be selected. that shared element is what
 * makes "slide, don't jump" possible at all: a variant swap has no
 * position to animate between, only two independent colours to snap
 * between. `pillTranslateX`'s own width needs the track's rendered
 * width, so this component measures it via `onLayout` — this isn't Part B's
 * synchronous-geometry fix (`../cards-pane/cards-pane.tsx`'s fan): that
 * fix targets a reported first-frame bug on a
 * component whose container geometry is knowable without measuring
 * (the sheet's own panel); this component is domain-light and reusable
 * outside any particular container, and has no reported bug behind it, so
 * a measured width stays the right call here. before that measurement
 * resolves the pill renders at zero width — a gap on the order of one
 * frame, not the multi-frame one Part B fixes.
 */
export function SegmentedTabs({
  items,
  selectedKey,
  onSelectionChange,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  items: readonly SegmentedTabsItem[];
  selectedKey: string;
  /** named for the outcome — a selection was made — not the mechanism,
   * per docs/conventions/component-contracts.md; fires on every press,
   * `selectedKey` itself re-pressed included. */
  onSelectionChange: (key: string) => void;
  testID: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  const [trackWidth, setTrackWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth((current) => (current === width ? current : width));
  }, []);

  const selectedIndex = Math.max(
    items.findIndex((item) => item.key === selectedKey),
    0,
  );
  // `null` until `trackWidth` resolves — see this component's own doc
  // comment on why that measurement, unlike Part B's, stays as-is.
  const cellWidth = trackWidth !== null ? (trackWidth - TRACK_PADDING * 2) / items.length : null;

  const pillTranslateX = useSharedValue((cellWidth ?? 0) * selectedIndex);
  useEffect(() => {
    if (cellWidth === null) {
      return;
    }
    pillTranslateX.value = motionSpring(cellWidth * selectedIndex, reduceMotion);
    // `pillTranslateX` is a stable shared-value ref — see
    // `../bottom-sheet/bottom-sheet.tsx`'s own reset effect for the same
    // reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellWidth, selectedIndex, reduceMotion]);
  const animatedPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillTranslateX.value }],
  }));

  const handleSelect = useCallback(
    (key: string) => {
      // fires on every press, the already-selected tab included: the
      // feedback confirms the touch registered, the same reasoning
      // `TabBarItem` already applies to the app's own tab bar.
      triggerHaptic(HapticEvent.SelectionChange);
      onSelectionChange(key);
    },
    [onSelectionChange],
  );

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.track` first, the caller's last, so a
    // caller extending it (a margin, say) doesn't wipe the track's own
    // background/border-radius the way spreading `style` back into `props`
    // would; every other rest prop spreads last, letting a caller override
    // an explicit default (`accessibilityRole`, say) — unlike `testID`,
    // which is consumed rather than left in `props`.
    <View
      style={[styles.track, style]}
      accessibilityRole="tablist"
      onLayout={handleLayout}
      testID={testID}
      {...props}
    >
      <Animated.View
        style={[styles.pill, { width: cellWidth ?? 0 }, animatedPillStyle]}
        pointerEvents="none"
        testID={testID ? `${testID}-pill` : undefined}
      />
      {items.map((item) => (
        <Tab
          key={item.key}
          item={item}
          selected={item.key === selectedKey}
          reduceMotion={reduceMotion}
          onPress={handleSelect}
          testID={`tab-${item.key}`}
        />
      ))}
    </View>
  );
}

type TabProps = {
  item: SegmentedTabsItem;
  selected: boolean;
  reduceMotion: boolean;
  onPress: (key: string) => void;
  testID: string;
};

/**
 * one cell of the track — unexported, single-use, and kept beside its
 * only caller. `styles.tab` itself carries no `selected` state any more
 * (`SegmentedTabs`' own shared pill owns the fill, see that component's
 * doc comment); what's left here is the label's own colour transition,
 * kept in step with the pill's travel rather than snapping ahead of it —
 * a label that switched to the selected-on-solid colour the instant
 * `selected` flips, before the pill has visually arrived under it, would
 * read as low-contrast against the plain track still showing underneath
 * for the pill's own travel time.
 */
function Tab({ item, selected, reduceMotion, onPress, testID }: TabProps) {
  const { theme } = useUnistyles();

  const targetLabelColor = selected
    ? theme.colors.text.accent.onSolid
    : theme.colors.text.neutral.low;
  const labelColor = useSharedValue(targetLabelColor);
  useEffect(() => {
    labelColor.value = motionColor(targetLabelColor, reduceMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLabelColor, reduceMotion]);
  const animatedLabelStyle = useAnimatedStyle(() => ({ color: labelColor.value }));

  const handlePress = useCallback(() => {
    onPress(item.key);
  }, [onPress, item.key]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Animated.Text style={[styles.label, animatedLabelStyle]}>{item.label}</Animated.Text>
    </Pressable>
  );
}

// 44 (track height) and 38 (selected-pill height) are both fixed control
// dimensions from design node `128:33644`, not spacing decisions — 38
// isn't written out separately: with the track at 44 and 3 padding on
// every side, flex already produces a 44 - 2×3 = 38-tall cell. 3 is a
// genuine design measurement too, reproduced as measured rather than
// normalized onto the 4/8px grid, per docs/conventions/design-system.md's
// faithful-reproduction rule.
const TRACK_HEIGHT = 44;
const TRACK_PADDING = 3;

const styles = StyleSheet.create((theme) => ({
  // `position: 'relative'` anchors `pill` below against this box.
  track: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    padding: TRACK_PADDING,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.component.neutral.rest,
    position: 'relative',
  },
  // the selected pill — a single shared element positioned by
  // `pillTranslateX`, not a per-tab variant; see `SegmentedTabs`'s own
  // doc comment.
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.solid.accent.rest,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...theme.typography.body,
  },
}));
