import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PlusIcon } from '@/core/icons/plus-icon';
import { Button } from '@/shared/ui/button/button';

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
 * a lime pill button, `Button` from `src/shared/ui/button/`, given the
 * design's `PlusIcon`. earned as a shared component per
 * docs/conventions/directory-structure.md's bar for `src/shared/`: two real
 * callers, both built in the same change that first wrote this file.
 *
 * the description is authored in the design as a single non-wrapping line;
 * this component does not enforce that — it centres the text and lets it
 * wrap, since longer real copy's wrap behaviour is not something the design
 * specifies either way.
 */
export function EmptyState({ heading, description, action, testID }: EmptyStateProps) {
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
        <Button
          label={action.label}
          Icon={PlusIcon}
          onPress={action.onPress}
          testID={action.testID}
        />
      ) : null}
    </View>
  );
}

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
}));
