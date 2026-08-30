import type { ReactNode } from 'react';
import { PixelRatio, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type SettingsSectionProps = {
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
  /** also seeds the description's own testID, as `${testID}-description`,
   * whenever `description` is given — see `language-screen.test.tsx`'s
   * "shows no description" case for why that derivation, rather than a
   * separate `descriptionTestID` prop, is what makes that assertion able to
   * fail (issue #76). */
  testID?: string;
};

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
export function SettingsSection({ heading, description, children, testID }: SettingsSectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      {heading ? <Text style={styles.heading}>{heading}</Text> : null}
      <View style={styles.card}>{children}</View>
      {description ? (
        <Text style={styles.description} testID={testID ? `${testID}-description` : undefined}>
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
