import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HourglassIllustration } from './hourglass-illustration';
import { SharkIllustration } from './shark-illustration';

/**
 * the composition Analyze's, History's, and Presets' empty states share:
 * an illustration, plus a centred heading and description. earned as a
 * shared component per docs/conventions/directory-structure.md's bar for
 * `src/shared/`: two real callers, both built in the same change that
 * first wrote this file.
 *
 * renders no action of its own — neither Analyze nor History, its two
 * callers, needs one; Analyze's own persistent floating action button
 * (`src/features/evaluations/ui/new-player-fab/new-player-fab.tsx`) lives
 * outside this component entirely.
 *
 * the description is authored in the design as a single non-wrapping line;
 * this component does not enforce that — it centres the text and lets it
 * wrap, since longer real copy's wrap behaviour is not something the design
 * specifies either way.
 *
 * `illustration` chooses which illustration renders, defaulting to `shark`
 * so every caller written before this prop existed is unaffected
 * (issue #263) — History is this project's first caller to choose
 * `hourglass`.
 */
export function EmptyState({
  heading,
  description,
  illustration = 'shark',
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  heading: string;
  description: string;
  illustration?: 'shark' | 'hourglass';
}) {
  const Illustration = illustration === 'hourglass' ? HourglassIllustration : SharkIllustration;

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the empty state's own centred layout; every
    // other rest prop spreads last, letting a caller override an explicit
    // default — unlike `testID`, which is consumed rather than left in
    // `props`.
    <View style={[styles.root, style]} testID={testID} {...props}>
      <Illustration testID={testID ? 'illustration' : undefined} />
      <View style={styles.textBlock}>
        <Text style={styles.heading} testID={testID ? 'heading' : undefined}>
          {heading}
        </Text>
        <Text style={styles.description} testID={testID ? 'description' : undefined}>
          {description}
        </Text>
      </View>
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
