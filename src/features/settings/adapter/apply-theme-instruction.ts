import { UnistylesRuntime } from 'react-native-unistyles';

import type { ThemeInstruction } from '../model/theme';

/**
 * carries out a `ThemeInstruction` (see `../model/theme.ts`) against the
 * running Unistyles runtime: `system` leaves adaptive theming on —
 * Unistyles' own default, configured in `src/core/theme/unistyles.ts` — and
 * `light`/`dark` turn it off and pin the runtime to that theme. the
 * Unistyles runtime import is what makes this an adapter concern rather
 * than a model one, and is why this function, unlike the pure
 * `resolveThemeInstruction` it consumes, has no unit test of its own — see
 * `src/core/theme/tokens.ts` for the same native-module hazard.
 */
export function applyThemeInstruction(instruction: ThemeInstruction): void {
  if (instruction.adaptive) {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }

  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(instruction.theme);
}
