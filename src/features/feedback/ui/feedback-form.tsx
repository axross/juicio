import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useKeyboardVisible } from '../adapter/use-keyboard-visible';
import type { FeedbackDraft } from '../model/feedback-draft';
import { canSubmitFeedback, sendFeedback } from '../usecase/send-feedback';
import { SubmitBar } from './submit-bar';
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
 * verified against `ScrollView.js`'s `_handleResponderRelease`, which blurs
 * the focused input on release whenever the touch target isn't that input
 * itself. `keyboardShouldPersistTaps="never"` below states that default
 * explicitly rather than leaving it implicit.
 */
export function FeedbackForm() {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = useState<FeedbackDraft>(EMPTY_DRAFT);
  const [emailError, setEmailError] = useState(false);
  const [sendError, setSendError] = useState<SendErrorReason | null>(null);
  const [sent, setSent] = useState(false);
  const keyboardVisible = useKeyboardVisible();

  const handleSubmit = useCallback(() => {
    const result = sendFeedback(draft);

    switch (result.status) {
      case 'sent':
        setEmailError(false);
        setSendError(null);
        setSent(true);
        return;
      case 'invalid':
        setEmailError(result.reason === 'invalidEmail');
        setSendError(null);
        return;
      case 'unavailable':
        setEmailError(false);
        setSendError('unavailable');
        return;
      case 'failed':
        setEmailError(false);
        setSendError('sendFailed');
        return;
    }
  }, [draft]);

  if (sent) {
    return (
      <View style={styles.sentRoot} testID="feedback-sent">
        <Text style={styles.sentHeading}>{t('feedback.sentHeading')}</Text>
        <Text style={styles.sentBody}>{t('feedback.sentBody')}</Text>
      </View>
    );
  }

  const canSubmit = canSubmitFeedback(draft.message);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="never"
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
          value={draft.message}
          onChangeText={(message) => setDraft((prev) => ({ ...prev, message }))}
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
          onChangeText={(email) => setDraft((prev) => ({ ...prev, email }))}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="feedback-email-input"
        />
      </ScrollView>

      {keyboardVisible ? null : (
        <SubmitBar
          label={t('feedback.submit')}
          onPress={handleSubmit}
          disabled={!canSubmit}
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
