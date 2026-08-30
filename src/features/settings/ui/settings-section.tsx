import type { ComponentProps, ReactNode } from 'react';
import { PixelRatio, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * a Settings section: an optional 16px-medium heading in `text.neutral.low`
 * (`olive dark/11`), 16px left padding, followed by its card — rows inset
 * 16px from each screen edge with a 1px flex gap between them, letting the
 * screen background through as the divider (no border is drawn) — and an
 * optional description below the card, at the same 16px inset.
 *
 * the card's `gap` is snapped onto the device's own physical pixel grid
 * with `PixelRatio.roundToNearestPixel`. Snapping the gap is what keeps
 * consecutive rows rendering an identical gap between them at every device
 * pixel density, including a non-integral one: for a snapped gap whose
 * product with the device's pixel ratio is a whole number of physical
 * pixels, every row pair's rounded edges land that same whole number apart,
 * whatever dp offset the row above happens to start at — a non-integral-
 * height heading above the card, or a row grown past its snapped minimum by
 * its own content, included. `settings-row.tsx` snaps each row's own
 * `minHeight` too, for a different reason — see that module's comment.
 */
export function SettingsSection({
  heading,
  description,
  children,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** the Settings screen's three sections all pass this; a child screen's
   * lone card does not — its nav bar already carries the setting's name, so
   * repeating it as a heading above the card would be redundant. */
  heading?: string;
  /** the `Theme` child screen's helper text, 16dp below the card, in the
   * `caption` role in `text.neutral.low` — the design file's own
   * `Calculation Accuracy` helper-text pattern (node `478:26900`), reused
   * rather than invented (issue #76). Every other section and screen omits
   * this. */
  description?: string;
  children: ReactNode;
  /** the description, when rendered, carries the local, self-describing
   * `testID` `'description'` rather than one derived from this section's
   * own `testID` (docs/conventions/component-contracts.md's "A Non-Root
   * Child Gets Its Own Local testID") — findable by scoping through this
   * section's own `testID` (`within()` in a unit test, `childOf` in a
   * Maestro flow), never by concatenation. it still only carries a
   * `testID` at all when this section's own `testID` is given, the same
   * condition as before — see `language-screen.test.tsx`'s "shows no
   * description" case, which asserts the description element itself is
   * absent whenever `description` is omitted, regardless of `testID`. */
  testID?: string;
}) {
  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.section` first, the caller's last, so a
    // caller extending it doesn't wipe the section's own `gap`; every other
    // rest prop spreads last, letting a caller override an explicit
    // default — unlike `testID`, which is consumed rather than left in
    // `props`.
    <View style={[styles.section, style]} testID={testID} {...props}>
      {heading ? <Text style={styles.heading}>{heading}</Text> : null}
      <View style={styles.card}>{children}</View>
      {description ? (
        <Text style={styles.description} testID={testID ? 'description' : undefined}>
          {description}
        </Text>
      ) : null}
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
    gap: PixelRatio.roundToNearestPixel(theme.borderWidth.base),
  },
  description: {
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
    paddingHorizontal: theme.space.x16,
  },
}));
