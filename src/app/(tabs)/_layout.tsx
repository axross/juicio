import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/core/navigation/tab-bar';

/**
 * The four-tab shell. Tab order is fixed — Analyze, History, Presets,
 * Settings — with Analyze as the landing tab (`index`). `headerShown: false`
 * because each screen carries its own `NavBar`; the design's tab bar cannot
 * be expressed through tab-bar options (its 90px height, per-cell active
 * hairline, and `Sheet (Inverted)` shadow), so `tabBar` renders it directly
 * — see docs' Alternatives Considered for why the JS `Tabs` navigator was
 * chosen over native tabs and `expo-router/ui`.
 */
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="presets" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
