import { router } from 'expo-router';

import { AnalyticsScreen } from '@/features/settings/ui/analytics-screen';

/**
 * the `Analytics` child screen's route entry point: a sibling of
 * `feedback.tsx`, `settings-language.tsx`, and `settings-theme.tsx`,
 * outside the `(tabs)` group — being outside that group is what hides the
 * tab bar, exactly as it does for those three (issue #211).
 */
export default function SettingsAnalytics() {
  return <AnalyticsScreen onBack={() => router.back()} />;
}
