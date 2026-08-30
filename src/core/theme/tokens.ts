/**
 * theme and breakpoint tokens for react-native-unistyles.
 *
 * the values here are the design's own — see
 * docs/conventions/design-system.md — sourced from `@radix-ui/colors`
 * through `./palette`, never transcribed by hand. components consume only
 * the semantic role names this module exposes (`theme.colors.<tier>.
 * <scheme>.<slot>`, `theme.bands.<band>`, `theme.typography.<role>`,
 * `theme.space`, `theme.radius`, `theme.borderWidth`, `theme.effects`); the
 * Radix ramp itself is an implementation detail of `./palette` and never
 * appears past this file.
 */
// `StyleSheet.hairlineWidth` is a static device constant, not a call to
// `.create()`, so it's read from `react-native` directly rather than
// react-native-unistyles — importing Unistyles here instead breaks this
// file's own unit test outside a native runtime. accepted deviation,
// `hairlineWidth`-only: docs/operations/agent-skills.md.
import { StyleSheet } from 'react-native';

import * as palette from './palette';
import type { Ramp } from './palette';

type ThemeName = 'light' | 'dark';

/**
 * maps one 13-step ramp, plus its alpha counterpart, onto the tier/slot
 * shape react-component-styling fixes. every slot gets an `…Alpha`
 * counterpart from the alpha ramp.
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
 * the foreground each scheme's solid fill (step 9/10) takes, per Radix's
 * step-9 rule: Sky, Mint, Lime, Yellow, and Amber take dark text there,
 * every other scale takes white. accent (`lime`) is this project's only
 * scale in that group, so `text.onSolid` is one value per scheme, not a
 * per-theme pair — step 9 is the same value in both themes for every
 * chromatic scale here. neutral (`olive`)'s step 9 does differ by theme,
 * but the dark-text rule is about hue, not the exact value, so white still
 * applies to both.
 *
 * `#37401C` is `lime/12` in the light scale — the dark scale's step 12 is
 * tuned for a dark background and fails against light-scale `lime/9`.
 */
const onSolid = {
  neutral: '#FFFFFF',
  accent: '#37401C',
  destructive: '#FFFFFF',
} as const;

/**
 * the brand-exact lime accent for a mark standing directly on a neutral
 * ground — the active tab's icon/label, the selected radio's ring and dot —
 * as opposed to `onSolid` above, which is the foreground *on top of* the
 * `lime/9` fill.
 *
 * breaks this file's usual same-step parity between themes: dark keeps the
 * design's literal step 9 (`#BDEE63`); light substitutes step 11
 * (`#5C7C2F`), since step 9 alone — tuned for dark text on top of it — fails
 * the WCAG 2 AA 3:1 non-text contrast floor at 20px on a near-white row. see
 * docs/decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md
 * for the parity rule this is the one exception to.
 */
const accentBrand = {
  light: palette.lime.light[11],
  dark: palette.lime.dark[9],
} as const;

/**
 * the unselected radio ring's border colour — a second deliberate break
 * from same-step parity (alongside `accentBrand` above), for the same WCAG
 * 2 AA 3:1 non-text floor.
 *
 * the design's exported SVG strokes it at `#687066` (olive dark/9). dark
 * keeps that value, clearing the floor at 3.12:1 against its row
 * background. carrying the same step into light measures only 1.38:1 —
 * worse than step 7 (`border.neutral.interactive`, the role this replaces),
 * which measured 1.72:1 dark / 1.38:1 light with the wrong colour besides.
 * light instead takes step 10, the smallest departure that clears the
 * floor: 3.36:1. see docs/conventions/design-system.md for the full
 * measurement table.
 */
const unselectedControlBorder = {
  light: palette.olive.light[10],
  dark: palette.olive.dark[9],
} as const;

/**
 * the bottom sheet's backdrop. genuinely new: the design file draws the
 * sheet with nothing behind it, and it shipped with a fully transparent
 * backdrop for that reason — the maintainer asked for one anyway once this
 * was flagged. see docs/conventions/design-system.md's "Bottom Sheet Scrim"
 * entry for the decision; the value and its measurement live here, since an
 * operational cost like this belongs inline (docs/conventions/
 * documentation.md).
 *
 * **not Material 3's own figure.** that spec's scrim — always black at 32%
 * opacity (`androidx.compose.material3`'s `ScrimTokens.ContainerOpacity`)
 * — composited over this app's `background.neutral.app` (`#111210`,
 * already near-black) works out to about `#0c0c0b`: a ~30% luminance drop
 * from a base already close to the display floor, reading as
 * barely-changed rather than a curtain.
 *
 * `blackAlpha[8]` (60% opacity) is used instead, compositing to about
 * `#070706` — a ~60% drop, clearly perceptible. picked from Radix's own
 * black-alpha ramp (`./palette.ts`) rather than a hand-picked hex, so at
 * least the step is looked up, even though picking that step is this
 * project's own choice, not a spec's.
 */
const scrim = palette.blackAlpha[8];

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
      neutral: { ...neutral.border, unselectedControl: unselectedControlBorder[theme] },
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
    // same value in both themes, unlike every other role here — see
    // `scrim`'s doc comment above.
    scrim,
  } as const;
}

/**
 * the four equity strength-band anchors — a categorical data-encoding
 * family, not a UI colour scheme: each band exposes only step-9 `solid` and
 * step-11 `text`, per docs/conventions/design-system.md. step 9 is
 * identical between light and dark for all four, so `solid` doesn't vary by
 * theme; `text` does, and reads per theme like any other text role.
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
 * the four-colour deck's suit anchors — a categorical family like
 * `buildBands` above, not a UI colour scheme: one fill per suit, no
 * tier/slot ramp, no alpha counterpart. read from the card picker at design
 * node `98:7317` and its seventeen exported SVGs; see
 * docs/conventions/design-system.md for the measured contrast each clears
 * (and the two that don't). keyed by `Suit`'s own letter
 * (`../../shared/model/card.ts`) — `s`, `h`, `d`, `c` — not
 * the suit's full name.
 *
 * spades and hearts resolve to values this file already declares elsewhere
 * (`text.neutral.low`, `solid.destructive.rest`) but still get their own
 * role here, so every suit lookup goes through one uniform table rather
 * than three suits reading `theme.suits` and a fourth reading a text token.
 * diamonds and clubs are the two ramps with no prior use in this project.
 */
function buildSuits(theme: ThemeName) {
  return {
    s: palette.olive[theme][11],
    h: palette.ruby[theme][9],
    d: palette.blue[theme][9],
    c: palette.jade[theme][9],
  } as const;
}

/**
 * the design's named text roles. the first four sit at 100% line height
 * (`lineHeight === fontSize`); `body` and `textLink` are identical in
 * metrics — distinct roles differing in colour, not size or weight. none
 * carries a `fontFamily`: this change doesn't bundle the Inter font files,
 * so a role falls back to the platform font until a later change adds them.
 *
 * `caption`, `description`, `label`, and `tabLabel` are four roles this
 * phase adds. `caption` (14/20, Technical Information, node `600:31971`)
 * and `description` (14/18, the empty-state descriptions, nodes
 * `518:29828` and `600:29970`) share size and weight but differ in line
 * height — a text role applies whole (react-component-styling's theming
 * reference), so one role can't serve both call sites; two roles is that
 * reference's own fix for exactly this case. `label` (16/500, `+ New
 * Player`) and `tabLabel` (12/400, the tab bar) are new sizes.
 * docs/conventions/design-system.md's typography table carries all four.
 *
 * `sectionHeading` is a fifth role: the `Players` heading (node
 * `518:29368`) measures 16px/500 like `label`, but at a 20px line height,
 * not `label`'s 16px — the same "apply a role whole" rule makes it its own
 * role rather than an override.
 *
 * `gridCellLabel` (10/400) and `chipLabel` (14/400) are two more, for the
 * hand-range pane (docs/specs/hand-ranges.md): `gridCellLabel` labels the
 * 13×13 grid's rank-pair cells at a size no other role uses; `chipLabel`
 * labels the shorthand chips, a third 14px/400 pairing alongside `caption`
 * and `description`, at yet another line height, for the same reason those
 * two need separate roles.
 */
const typography = {
  body: { fontSize: 16, lineHeight: 16, fontWeight: '400' },
  textLink: { fontSize: 16, lineHeight: 16, fontWeight: '400' },
  heading: { fontSize: 18, lineHeight: 18, fontWeight: '600' },
  navBarTitle: { fontSize: 18, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  description: { fontSize: 14, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 16, lineHeight: 16, fontWeight: '500' },
  tabLabel: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  sectionHeading: { fontSize: 16, lineHeight: 20, fontWeight: '500' },
  gridCellLabel: { fontSize: 10, lineHeight: 10, fontWeight: '400' },
  chipLabel: { fontSize: 14, lineHeight: 14, fontWeight: '400' },
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
 * named radius tiers. `xs`, `sm`, `lg` sit on this project's 4/8px grid,
 * the fallback scale where the design file doesn't measure a radius — see
 * docs/conventions/design-system.md. `md` is the exception: measured
 * against the design file at 10px (off the grid), correcting the
 * previously-derived 12 — the first radius tier measured rather than
 * derived, same as the tab bar's 90px already is for spacing. `full` isn't
 * a grid step either: the conventional oversized constant that forces a
 * fully rounded (pill) corner regardless of height.
 */
const radius = {
  xs: 4,
  sm: 8,
  md: 10,
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
 * the `Sheet` effect's two layers, per docs/conventions/design-system.md.
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
    suits: buildSuits(theme),
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
