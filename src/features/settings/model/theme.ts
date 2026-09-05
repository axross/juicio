import { z } from 'zod';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/** Settings' `Theme` section offers exactly these three. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const themePreferenceSchema: z.ZodType<ThemePreference> = z.enum(THEME_PREFERENCES);

/**
 * coerces a raw AsyncStorage read into a `ThemePreference`, defaulting to
 * `system` — this project's own default — for both "nothing was ever
 * stored" and "what was stored is corrupt or names something this app
 * doesn't offer". unlike language (see `./language.ts`), theme's default
 * is a fixed, named value rather than something resolved from device
 * state, so this returns a concrete `ThemePreference` rather than
 * `undefined`.
 */
export function resolveStoredTheme(raw: string | null | undefined): ThemePreference {
  if (raw === null || raw === undefined) {
    return 'system';
  }

  const result = themePreferenceSchema.safeParse(raw);

  return result.success ? result.data : 'system';
}

/**
 * what applying a `ThemePreference` means to react-native-unistyles:
 * `system` leaves adaptive theming on (Unistyles then follows the OS
 * itself), and `light`/`dark` turn adaptive theming off and pin the runtime
 * to that theme explicitly. kept as a plain data mapping — the Unistyles
 * calls that carry it out live in `../adapter/apply-theme-instruction.ts`,
 * since importing the Unistyles runtime here would make this module an
 * adapter concern instead of a model one (docs/conventions/
 * directory-structure.md), and would pull its native module into this
 * function's own unit test — see `src/core/theme/tokens.ts` for the same
 * hazard.
 */
export type ThemeInstruction = { adaptive: true } | { adaptive: false; theme: 'light' | 'dark' };

export function resolveThemeInstruction(preference: ThemePreference): ThemeInstruction {
  if (preference === 'system') {
    return { adaptive: true };
  }

  return { adaptive: false, theme: preference };
}

/**
 * the inverse of `resolveThemeInstruction`: maps Unistyles' own runtime state
 * (`useUnistyles().rt.hasAdaptiveThemes` / `.themeName`) to a
 * `ThemePreference`. `useThemePreference` (`../adapter/use-theme-preference.ts`)
 * calls this on every render, as the fallback it returns whenever its
 * Zustand store holds no tapped preference yet — read by both the `Theme`
 * child screen and the Settings screen's own `Theme` row. a runtime-derived
 * value is only ever that pre-tap fallback, never the source of truth once
 * something has been tapped: a same-theme transition only touches Unistyles'
 * `ADAPTIVETHEMES` dependency, which no mounted `StyleSheet.create` factory
 * reads, so Unistyles' change notification never fires and a value derived
 * from the runtime alone would never move for that tap — which is why a
 * tap writes the store directly instead of relying on this function to
 * notice it. a runtime not reporting a theme name while adaptive theming is
 * off is defensively treated as `dark` — this project's own default theme —
 * rather than `undefined`, which no radio row could ever render as selected.
 */
export function resolveThemePreferenceFromRuntime(
  hasAdaptiveThemes: boolean,
  themeName: string | undefined,
): ThemePreference {
  if (hasAdaptiveThemes) {
    return 'system';
  }

  return themeName === 'light' ? 'light' : 'dark';
}

/**
 * decides which theme (if any) the runtime must be forced to, on an OS
 * colour-scheme change, so that `System` keeps following it. the
 * `adapter/`-layer hook that calls this is what applies the answer, and
 * this function stays pure so the decision itself is testable without one.
 *
 * returns `undefined` — "do nothing" — in exactly the cases where a write
 * would be wrong or redundant: adaptive theming is off (the preference is
 * pinned to `light`/`dark`, and the app must not follow the OS at all),
 * React Native reports no scheme (nothing to follow), or the runtime's
 * current theme name already matches the reported scheme (Unistyles' own
 * listener already did its job, so forcing it again would be a no-op
 * write). otherwise it returns the scheme itself, which is also the theme
 * name to force — this project ships exactly the two themes React Native's
 * `ColorSchemeName` can report.
 */
export function resolveForcedThemeFromColorScheme(
  hasAdaptiveThemes: boolean,
  currentThemeName: string | undefined,
  colorScheme: 'light' | 'dark' | null | undefined,
): 'light' | 'dark' | undefined {
  if (!hasAdaptiveThemes || !colorScheme) {
    return undefined;
  }

  return currentThemeName === colorScheme ? undefined : colorScheme;
}
