/**
 * the primitive Radix Colors ramps this project uses, re-exposed per theme
 * as step-indexed objects (steps 0 through 12) rather than Radix's own
 * `{scale}{step}` key naming, so `tokens.ts` can map a ramp onto semantic
 * roles by numeric step.
 *
 * this is the only module that imports `@radix-ui/colors`. `tokens.ts`
 * indexes these ramps by step, which is how it builds the tier/slot mapping;
 * a component (`src/app/…` and up) consumes semantic role names only,
 * through `tokens.ts`, never a step or a scale name directly.
 *
 * step 0 is this project's own addition below Radix's step 1: the stronger
 * app/page background, pure white in the light scheme and pure black in the
 * dark one. it is not part of any Radix scale.
 *
 * only the sRGB exports are imported. `@radix-ui/colors` also ships `*P3*`
 * variants for wide-gamut displays; this project does not use them — mobile
 * native has no colour-gamut media query, and wide-gamut authoring here
 * would be a whole-app opt-in this project has not made.
 */
import {
  blackA as blackAlphaScale,
  blue as blueLightScale,
  blueDark as blueDarkScale,
  cyan as cyanLightScale,
  cyanDark as cyanDarkScale,
  grass as grassLightScale,
  grassDark as grassDarkScale,
  jade as jadeLightScale,
  jadeDark as jadeDarkScale,
  lime as limeLightScale,
  limeA as limeLightAlphaScale,
  limeDark as limeDarkScale,
  limeDarkA as limeDarkAlphaScale,
  olive as oliveLightScale,
  oliveA as oliveLightAlphaScale,
  oliveDark as oliveDarkScale,
  oliveDarkA as oliveDarkAlphaScale,
  orange as orangeLightScale,
  orangeDark as orangeDarkScale,
  ruby as rubyLightScale,
  rubyA as rubyLightAlphaScale,
  rubyDark as rubyDarkScale,
  rubyDarkA as rubyDarkAlphaScale,
  tomato as tomatoLightScale,
  tomatoDark as tomatoDarkScale,
} from '@radix-ui/colors';

const RAMP_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

type RampStep = (typeof RAMP_STEPS)[number];

/** a 13-step ramp: this project's own step 0, plus Radix's steps 1–12. */
export type Ramp = Readonly<Record<RampStep | 0, string>>;

/** the same ramp, once per theme. */
export type ThemeRamp = Readonly<{ light: Ramp; dark: Ramp }>;

const APP_BACKGROUND_LIGHT = '#FFFFFF';
const APP_BACKGROUND_DARK = '#000000';

/**
 * reads a Radix scale's `{keyPrefix}1`…`{keyPrefix}12` keys into a
 * step-indexed ramp. Radix keys every scale — light, dark, and alpha alike —
 * by the scale's own name, never by `{scale}Dark{step}`; a dark or alpha
 * object still exposes `olive1`/`oliveA1`, not `oliveDark1`/`oliveDarkA1`,
 * which is why the caller passes the key prefix explicitly rather than it
 * being derived from which ramp is being built.
 */
function readRamp(scale: Readonly<Record<string, string>>, keyPrefix: string, step0: string): Ramp {
  const ramp: Record<number, string> = { 0: step0 };

  for (const step of RAMP_STEPS) {
    const key = `${keyPrefix}${step}`;
    const value = scale[key];

    if (value === undefined) {
      throw new Error(
        `@radix-ui/colors has no "${key}" step; the imported scale may have changed shape.`,
      );
    }

    ramp[step] = value;
  }

  return ramp as Ramp;
}

function buildThemeRamp(
  lightScale: Readonly<Record<string, string>>,
  darkScale: Readonly<Record<string, string>>,
  keyPrefix: string,
): ThemeRamp {
  return {
    light: readRamp(lightScale, keyPrefix, APP_BACKGROUND_LIGHT),
    dark: readRamp(darkScale, keyPrefix, APP_BACKGROUND_DARK),
  };
}

/** neutral scheme (chrome) — `olive` / `olive dark`. */
export const olive = buildThemeRamp(oliveLightScale, oliveDarkScale, 'olive');
export const oliveAlpha = buildThemeRamp(oliveLightAlphaScale, oliveDarkAlphaScale, 'oliveA');

/** accent scheme (brand) — `lime` / `lime dark`. */
export const lime = buildThemeRamp(limeLightScale, limeDarkScale, 'lime');
export const limeAlpha = buildThemeRamp(limeLightAlphaScale, limeDarkAlphaScale, 'limeA');

/** destructive scheme — `ruby` / `ruby dark`. */
export const ruby = buildThemeRamp(rubyLightScale, rubyDarkScale, 'ruby');
export const rubyAlpha = buildThemeRamp(rubyLightAlphaScale, rubyDarkAlphaScale, 'rubyA');

/**
 * the four equity strength-band anchors. each is a full ramp for
 * consistency with the schemes above, even though `tokens.ts` only reads
 * steps 9 (`solid`) and 11 (`text`) from these four — the band anchors are a
 * categorical data-encoding family, not a UI colour scheme, so they carry no
 * `component`/`border` roles and no alpha ramp.
 */
export const cyan = buildThemeRamp(cyanLightScale, cyanDarkScale, 'cyan');
export const grass = buildThemeRamp(grassLightScale, grassDarkScale, 'grass');
export const orange = buildThemeRamp(orangeLightScale, orangeDarkScale, 'orange');
export const tomato = buildThemeRamp(tomatoLightScale, tomatoDarkScale, 'tomato');

/**
 * the two suit anchors this project did not already have a ramp for.
 * `tokens.ts`'s `buildSuits` reads step 9 from each of these, plus step 9
 * from `ruby` and step 11 from `olive` above, to build the four-colour
 * deck — a categorical data-encoding family like the band anchors above,
 * so neither carries an alpha ramp either. `docs/conventions/design-system.md`
 * has the full provenance: both are bound colour styles rendered by the
 * design file's card picker (node `98:7317`), not merely defined and
 * unused as this project's documentation previously — and wrongly —
 * claimed.
 */
export const blue = buildThemeRamp(blueLightScale, blueDarkScale, 'blue');
export const jade = buildThemeRamp(jadeLightScale, jadeDarkScale, 'jade');

/**
 * a flat black-alpha ramp — a `Ramp`, not a `ThemeRamp`: every other ramp
 * above pairs a light scale with a dark one, but Radix ships no `blackDarkA`
 * counterpart to pair `blackA` with, because black-over-anything darkens
 * the same way whichever theme is active. That is also why this ramp
 * exists at all rather than reusing `oliveAlpha` above: Radix's *dark*-theme
 * alpha ramps (`oliveDarkA`, `limeDarkA`, `rubyDarkA`) are **white**-based —
 * built to lighten whatever sits under them, which is backwards for
 * anything meant to darken the screen behind it. `tokens.ts` reads one step
 * of this for the bottom sheet's own backdrop; see that file's own comment
 * for the exact step and why.
 */
export const blackAlpha: Ramp = readRamp(blackAlphaScale, 'blackA', 'rgba(0, 0, 0, 0)');
