import { router } from 'expo-router';

import { LanguageScreen } from '@/features/settings/ui/language-screen';

/**
 * the `Language` child screen's route entry point: a sibling of
 * `feedback.tsx`, outside the `(tabs)` group — being outside that group is
 * what hides the tab bar, exactly as it does for `feedback` (issue #76).
 */
export default function SettingsLanguage() {
  return <LanguageScreen onBack={() => router.back()} />;
}
