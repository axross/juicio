import { router } from 'expo-router';

import { ThemeScreen } from '@/features/settings/ui/theme-screen';

/**
 * the `Theme` child screen's route entry point: a sibling of
 * `feedback.tsx`, outside the `(tabs)` group — being outside that group is
 * what hides the tab bar, exactly as it does for `feedback` (issue #76).
 */
export default function SettingsTheme() {
  return <ThemeScreen onBack={() => router.back()} />;
}
