import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

const SLOT_COUNT = 5;
// a playing card's own measured aspect ratio, not a spacing decision — the
// fixed-element-dimension exemption react-component-styling documents, the
// same one EmptyState's button height and NativeJobDemo's spinner already
// take rather than normalizing onto the 4/8px grid.
const SLOT_WIDTH = 48;
const SLOT_HEIGHT = 75;

const SLOT_INDICES = Array.from({ length: SLOT_COUNT }, (_, index) => index);

/**
 * the Analyze screen's board: five empty, dashed card slots in a centred
 * row, read from the design's `I600:26731;600:26661`
 * (docs/specs/equity-analysis.md). presentational only — no card
 * selection and no populated state; tapping a slot does nothing. the card
 * input sheet now opens from `+ New Player` (see
 * `src/app/(tabs)/index.tsx`'s own doc comment), but nothing yet reads its
 * result into a slot here — the equity engine and the players list behind
 * a populated board are not part of this change.
 *
 * exposes one accessibility label for the whole row rather than five: five
 * identical, unlabelled stops would be noise to a screen-reader user
 * without telling them anything a sighted user does not already see at a
 * glance, so the five slots themselves carry no label or role of their
 * own.
 *
 * shares the nav bar's own `background.neutral.subtle` background and
 * draws the `Sheet` shadow at its own bottom edge, so the nav bar above it
 * and this board read as one unbroken top band — the design's own
 * presentation (option A of the exhibit at issue #64) — with `NavBar`'s
 * own shadow suppressed by its caller instead of drawn twice. rendered
 * outside the Analyze screen's `ScrollView`, so the board stays pinned
 * while the players list beneath it scrolls.
 */
export function Board({
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  testID?: string;
}) {
  const { t } = useTranslation('analyze');

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the board's own row layout/shadow; every
    // other rest prop spreads last, letting a caller override an explicit
    // default (`accessibilityRole`, say) — unlike `testID`, which is
    // consumed rather than left in `props`.
    <View
      style={[styles.root, style]}
      accessible
      accessibilityLabel={t('board.accessibilityLabel')}
      testID={testID}
      {...props}
    >
      {SLOT_INDICES.map((index) => (
        <View key={index} style={styles.slot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.x16,
    paddingVertical: theme.space.x16,
    backgroundColor: theme.colors.background.neutral.subtle,
    boxShadow: theme.effects.sheet,
  },
  slot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
}));
