/**
 * Theme and breakpoint tokens for react-native-unistyles.
 *
 * The values here are the design's own — see
 * docs/conventions/design-system.md — sourced from `@radix-ui/colors`
 * through `./palette`, never transcribed by hand. Components consume only
 * the semantic role names this module exposes (`theme.colors.<tier>.
 * <scheme>.<slot>`, `theme.bands.<band>`, `theme.typography.<role>`,
 * `theme.space`, `theme.radius`, `theme.borderWidth`, `theme.effects`); the
 * Radix ramp itself is an implementation detail of `./palette` and never
 * appears past this file.
 */
// This file reads `StyleSheet.hairlineWidth` only — a static constant, not
// a call to `.create()` — so it is imported from React Native directly
// rather than from Unistyles: the "import Unistyles' own StyleSheet" rule
// exists so a style participates in Unistyles' theme/runtime update path,
// which a plain constant read never does. Importing Unistyles' StyleSheet
// here instead would pull its native Nitro module into every module that
// imports tokens — including this file's own unit test, which then fails
// outside a native runtime with no native binary to satisfy it. Recorded as
// an accepted deviation in docs/operations/agent-skills.md; `hairlineWidth`
// is the only member of this import the deviation covers.
import { StyleSheet } from 'react-native';

import * as palette from './palette';
import type { Ramp } from './palette';

type ThemeName = 'light' | 'dark';

/**
 * Maps one 13-step ramp, plus its alpha counterpart, onto the tier/slot
 * shape the react-component-styling capability fixes: step 0
 * `background.plain`, 1 `background.app`, 2 `background.subtle`, 3
 * `component.rest`, 4 `component.hovered`, 5 `component.selected`, 6
 * `border.subtle`, 7 `border.interactive`, 8 `border.hovered`, 9
 * `solid.rest`, 10 `solid.hovered`, 11 `text.low`, 12 `text.high`. Every
 * slot gets an `…Alpha` counterpart from the matching alpha ramp.
 */
function mapRampToTiers(ramp: Ramp, alphaRamp: Ramp) {
  return {
    background: {
      plain: ramp[0],
      plainAlpha: alphaRamp[0],
      app: ramp[1],
      appAlpha: alphaRamp[1],
      subtle: ramp[2],
      subtleAlpha: alphaRamp[2],
    },
    component: {
      rest: ramp[3],
      restAlpha: alphaRamp[3],
      hovered: ramp[4],
      hoveredAlpha: alphaRamp[4],
      selected: ramp[5],
      selectedAlpha: alphaRamp[5],
    },
    border: {
      subtle: ramp[6],
      subtleAlpha: alphaRamp[6],
      interactive: ramp[7],
      interactiveAlpha: alphaRamp[7],
      hovered: ramp[8],
      hoveredAlpha: alphaRamp[8],
    },
    solid: {
      rest: ramp[9],
      restAlpha: alphaRamp[9],
      hovered: ramp[10],
      hoveredAlpha: alphaRamp[10],
    },
    text: {
      low: ramp[11],
      lowAlpha: alphaRamp[11],
      high: ramp[12],
      highAlpha: alphaRamp[12],
    },
  } as const;
}

/**
 * The foreground each scheme's solid fill (step 9/10) takes, per Radix's
 * documented step-9 rule: Sky, Mint, Lime, Yellow and Amber take dark
 * foreground text there, every other scale takes white. Of this project's
 * three schemes, only the accent (`lime`) is in that dark-text group;
 * `text.onSolid` is therefore a single value per scheme rather than a
 * per-theme pair, because step 9 is the same value in both themes for
 * every chromatic scale this project declares. `neutral`
 * (`olive`) is the one scale where step 9 itself differs by theme
 * (`#898e87` light, `#687066` dark), but the foreground rule is about the
 * scale's hue, not its exact step-9 value, so white stays correct in both.
 *
 * `#37401C` is `lime/12` in the light scale specifically — using the dark
 * scale's step 12 there would fail, since it is tuned for a dark
 * background, not for sitting on top of the light-scale `lime/9` fill.
 */
const onSolid = {
  neutral: '#FFFFFF',
  accent: '#37401C',
  destructive: '#FFFFFF',
} as const;

/**
 * The brand-exact accent colour for a lime mark that stands directly on a
 * neutral ground — the active tab's icon and label, the selected radio's
 * ring and dot — as opposed to `onSolid` above, which is the foreground for
 * content sitting *on top of* the `lime/9` fill itself.
 *
 * Unlike every other role in this file, this one does NOT resolve by
 * same-step parity between the two themes: the dark theme keeps the design's
 * own step 9 (`#BDEE63`) exactly, because that is the literal value the
 * design file specifies and this project's dark theme is drawn from. The
 * light theme substitutes step 11 (`#5C7C2F`) instead of carrying step 9
 * over — `lime/9` is tuned to carry *dark text on top of it* (see
 * `onSolid.accent` above), and at 20px standing alone on a near-white row it
 * fails the WCAG 2 AA 3:1 non-text contrast floor this project otherwise
 * holds every UI mark to. See
 * docs/decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md
 * for the parity rule this role is the one deliberate exception to.
 */
const accentBrand = {
  light: palette.lime.light[11],
  dark: palette.lime.dark[9],
} as const;

function buildColors(theme: ThemeName) {
  const neutral = mapRampToTiers(palette.olive[theme], palette.oliveAlpha[theme]);
  const accent = mapRampToTiers(palette.lime[theme], palette.limeAlpha[theme]);
  const destructive = mapRampToTiers(palette.ruby[theme], palette.rubyAlpha[theme]);

  return {
    background: {
      neutral: neutral.background,
      accent: accent.background,
      destructive: destructive.background,
    },
    component: {
      neutral: neutral.component,
      accent: accent.component,
      destructive: destructive.component,
    },
    border: {
      neutral: neutral.border,
      accent: accent.border,
      destructive: destructive.border,
    },
    solid: {
      neutral: neutral.solid,
      accent: accent.solid,
      destructive: destructive.solid,
    },
    text: {
      neutral: { ...neutral.text, onSolid: onSolid.neutral },
      accent: { ...accent.text, onSolid: onSolid.accent, brand: accentBrand[theme] },
      destructive: { ...destructive.text, onSolid: onSolid.destructive },
    },
  } as const;
}

/**
 * The four equity strength-band anchors — a categorical data-encoding
 * family, not a UI colour scheme: each band exposes only the step-9 `solid`
 * fill and its step-11 `text` counterpart, per
 * docs/conventions/design-system.md. Step 9 is identical between the light
 * and dark Radix scales for all four, so `solid` is the same value in both
 * themes; `text` (step 11) is not, and is read per theme like any other
 * text role.
 */
function buildBands(theme: ThemeName) {
  return {
    trash: { solid: palette.cyan[theme][9], text: palette.cyan[theme][11] },
    marginal: { solid: palette.grass[theme][9], text: palette.grass[theme][11] },
    value: { solid: palette.orange[theme][9], text: palette.orange[theme][11] },
    nuts: { solid: palette.tomato[theme][9], text: palette.tomato[theme][11] },
  } as const;
}

/**
 * The named text roles the design specifies. The first four are all at 100%
 * line height (`lineHeight === fontSize`); `body` and `textLink` are
 * deliberately identical in metrics — they are distinct roles that differ in
 * colour, which the colour tokens above carry, not in size or weight. None
 * carries a `fontFamily`: this change does not bundle the Inter font files,
 * so a role resolves through whichever font the platform falls back to
 * until a later change adds them.
 *
 * `caption`, `label`, and `tabLabel` are three roles this phase adds: 14px
 * text appears repeatedly in the design (the empty states' description,
 * Settings' Technical Information block), 16px/500 labels a solid-fill
 * button (Analyze's `+ New Player`), and 12px labels the tab bar — even
 * though docs/conventions/design-system.md's typography table names only
 * the four above. Phase 3 corrects that table to add all three rather than
 * this phase editing docs it is out of scope for; each pixel value here
 * comes straight from this phase's own approved brief, not from a size
 * invented on the spot. `caption`'s `lineHeight: 20` matches the measured
 * Technical Information block; the empty-state description measures 18,
 * which this role rounds up to rather than fragmenting into a
 * near-duplicate role over a 2px difference.
 */
const typography = {
  body: { fontSize: 16, lineHeight: 16, fontWeight: '400' },
  textLink: { fontSize: 16, lineHeight: 16, fontWeight: '400' },
  heading: { fontSize: 18, lineHeight: 18, fontWeight: '600' },
  navBarTitle: { fontSize: 18, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 16, lineHeight: 16, fontWeight: '500' },
  tabLabel: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

/** 4/8px-grid spacing steps, keyed to their base pixel value. */
const space = {
  x4: 4,
  x8: 8,
  x12: 12,
  x16: 16,
  x24: 24,
  x32: 32,
  x48: 48,
} as const;

/**
 * Named radius tiers on the same 4/8px grid, except `full`, which is not a
 * grid step: it is the conventional oversized constant that forces a fully
 * rounded (pill) corner regardless of the element's height. The design file
 * records no radius measurement to derive these from — see
 * docs/conventions/design-system.md — so this scale is this project's own.
 */
const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

const borderWidth = {
  hairline: StyleSheet.hairlineWidth,
  base: 1,
  thick: 2,
} as const;

type ShadowLayer = {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
};

/**
 * The `Sheet` effect's two layers, per docs/conventions/design-system.md.
 * `sheetInverted` is derived from these by negating each layer's y-offset,
 * rather than written out a second time, so the two can never drift apart.
 */
const sheetLayers: readonly ShadowLayer[] = [
  { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -2, color: 'rgba(0, 0, 0, 0.05)' },
  { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: 'rgba(0, 0, 0, 0.1)' },
];

function toBoxShadow(layers: readonly ShadowLayer[]): string {
  return layers
    .map(
      (layer) =>
        `${layer.offsetX}px ${layer.offsetY}px ${layer.blurRadius}px ${layer.spreadDistance}px ${layer.color}`,
    )
    .join(', ');
}

const effects = {
  sheet: toBoxShadow(sheetLayers),
  sheetInverted: toBoxShadow(sheetLayers.map((layer) => ({ ...layer, offsetY: -layer.offsetY }))),
} as const;

function buildTheme(theme: ThemeName) {
  return {
    colors: buildColors(theme),
    bands: buildBands(theme),
    typography,
    space,
    radius,
    borderWidth,
    effects,
  } as const;
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export const appThemes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
} as const;
