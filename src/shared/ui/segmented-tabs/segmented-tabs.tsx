import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

export type SegmentedTabsItem = {
  key: string;
  label: string;
};

/**
 * a domain-light segmented control: the 44-tall track and 38-tall
 * selected pill from design node `128:33644`, rendering whatever labels
 * `items` gives it — it does not know what a hand range, a position, or
 * any other domain concept is. the design draws three tabs at 131px wide
 * in a 399px track; this component renders however many `items` gives it
 * and lets flex divide the track evenly rather than hardcoding a tab
 * width, so a two-tab caller (this project's first) and a three-tab one
 * both render correctly from the same geometry.
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
    // this component's own `styles.track` first, the caller's last, so a
    // caller extending it (a margin, say) does not wipe out the track's own
    // background/border-radius the way spreading `style` back in with the
    // rest of `props` would; every other rest prop is spread last, letting a
    // caller override an explicit default (`accessibilityRole`, say) the
    // same way `props.testID` above already deliberately cannot, since it is
    // consumed rather than left in `props`.
    <View style={[styles.track, style]} accessibilityRole="tablist" testID={testID} {...props}>
      {items.map((item) => (
        <Tab
          key={item.key}
          item={item}
          selected={item.key === selectedKey}
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
  onPress: (key: string) => void;
  testID: string;
};

/**
 * one cell of the track — unexported, single-use, and kept beside its
 * only caller: it exists only because `styles.useVariants` must be called
 * from a component body under the rules of hooks, and each cell needs its
 * own `selected` variant independently of its siblings.
 */
function Tab({ item, selected, onPress, testID }: TabProps) {
  styles.useVariants({ selected });

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
      <Text style={styles.label}>{item.label}</Text>
    </Pressable>
  );
}

// 44 (track height) and 38 (selected-pill height) are both fixed control
// dimensions from design node `128:33644`, not spacing decisions — the
// pill's 38 is not written out separately below: with the track at 44 and
// 3 padding on every side, flex already produces a 44 - 2*3 = 38-tall
// cell with no extra style needed. 3 is a genuine design measurement too,
// reproduced as measured rather than normalized onto the 4/8px grid, per
// docs/conventions/design-system.md's now-default faithful-reproduction
// rule.
const TRACK_HEIGHT = 44;
const TRACK_PADDING = 3;

const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    padding: TRACK_PADDING,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.component.neutral.rest,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.solid.accent.rest },
        false: {},
        default: {},
      },
    },
  },
  label: {
    ...theme.typography.body,
    variants: {
      selected: {
        true: { color: theme.colors.text.accent.onSolid },
        false: { color: theme.colors.text.neutral.low },
        default: { color: theme.colors.text.neutral.low },
      },
    },
  },
}));
