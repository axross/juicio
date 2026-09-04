import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/core/navigation/tab-bar';

/**
 * the default (non-iOS) tab navigator: today's existing custom `TabBar`,
 * unchanged. This is the same `<Tabs>` tree `src/app/(tabs)/_layout.tsx`
 * rendered directly before issue #165 — moved here verbatim, not rewritten,
 * so every non-iOS platform keeps the exact same behaviour it had before
 * this file existed. See `./tab-navigator.ios.tsx`'s own doc comment for why
 * iOS gets a different tree: Metro resolves *this* file on every platform
 * except iOS, where the `.ios.tsx` sibling takes over — no platform branch
 * lives in `_layout.tsx` itself.
 */
export function TabNavigator() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="presets" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
