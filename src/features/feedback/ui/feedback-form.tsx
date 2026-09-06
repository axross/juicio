import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { SpeechBubbleIcon } from '@/core/icons/speech-bubble-icon';
import { SubmitBar } from '@/shared/ui/submit-bar/submit-bar';

import { useKeyboardVisible } from '../adapter/use-keyboard-visible';
import type { FeedbackDraft } from '../model/feedback-draft';
import { sendFeedback } from '../usecase/send-feedback';
import { TextField } from './text-field';

const EMPTY_DRAFT: FeedbackDraft = { message: '', name: '', email: '' };

type SendErrorReason = 'unavailable' | 'sendFailed';

/**
 * the Feedback screen's body: the form (with an optional error banner
 * above it), or the completion state that replaces both the form and the
 * pinned submit bar — see docs/specs/settings.md's Feedback section.
 *
 * the submit bar is omitted entirely, not merely repositioned, while a
 * keyboard is open (`useKeyboardVisible`), so a user typing the multi-line
 * Message field — whose return key inserts a newline rather than
 * dismissing anything — needs a way to reach it again without ever losing
 * that ability. two independent paths close the keyboard: dragging the
 * scroll view (`keyboardDismissMode="on-drag"`), and tapping anywhere in it
 * that is not the focused field, which is `ScrollView`'s own documented
 * behaviour whenever `keyboardShouldPersistTaps` is left at its default —
 * it blurs the focused input on release whenever the touch target isn't
 * that input itself. `keyboardShouldPersistTaps="never"` below states that
 * default explicitly rather than leaving it implicit.
 *
 * **`scrollOffset`, when a caller passes one, is this form's own scroll
 * view's live offset**, written on the UI thread through
 * `useAnimatedScrollHandler` — this project's own precedent
 * (`@/shared/ui/bottom-sheet/bottom-sheet.tsx`'s `BottomSheetBody`) for a
 * shared value written from a scroll handler rather than read through a
 * JS-thread round trip. `@/app/feedback.tsx`, this form's only real
 * caller, hands it the one shared value it also gives `NavBar` — see that
 * component's own doc comment (issue #260) for the scroll-linked
 * translucency+blur contract this feeds. optional because
 * `feedback-form.test.tsx` renders this form with nothing to scroll to.
 */
export function FeedbackForm({
  scrollOffset,
  style,
  ...props
}: ComponentProps<typeof View> & {
  scrollOffset?: SharedValue<number>;
}) {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = useState<FeedbackDraft>(EMPTY_DRAFT);
  const [messageError, setMessageError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [sendError, setSendError] = useState<SendErrorReason | null>(null);
  const [sent, setSent] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const handleScroll = useAnimatedScrollHandler((event) => {
    if (scrollOffset) {
      // `react-hooks/immutability` flags this the same way it flags
      // `@/shared/ui/bottom-sheet/bottom-sheet.tsx`'s own write to a shared
      // value it receives rather than creates locally (there, through
      // context; here, as a caller-supplied prop) — a false positive in
      // both cases: mutating a Reanimated shared value's `.value` like
      // this is how a write actually reaches the UI thread, whichever hook
      // handed the shared value to this component.
      // eslint-disable-next-line react-hooks/immutability
      scrollOffset.value = event.contentOffset.y;
    }
  });

  const handleSubmit = useCallback(() => {
    const result = sendFeedback(draft);

    switch (result.status) {
      case 'sent':
        setMessageError(false);
        setEmailError(false);
        setSendError(null);
        setSent(true);
        return;
      case 'invalid': {
        const messageInvalid = result.reason === 'emptyMessage';
        setMessageError(messageInvalid);
        setEmailError(!messageInvalid);
        setSendError(null);
        // announces the validation failure directly, since focus stays on
        // Send rather than moving to the field — see
        // docs/conventions/accessibility.md.
        AccessibilityInfo.announceForAccessibility(
          messageInvalid ? t('feedback.messageRequired') : t('feedback.emailInvalid'),
        );
        return;
      }
      case 'unavailable':
        setMessageError(false);
        setEmailError(false);
        setSendError('unavailable');
        return;
      case 'failed':
        setMessageError(false);
        setEmailError(false);
        setSendError('sendFailed');
        return;
    }
  }, [draft, t]);

  if (sent) {
    return (
      // `FeedbackForm` renders one of two roots depending on `sent` — this
      // one and `styles.root` below — and a caller's `style` has to reach
      // whichever branch actually renders, or it would work while the form
      // is showing and silently do nothing once it flips to `sent`.
      <View style={[styles.sentRoot, style]} testID="feedback-sent" {...props}>
        <Text style={styles.sentHeading}>{t('feedback.sentHeading')}</Text>
        <Text style={styles.sentBody}>{t('feedback.sentBody')}</Text>
      </View>
    );
  }

  return (
    // see the `sent` branch above for why `style` is merged onto this root
    // too, and in the same way; this root carries no `testID` of its own,
    // so every rest prop, `style` included, spreads last with nothing else
    // to override.
    <View style={[styles.root, style]} {...props}>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="never"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        testID="feedback-scroll"
      >
        <Text style={styles.intro} testID="feedback-intro">
          {t('feedback.intro')}
        </Text>

        {sendError !== null ? (
          <View style={styles.errorBanner} testID="feedback-error-banner">
            <Text style={styles.errorBannerText}>{t(`feedback.${sendError}`)}</Text>
          </View>
        ) : null}

        <TextField
          label={t('feedback.messageLabel')}
          placeholder={t('feedback.messagePlaceholder')}
          error={messageError ? t('feedback.messageRequired') : undefined}
          value={draft.message}
          // clears on any change rather than re-checking blankness, per the
          // high-fidelity-ui-design skill's re-validate-only-after-a-shown-
          // error rule — stays cleared until the next Send press
          // re-validates the draft. the Email field below gets the same
          // treatment.
          onChangeText={(message) => {
            setDraft((prev) => ({ ...prev, message }));
            setMessageError(false);
          }}
          multiline
          testID="feedback-message-input"
        />
        <TextField
          label={t('feedback.nameLabel')}
          placeholder={t('feedback.namePlaceholder')}
          value={draft.name}
          onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
          testID="feedback-name-input"
        />
        <TextField
          label={t('feedback.emailLabel')}
          placeholder={t('feedback.emailPlaceholder')}
          hint={emailError ? undefined : t('feedback.emailHint')}
          error={emailError ? t('feedback.emailInvalid') : undefined}
          value={draft.email}
          // same clear-on-any-change treatment as the Message field above.
          onChangeText={(email) => {
            setDraft((prev) => ({ ...prev, email }));
            setEmailError(false);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="feedback-email-input"
        />
      </Animated.ScrollView>

      {keyboardVisible ? null : (
        <SubmitBar
          label={t('feedback.submit')}
          Icon={SpeechBubbleIcon}
          onPress={handleSubmit}
          testID="feedback-submit-bar"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.space.x16,
    gap: theme.space.x24,
  },
  intro: {
    ...theme.typography.paragraph,
    color: theme.colors.text.neutral.low,
  },
  errorBanner: {
    padding: theme.space.x16,
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.destructive.interactive,
    backgroundColor: theme.colors.background.destructive.subtle,
  },
  errorBannerText: {
    ...theme.typography.paragraph,
    color: theme.colors.text.destructive.high,
  },
  sentRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.x12,
    paddingHorizontal: theme.space.x32,
  },
  sentHeading: {
    ...theme.typography.heading,
    color: theme.colors.text.neutral.high,
    textAlign: 'center',
  },
  sentBody: {
    ...theme.typography.paragraph,
    color: theme.colors.text.neutral.low,
    textAlign: 'center',
  },
}));
