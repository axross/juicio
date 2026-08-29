import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type SettingsSectionProps = {
  heading: string;
  children: ReactNode;
  testID?: string;
};

/**
 * a Settings section: a 16px-medium heading in `text.neutral.low`
 * (`olive dark/11`), 16px left padding, followed by its card — rows inset
 * 16px from each screen edge with a 1px flex gap between them, letting the
 * screen background through as the divider (no border is drawn).
 */
export function SettingsSection({ heading, children, testID }: SettingsSectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.x16,
  },
  heading: {
    ...theme.typography.label,
    color: theme.colors.text.neutral.low,
    paddingHorizontal: theme.space.x16,
  },
  card: {
    marginHorizontal: theme.space.x16,
    gap: theme.borderWidth.base,
  },
}));
