import type { ComponentProps, ComponentType } from 'react';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';

const ICON_SIZE = 24;
const ACTIVE_MARKER_HEIGHT = 1;

/**
 * one cell of the tab bar: 24px icon above a 12px label with a 4px gap,
 * `padding-top: 8px`. the active cell renders its icon and label in
 * `text.accent.brand` (see tokens.ts — the theme-aware brand lime, not the
 * raw `lime/9` fill) plus a 1px full-width gradient hairline
 * (transparent → lime → transparent) along that cell's own top edge only.
 */
export function TabBarItem({
  label,
  Icon,
  active,
  onPress,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  label: string;
  Icon: ComponentType<IconProps>;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { theme } = useUnistyles();
  const color = active ? theme.colors.text.accent.brand : theme.colors.text.neutral.low;

  // fires on every press, active tab re-selected included: the feedback
  // confirms the touch registered, which is the point even when nothing
  // navigates as a result.
  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.SelectionChange);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      // `Pressable`'s own `style` accepts a plain style or a function of its
      // press state; a caller-supplied `style` can be either shape too, so
      // it's normalized before merging — this cell's own `styles.cell`
      // first, the caller's last, so an extending caller doesn't wipe the
      // cell's own layout. every other rest prop, `testID` included, spreads
      // last, letting a caller override an explicit default
      // (`accessibilityRole`, say).
      style={(state) => [styles.cell, typeof style === 'function' ? style(state) : style]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      {...props}
    >
      {active ? (
        <Svg
          width="100%"
          height={ACTIVE_MARKER_HEIGHT}
          style={styles.marker}
          testID="active-marker"
        >
          <Defs>
            <LinearGradient id="marker" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.colors.text.accent.brand} stopOpacity={0} />
              <Stop offset="0.5" stopColor={theme.colors.text.accent.brand} stopOpacity={1} />
              <Stop offset="1" stopColor={theme.colors.text.accent.brand} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={ACTIVE_MARKER_HEIGHT} fill="url(#marker)" />
        </Svg>
      ) : null}
      <View style={styles.iconLabel}>
        <Icon color={color} size={ICON_SIZE} />
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  cell: {
    flex: 1,
    // NOT this cell's own per-cell content height — that's 56px (8 +
    // the 24px icon + a 4px gap + the label + 4), the design's own
    // measurement `docs/specs/navigation.md` records, reproduced below
    // through `iconLabel`'s padding/gap rather than through this value.
    // 44 reads as this project's own accessibility touch-target floor —
    // the same number, and the same "minimum touch target" reasoning,
    // `Button`'s `BUTTON_HEIGHT` and `SettingsRow`'s `ROW_MIN_HEIGHT`
    // both carry, introduced in this component's own first commit
    // (97ca161, #11) alongside them — but unlike those two, no comment,
    // decision record, or that issue's own body ever wrote that
    // reasoning down for this value at this call site. it is fixed for
    // this component regardless of the case above; its provenance is
    // not recorded, and needs confirming with the maintainer rather
    // than being taken as settled.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  marker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  iconLabel: {
    alignItems: 'center',
    gap: theme.space.x4,
    paddingTop: theme.space.x8,
    paddingBottom: theme.space.x4,
  },
  label: {
    ...theme.typography.tabLabel,
  },
}));
