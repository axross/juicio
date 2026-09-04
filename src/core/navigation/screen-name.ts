/**
 * maps `expo-router`'s own `usePathname()` value to this project's own,
 * fixed screen name — the same name docs/specs/navigation.md's nav bar
 * table gives each screen (`Analyze`, `History`, `Presets`, `Settings`,
 * `Feedback`, `Language`, `Theme`, `Analytics`), used verbatim as the
 * `Screen Viewed` event's `screenName` property
 * (`@/core/instrumentation/analytics.ts`).
 *
 * deliberately **not** the live-translated nav bar title
 * (`useTranslation('navigation')`/`useTranslation('settings')`): a screen
 * name is an analytics dimension, and Amplitude's own Data Planning
 * Playbook convention this project follows (see
 * docs/conventions/product-analytics.md) reports it as "this project's own
 * screen name, unchanged" — the same fixed value whether the device is set
 * to English or Japanese, so the same screen never fragments into two
 * dashboard values by device language. `tab-test-ids.ts` beside this module
 * hardcodes this app's own four routes the same way, for a different
 * consumer (Maestro's e2e `testID`s) — see that module's own doc comment
 * and docs/conventions/directory-structure.md's note that `core/navigation/`
 * hardcoding this app's own routes is no less `core/` material for it.
 *
 * returns `undefined` for a pathname this app doesn't recognize (an
 * intermediate value during a route transition, or a future route this
 * mapping hasn't been extended for yet) — `use-track-screen-views.ts` skips
 * tracking entirely in that case rather than sending a name that isn't
 * really one of this app's own screens.
 */
const SCREEN_NAMES: Record<string, string> = {
  '/': 'Analyze',
  '/history': 'History',
  '/presets': 'Presets',
  '/settings': 'Settings',
  '/feedback': 'Feedback',
  '/settings-language': 'Language',
  '/settings-theme': 'Theme',
  '/settings-analytics': 'Analytics',
};

export function resolveScreenName(pathname: string): string | undefined {
  return SCREEN_NAMES[pathname];
}
