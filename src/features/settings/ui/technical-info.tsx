import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { readBuildMetadata } from '../adapter/read-build-metadata';

type TechnicalInfoLine = {
  label: string;
  value: string;
};

type TechnicalInfoProps = {
  labels: {
    build: string;
    appVersion: string;
    buildNumber: string;
    sha: string;
  };
  testID?: string;
};

/**
 * the unlabelled Technical Information block: four plain lines, not a card
 * — 16px left padding, 14px regular in `text.neutral.low`
 * (`olive dark/11`), the value inline after the label (`Build: Production`).
 * every line always renders a non-empty value; see
 * `../model/technical-info.ts` for the fallbacks that guarantee it.
 */
export function TechnicalInfo({ labels, testID }: TechnicalInfoProps) {
  const info = readBuildMetadata();

  const lines: TechnicalInfoLine[] = [
    { label: labels.build, value: info.buildChannel },
    { label: labels.appVersion, value: info.version },
    { label: labels.buildNumber, value: info.buildNumber },
    { label: labels.sha, value: info.commitHash },
  ];

  return (
    <View style={styles.container} testID={testID}>
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
