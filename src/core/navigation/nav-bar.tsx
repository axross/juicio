import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ChevronLeftIcon } from '@/core/icons/chevron-left-icon';

const NAV_BAR_CONTENT_HEIGHT = 52;
/** Matches the back button's icon at a 44×44 touch target either side of
 * the title, so the title stays centred whether or not a back button is
 * present. */
const SIDE_SLOT_WIDTH = 44;

type NavBarProps = {
  title: string;
  /** Present only on the Feedback screen; every top-level tab screen has
   * nowhere to go back to. */
  onBack?: () => void;
  backAccessibilityLabel?: string;
  testID: string;
};

/**
 * The nav bar every top-level screen and the Feedback screen shares: 52px
 * tall (plus the top safe-area inset), centred title, `olive dark/2`
 * background, the `Sheet` effect. No screen carries a share icon — see
 * docs/specs/navigation.md.
 */
export function NavBar({ title, onBack, backAccessibilityLabel, testID }: NavBarProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.sideSlot}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            testID={`${testID}-back`}
          >
            <ChevronLeftIcon color={theme.colors.text.neutral.high} size={24} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1} testID={`${testID}-title`}>
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
    backgroundColor: theme.colors.background.neutral.subtle,
    boxShadow: theme.effects.sheet,
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
