import type { ComponentProps, ComponentType } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { IconProps } from '@/core/icons/icon-props';
import { Button } from '@/shared/ui/button/button';

/**
 * a pinned submit bar: `background.neutral.subtle` ground, a top divider,
 * the bottom safe-area inset, and a full-width `Button`. Built for the
 * Feedback screen's own Send action; promoted here from
 * `src/features/feedback/ui/submit-bar.tsx` once the Preset editor screen
 * (issue #177) became a second real caller needing the identical bar for
 * its own Save action — the same `src/shared/ui/` promotion bar
 * `button.tsx`'s own doc comment already describes for itself. Whichever
 * screen renders this owns whether it renders at all — `FeedbackForm`
 * omits it entirely while the keyboard is open, not merely repositioning
 * it — so this component only ever draws the bar itself.
 *
 * **`loading` is `Button`'s own prop, passed straight through** — see that
 * component's own doc comment for the in-progress-save spinner it draws
 * and the repeat-press it ignores; this component adds no state of its
 * own for it.
 *
 * the `Button` is stretched full width by passing
 * `style={{ alignSelf: 'stretch' }}` (below, as part of this component's
 * own `button` style) through `Button`'s own caller-`style` prop, which it
 * merges after its own styles — no change to `button.tsx` needed.
 */
export function SubmitBar({
  label,
  Icon,
  onPress,
  loading = false,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  label: string;
  /** rendered at 24px on the pill, per `Button`'s own `Icon` contract. */
  Icon: ComponentType<IconProps>;
  onPress: () => void;
  /** true while the action this bar triggers is in flight. */
  loading?: boolean;
}) {
  return (
    // `style` is pulled from the rest spread and merged last via array
    // syntax — `styles.root` first, the caller's last — so extending it
    // doesn't wipe this bar's own border and safe-area padding; every
    // other rest prop spreads last (default ordering), letting a caller
    // override a default.
    //
    // `testID` is consumed rather than left in `props`: this component
    // forwards it to its own `Button`, not to this root, so it stays
    // explicit here instead of riding the spread.
    <View style={[styles.root, style]} {...props}>
      <Button
        label={label}
        Icon={Icon}
        onPress={onPress}
        loading={loading}
        style={styles.button}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    borderTopWidth: theme.borderWidth.base,
    borderTopColor: theme.colors.border.neutral.subtle,
    backgroundColor: theme.colors.background.neutral.subtle,
    paddingHorizontal: theme.space.x16,
    paddingTop: theme.space.x16,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.x16),
  },
  button: {
    alignSelf: 'stretch',
  },
}));
