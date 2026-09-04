/**
 * route name → the accessibility identifier / testID that the Maestro e2e
 * flows (`e2e/flows/SCN-*.yaml`) select and assert tabs by (e.g. `tapOn: {
 * id: 'tab-bar-item-analyze' }`). Shared between the custom Android/
 * other-platform tab bar (`./tab-bar.tsx`'s `TAB_CONFIG`) and iOS's
 * `NativeTabs`-based navigator (`./tab-navigator.ios.tsx`), so the two
 * platform implementations of the same four tabs cannot silently drift apart
 * on a value an e2e flow matches byte-for-byte.
 */
export const TAB_TEST_IDS = {
  index: 'tab-bar-item-analyze',
  history: 'tab-bar-item-history',
  presets: 'tab-bar-item-presets',
  settings: 'tab-bar-item-settings',
} as const;
