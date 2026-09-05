import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SpeechBubbleIcon } from '@/core/icons/speech-bubble-icon';
import { Button } from '@/shared/ui/button/button';

/**
 * the Feedback screen's pinned submit bar: `background.neutral.subtle`
 * ground, a top divider, the bottom safe-area inset, and a full-width
 * `Button`. `FeedbackForm` owns whether this renders at all — it is
 * omitted entirely while the keyboard is open, not merely repositioned —
 * so this component only ever draws the bar itself.
 *
 * Send stays pressable at all times — see the high-fidelity-ui-design skill's
 * disabled-vs-validate-on-press rule — so this component carries no
 * `disabled` prop; `FeedbackForm` validates the draft on press instead of
 * gating this control. A future in-flight-submission or genuinely-unavailable
 * state, if this screen ever needs one, is what would bring a `disabled` prop
 * back.
 *
 * the `Button` is stretched full width by passing
 * `style={{ alignSelf: 'stretch' }}` (below, as part of this component's
 * own `button` style) through `Button`'s own caller-`style` prop, which it
 * merges after its own styles — no change to `button.tsx` needed. no icon
 * in `src/core/icons/` reads as "send"; `SpeechBubbleIcon` — the same
 * speech-bubble `About`'s `Feedback` row already uses — is the closest
 * available match for a feedback-submission action.
 */
export function SubmitBar({
  label,
  onPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  label: string;
  onPress: () => void;
}) {
  return (
    // `style` is pulled out of the rest spread and merged last via array
    // syntax, this bar's own `styles.root` first, the caller's last, so a
    // caller extending it doesn't wipe the bar's own border and safe-area
    // padding; every other rest prop spreads last (default ordering),
    // letting a caller override an explicit default.
    // `testID` is consumed rather than left in `props`: this component
    // forwards it to its own `Button`, not to this root, so it stays
    // explicit here instead of riding the spread.
    <View style={[styles.root, style]} {...props}>
      <Button
        label={label}
        Icon={SpeechBubbleIcon}
        onPress={onPress}
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
