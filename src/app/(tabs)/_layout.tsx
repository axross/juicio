import { TabNavigator } from '@/core/navigation/tab-navigator';

/**
 * the four-tab shell. tab order is fixed — Analyze, History, Presets,
 * Settings — with Analyze as the landing tab (`index`). Which navigator
 * actually renders is Metro's own platform-extension call, not a branch
 * here: `../../core/navigation/tab-navigator.ios.tsx` on iOS,
 * `../../core/navigation/tab-navigator.tsx` everywhere else — see docs/
 * decisions/2026-09-04-render-the-ios-tab-bar-with-expo-routers-native-tabs.md
 * and
 * docs/decisions/2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md
 * for why each platform renders what it does.
 */
export default function TabLayout() {
  return <TabNavigator />;
}
