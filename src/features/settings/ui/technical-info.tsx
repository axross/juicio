import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { readBuildMetadata } from '../adapter/read-build-metadata';

type TechnicalInfoLine = {
  label: string;
  value: string;
};

/**
 * the unlabelled Technical Information block: four plain lines, not a card
 * — 16px left padding, 14px regular in `text.neutral.low`
 * (`olive dark/11`), the value inline after the label (`Build: Production`).
 * every line always renders a non-empty value; see
 * `../model/technical-info.ts` for the fallbacks that guarantee it.
 */
export function TechnicalInfo({
  labels,
  style,
  ...props
}: ComponentProps<typeof View> & {
  labels: {
    build: string;
    appVersion: string;
    buildNumber: string;
    sha: string;
  };
}) {
  const info = readBuildMetadata();

  const lines: TechnicalInfoLine[] = [
    { label: labels.build, value: info.buildChannel },
    { label: labels.appVersion, value: info.version },
    { label: labels.buildNumber, value: info.buildNumber },
    { label: labels.sha, value: info.commitHash },
  ];

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.container` first, the caller's last, so a
    // caller extending it doesn't wipe the block's own padding — a spread
    // `style` would replace it instead of merging; every other rest prop,
    // `testID` included, spreads last, letting a caller override an
    // explicit default.
    <View style={[styles.container, style]} {...props}>
      {lines.map((line) => (
        <Text key={line.label} style={styles.line}>
          {line.label}: {line.value}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.space.x16,
  },
  line: {
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
}));
