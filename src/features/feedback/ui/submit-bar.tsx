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
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  styles.useVariants({ disabled });

  return (
    <View style={styles.root}>
      <Button
        label={label}
        Icon={SpeechBubbleIcon}
        onPress={onPress}
        disabled={disabled}
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
    variants: {
      // `Button` draws no disabled visual of its own (it is #70's
      // byte-identical copy, left untouched — see the header comment
      // above); dimming it here, as a caller-supplied style, keeps that
      // constraint while still giving Send a visible disabled state.
      disabled: {
        true: { opacity: 0.5 },
        false: {},
        default: {},
      },
    },
  },
}));
