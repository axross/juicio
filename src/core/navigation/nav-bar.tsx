import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronLeftIcon } from '@/core/icons/chevron-left-icon';

const NAV_BAR_CONTENT_HEIGHT = 52;
/** matches the back button's icon at a 44×44 touch target either side of
 * the title, so the title stays centred whether or not a back button is
 * present. */
const SIDE_SLOT_WIDTH = 44;

type NavBarProps = {
  title: string;
  /** present on a screen pushed onto the stack — Feedback, Language, and
   * Theme, for example — which has somewhere to go back to; every
   * top-level tab screen has nowhere to go back to, so it stays unset there. */
  onBack?: () => void;
  backAccessibilityLabel?: string;
  /** suppresses this nav bar's own `Sheet` shadow. only Analyze's unified
   * header block passes this (issue #64): its board draws the `Sheet`
   * shadow at its own bottom edge instead, so the nav bar and the board
   * read as one unbroken top band rather than each drawing its own
   * elevation. every other caller omits this and keeps the shadow it
   * always had — the default preserves their behaviour unchanged. */
  suppressShadow?: boolean;
  testID: string;
};

/**
 * the nav bar every screen in the app shares: 52px tall (plus the top
 * safe-area inset), centred title, `olive dark/2` background, the `Sheet`
 * effect — unless `suppressShadow` is set, see above. a screen pushed onto
 * the stack passes `onBack` for its back affordance (Feedback, Language,
 * and Theme, for example); a top-level tab screen has nowhere to go back
 * to and omits it. no screen carries a share icon — see
 * docs/specs/navigation.md.
 */
export function NavBar({
  title,
  onBack,
  backAccessibilityLabel,
  suppressShadow = false,
  testID,
}: NavBarProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ suppressShadow });

  const handleBack = useCallback(() => {
    triggerHaptic(HapticEvent.SecondaryAction);
    onBack?.();
  }, [onBack]);

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.sideSlot}>
        {onBack ? (
          <Pressable
            onPress={handleBack}
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
    variants: {
      suppressShadow: {
        true: {},
        false: { boxShadow: theme.effects.sheet },
        default: { boxShadow: theme.effects.sheet },
      },
    },
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
