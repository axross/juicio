import type { ComponentProps, ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';
import { motionColor, motionSizeTimingConfig, motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';

export type SegmentedTabsItem = {
  key: string;
  label: string;
  /**
   * shown at a fixed `ICON_SIZE` below, always visible on both the
   * selected and unselected tab, regardless of the icon component's own
   * default size — see `Tab`'s own doc comment for the rest of what
   * supplying one changes. an item that omits this renders exactly as
   * this component did before any item carried an icon: its label always
   * visible, un-animated.
   */
  icon?: ComponentType<IconProps>;
};

/**
 * a domain-light segmented control: the 44-tall track and, from this
 * component's own `TRACK_PADDING` below, a selected pill sized to
 * whatever that leaves inside it — it knows nothing about a hand range, a
 * position, or any other domain concept. the design draws three tabs at
 * 131px wide in a 399px track; this component lets flex divide the track
 * evenly across however many `items` gives it, rather than hardcoding a
 * tab width, so a two-tab caller (this project's first) and a three-tab
 * one both render correctly from the same geometry.
 *
 * **the selected pill slides between tabs** — one shared, always-mounted
 * `Animated.View` (`styles.pill` below, positioned by `pillTranslateX`),
 * not a `backgroundColor` variant on whichever `Tab` happens to be
 * selected. that shared element is what makes "slide, don't jump" possible
 * at all: a variant swap has no position to animate between, only two
 * independent colours to snap between. `pillTranslateX`'s own width needs
 * the track's rendered width, so this component measures it via
 * `onLayout`: unlike `../cards-pane/cards-pane.tsx`'s fan, whose container
 * geometry (the sheet's own panel) is knowable without measuring, this
 * component is domain-light and reusable outside any particular
 * container, so a measured width is the right call here. before that
 * measurement resolves the pill renders at zero width — a gap on the
 * order of one frame.
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
  const { theme } = useUnistyles();

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
  //
  // `trackWidth` (measured via `onLayout` on `styles.track` itself) is
  // that box's own border-box size, so the track's new border ring is
  // subtracted here alongside its padding — both sides of both, since
  // each runs down both edges of the axis this control lays tabs out on.
  const cellWidth =
    trackWidth !== null
      ? (trackWidth - (TRACK_PADDING + theme.borderWidth.base) * 2) / items.length
      : null;

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
 * only caller. `styles.tab` itself carries no `selected` state
 * (`SegmentedTabs`' own shared pill owns the fill, see that component's
 * doc comment); what's left here is the label's own colour transition,
 * kept in step with the pill's travel rather than snapping ahead of it —
 * a label that switched to the selected-on-solid colour the instant
 * `selected` flips, before the pill has visually arrived under it, would
 * read as low-contrast against the plain track still showing underneath
 * for the pill's own travel time.
 *
 * **an item with no `icon` renders exactly as every item did before this
 * paragraph existed**: its label plain, unconditional, and un-animated
 * beyond the colour cross-fade above. an item with one always shows that
 * icon at a fixed `ICON_SIZE`, tinted to this same `targetLabelColor` and
 * switching the instant `selected` flips rather than cross-fading — the
 * icon components take an already-resolved `color`, not an animatable
 * one — and reveals its label only while selected.
 *
 * **the reveal measures the label's own natural width rather than
 * assuming one.** `labelMeasurer` below renders the same string off to
 * the side — absolutely positioned, so it takes no space of its own, and
 * hidden from assistive technology — purely to learn its width for
 * whichever locale is active through `onLayout`; a fixed width sized for
 * one language's copy would clip or leave slack under the other (this
 * project ships English and Japanese). The visible label then sits inside
 * `labelReveal`, an `Animated.View` whose own `width` this component
 * springs between `0` and that measured width plus `ICON_LABEL_GAP`
 * (`styles.labelReveal`'s `paddingLeft` reserves the gap inside that
 * width, so a collapsed label leaves no residual space next to the
 * icon), on the same spring `SegmentedTabs`' own pill already travels on;
 * its `opacity` cross-fades on the same timing the label's own colour
 * already does. Until the measurement resolves, `labelWidth` is `null`
 * and the reveal target is `0` regardless of `selected` — the same
 * one-frame gap `SegmentedTabs`' own doc comment already accepts for the
 * pill's width before its track measures.
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

  const [labelWidth, setLabelWidth] = useState<number | null>(null);
  const handleLabelLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setLabelWidth((current) => (current === width ? current : width));
  }, []);

  const targetRevealWidth = selected && labelWidth !== null ? ICON_LABEL_GAP + labelWidth : 0;
  const revealWidth = useSharedValue(targetRevealWidth);
  const targetRevealOpacity = selected ? 1 : 0;
  const revealOpacity = useSharedValue(targetRevealOpacity);
  useEffect(() => {
    // `revealWidth` is a size, not movement — it collapses to `0`, and a
    // spring's overshoot on a size headed to zero drives it momentarily
    // negative and back up through positive on the rebound (see
    // `motionSizeTimingConfig`'s own doc comment), which would flash the
    // just-deselected label back into view for a frame. so this reads
    // `motionSizeTimingConfig` directly — the same way `bottom-sheet.tsx`'s
    // `commitClose` calls `withSpring` directly against `motionSpringConfig`
    // — rather than the movement-only `motionSpring` helper.
    revealWidth.value = reduceMotion
      ? targetRevealWidth
      : withTiming(targetRevealWidth, motionSizeTimingConfig);
    revealOpacity.value = motionColor(targetRevealOpacity, reduceMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRevealWidth, targetRevealOpacity, reduceMotion]);
  const animatedRevealStyle = useAnimatedStyle(() => ({
    width: revealWidth.value,
    opacity: revealOpacity.value,
  }));

  const handlePress = useCallback(() => {
    onPress(item.key);
  }, [onPress, item.key]);

  const Icon = item.icon;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      // explicit and independent of the label's own reveal state, per
      // docs/conventions/design-system.md's tab-row entry — a screen
      // reader announces `item.label` whether or not it is currently
      // visible on screen.
      accessibilityLabel={item.label}
      testID={testID}
    >
      {Icon ? (
        <>
          <Icon color={targetLabelColor} size={ICON_SIZE} />
          <Animated.View
            style={[styles.labelReveal, animatedRevealStyle]}
            testID={`label-${item.key}`}
          >
            <Animated.Text
              style={[styles.label, animatedLabelStyle]}
              numberOfLines={1}
              // the visible label; `labelMeasurer` below is what learns
              // this text's own natural width, this element only ever
              // renders it.
            >
              {item.label}
            </Animated.Text>
          </Animated.View>
          <Text
            style={[styles.label, styles.labelMeasurer]}
            onLayout={handleLabelLayout}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            testID={`label-measure-${item.key}`}
          >
            {item.label}
          </Text>
        </>
      ) : (
        <Animated.Text style={[styles.label, animatedLabelStyle]}>{item.label}</Animated.Text>
      )}
    </Pressable>
  );
}

// 44 is a fixed control dimension from design node `128:33644`, unchanged
// by this component's own new border ring and icon/label composition. the
// selected pill's own height is derived from it instead of read off that
// same node — `44 - 2×TRACK_PADDING` — and `4` is a deliberate departure
// from that node's own measured `3`, alongside the track's new border
// ring and the pill's new shadow: see
// docs/decisions/2026-09-06-pad-the-segmented-tab-track-and-shadow-its-pill.md.
const TRACK_HEIGHT = 44;
const TRACK_PADDING = 4;

// the icon's own fixed size (docs/conventions/design-system.md's tab-row
// entry) — not the icon components' own 24 default, and not scaled to
// `TRACK_HEIGHT` above.
const ICON_SIZE = 16;

// the gap between the icon and the revealed label. not one of
// `theme.space`'s own steps (4, 8 — neither close enough to reproduce 6
// faithfully), so this stays a local literal the same way `TRACK_PADDING`
// above does, per docs/conventions/design-system.md's faithful-
// reproduction default.
const ICON_LABEL_GAP = 6;

const styles = StyleSheet.create((theme) => ({
  // `position: 'relative'` anchors `pill` below against this box.
  track: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    padding: TRACK_PADDING,
    borderRadius: theme.radius.full,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
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
    boxShadow: theme.effects.segmentedPill,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...theme.typography.body,
  },
  // clips the label to whatever width `animatedRevealStyle` currently
  // gives it; `paddingLeft` reserves the icon-label gap inside that width
  // rather than as a sibling margin, so a collapsed (zero-width) label
  // leaves no residual gap next to the icon — see `Tab`'s own doc
  // comment.
  labelReveal: {
    overflow: 'hidden',
    paddingLeft: ICON_LABEL_GAP,
  },
  // off-screen, not `display: 'none'`: this still needs a real layout
  // pass to report its own width through `onLayout`, which a
  // display-none element never gets.
  labelMeasurer: {
    position: 'absolute',
    opacity: 0,
  },
}));
