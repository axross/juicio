import type { ComponentType } from 'react';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';

const ICON_SIZE = 24;
const ACTIVE_MARKER_HEIGHT = 1;

type TabBarItemProps = {
  label: string;
  Icon: ComponentType<IconProps>;
  active: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * one cell of the tab bar: 24px icon above a 12px label with a 4px gap,
 * `padding-top: 8px`. the active cell renders its icon and label in
 * `text.accent.brand` (see tokens.ts — the theme-aware brand lime, not the
 * raw `lime/9` fill) plus a 1px full-width gradient hairline
 * (transparent → lime → transparent) along that cell's own top edge only.
 */
export function TabBarItem({ label, Icon, active, onPress, testID }: TabBarItemProps) {
  const { theme } = useUnistyles();
  const color = active ? theme.colors.text.accent.brand : theme.colors.text.neutral.low;

  // fires on every press, active tab re-selected included: the feedback
  // confirms the touch registered, which is the point even when nothing
  // navigates as a result.
  const handlePress = useCallback(() => {
    triggerHaptic('selectionChange');
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.cell}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      testID={testID}
    >
      {active ? (
        <Svg
          width="100%"
          height={ACTIVE_MARKER_HEIGHT}
          style={styles.marker}
          testID={`${testID}-active-marker`}
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
