import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';

import { SharkIllustration } from './shark-illustration';

export type EmptyStateAction = {
  label: string;
  onPress: () => void;
  testID?: string;
};

type EmptyStateProps = {
  heading: string;
  description: string;
  /** Analyze's `+ New Player` button; omitted, History has none. */
  action?: EmptyStateAction;
  testID?: string;
};

/**
 * the composition Analyze's and History's empty states share: the shark
 * illustration, a centred heading and description, and — for Analyze only —
 * a lime pill button. earned as a shared component per
 * docs/conventions/directory-structure.md's bar for `src/shared/`: two real
 * callers, both built in this same change.
 *
 * the description is authored in the design as a single non-wrapping line;
 * this component does not enforce that — it centres the text and lets it
 * wrap, since longer real copy's wrap behaviour is not something the design
 * specifies either way.
 */
export function EmptyState({ heading, description, action, testID }: EmptyStateProps) {
  const { theme } = useUnistyles();

  const handleActionPress = useCallback(() => {
    triggerHaptic('primaryAction');
    action?.onPress();
  }, [action]);

  return (
    <View style={styles.root} testID={testID}>
      <SharkIllustration testID={testID ? `${testID}-illustration` : undefined} />
      <View style={styles.textBlock}>
        <Text style={styles.heading} testID={testID ? `${testID}-heading` : undefined}>
          {heading}
        </Text>
        <Text style={styles.description} testID={testID ? `${testID}-description` : undefined}>
          {description}
        </Text>
      </View>
      {action ? (
        <Pressable
          onPress={handleActionPress}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID={action.testID}
        >
          <PlusIcon color={theme.colors.text.accent.onSolid} size={24} />
          <Text style={styles.buttonLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// the button height (44) is a fixed control dimension — a well-known
// minimum touch target, not a spacing decision — per
// react-component-styling's "Fixed element dimensions" exemption; it is not
// one of this project's `space.x*` steps.
const BUTTON_HEIGHT = 44;

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    alignItems: 'center',
    gap: theme.space.x32,
  },
  textBlock: {
    alignItems: 'center',
    gap: theme.space.x4,
    paddingHorizontal: theme.space.x16,
  },
  heading: {
    ...theme.typography.heading,
    color: theme.colors.text.neutral.high,
    textAlign: 'center',
  },
  description: {
    ...theme.typography.description,
    color: theme.colors.text.neutral.low,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // measures 6px in the design; normalized onto the 4/8px grid per
    // docs/conventions/design-system.md, snapped up to the row/icon gap this
    // project already uses elsewhere rather than a bespoke 6px value.
    gap: theme.space.x8,
    height: BUTTON_HEIGHT,
    minWidth: BUTTON_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.solid.accent.rest,
  },
  buttonPressed: {
    backgroundColor: theme.colors.solid.accent.hovered,
  },
  buttonLabel: {
    ...theme.typography.label,
    color: theme.colors.text.accent.onSolid,
  },
}));
