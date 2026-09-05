import type { ComponentProps, ReactElement } from 'react';
import { cloneElement } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * the composition Analyze's, History's, and the Preset list's empty states
 * share: an illustration, plus a centred heading and description. earned as
 * a shared component per docs/conventions/directory-structure.md's bar for
 * `src/shared/`: two real callers, both built in the same change that first
 * wrote this file.
 *
 * **the illustration is the caller's own, not this component's** — a caller
 * whose empty state needs a different picture (`@/features/presets/ui/
 * preset-list-screen/aa-corner-illustration.tsx`) hands this component that
 * picture in place of `./shark-illustration.tsx`. The element is cloned
 * with this component's own `illustration` local testID rather than
 * requiring every caller to compute that same "only when the root has one"
 * condition for itself — the identical reasoning `heading` and `description`
 * below already apply to their own local testIDs.
 *
 * renders no action of its own — neither Analyze nor History, its two
 * original callers, needs one; Analyze's own persistent floating action
 * button (`src/features/evaluations/ui/new-player-fab/new-player-fab.tsx`)
 * lives outside this component entirely.
 *
 * the description is authored in the design as a single non-wrapping line;
 * this component does not enforce that — it centres the text and lets it
 * wrap, since longer real copy's wrap behaviour is not something the design
 * specifies either way.
 */
export function EmptyState({
  illustration,
  heading,
  description,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  illustration: ReactElement<{ testID?: string }>;
  heading: string;
  description: string;
}) {
  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the empty state's own centred layout; every
    // other rest prop spreads last, letting a caller override an explicit
    // default — unlike `testID`, which is consumed rather than left in
    // `props`.
    <View style={[styles.root, style]} testID={testID} {...props}>
      {cloneElement(illustration, { testID: testID ? 'illustration' : undefined })}
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
