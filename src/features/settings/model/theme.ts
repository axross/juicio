import { z } from 'zod';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/** Settings' `Theme` section offers exactly these three. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const themePreferenceSchema: z.ZodType<ThemePreference> = z.enum(THEME_PREFERENCES);

/**
 * Coerces a raw AsyncStorage read into a `ThemePreference`, defaulting to
 * `system` — this project's own default — for both "nothing was ever
 * stored" and "what was stored is corrupt or names something this app
 * doesn't offer". Unlike language (see `./language.ts`), theme's default
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
 * What applying a `ThemePreference` means to react-native-unistyles:
 * `system` leaves adaptive theming on (Unistyles then follows the OS
 * itself), and `light`/`dark` turn adaptive theming off and pin the runtime
 * to that theme explicitly. Kept as a plain data mapping — the Unistyles
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
 * The inverse of `resolveThemeInstruction`: derives which `Theme` radio row
 * should read as selected from Unistyles' own runtime state
 * (`useUnistyles().rt.hasAdaptiveThemes` / `.themeName`), rather than the
 * Settings UI tracking the preference in a second, separate piece of state
 * that could drift from what Unistyles is actually doing. A runtime not
 * reporting a theme name while adaptive theming is off is defensively
 * treated as `dark` — this project's own default theme — rather than
 * `undefined`, which no radio row could ever render as selected.
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
