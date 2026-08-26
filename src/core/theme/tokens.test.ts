import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as radixColors from '@radix-ui/colors';

import { appThemes, breakpoints, darkTheme, lightTheme } from './tokens';

type ThemeName = 'light' | 'dark';

const THEMES: readonly { name: ThemeName; theme: typeof lightTheme }[] = [
  { name: 'light', theme: lightTheme },
  { name: 'dark', theme: darkTheme },
];

const SCHEMES = ['neutral', 'accent', 'destructive'] as const;

/** The 13 step-0-through-12 slots, as `[tier, slot]` pairs. */
const RAMP_SLOTS: readonly [tier: string, slot: string][] = [
  ['background', 'plain'],
  ['background', 'app'],
  ['background', 'subtle'],
  ['component', 'rest'],
  ['component', 'hovered'],
  ['component', 'selected'],
  ['border', 'subtle'],
  ['border', 'interactive'],
  ['border', 'hovered'],
  ['solid', 'rest'],
  ['solid', 'hovered'],
  ['text', 'low'],
  ['text', 'high'],
];

/** Recursively collects every `"a.b.c"` path to a non-object leaf. */
function collectPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Recursively collects every hex-looking (`#...`) string leaf. */
function collectHexValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.startsWith('#') ? [value] : [];
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectHexValues);
  }

  return [];
}

// WCAG 2 relative luminance and contrast ratio, from a `#rrggbb` hex string.
// This is a test-only measurement helper, not a token the app ships.
function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

describe('appThemes', () => {
  it('exposes exactly light and dark', () => {
    expect(Object.keys(appThemes).sort()).toEqual(['dark', 'light']);
  });
});

describe('breakpoints', () => {
  it('is unchanged by this theme rewrite', () => {
    expect(breakpoints).toEqual({ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 });
  });
});

describe('role-path parity', () => {
  it('exposes the identical set of role paths in both themes', () => {
    expect(collectPaths(lightTheme).sort()).toEqual(collectPaths(darkTheme).sort());
  });
});

describe('permitted colour sources', () => {
  // Hex is case-insensitive, and @radix-ui/colors ships lowercase while this
  // module writes its two hand-derived literals (`#FFFFFF`/`#000000`, plus
  // `text.accent.onSolid`) uppercase to match docs/conventions/design-system.md
  // — so membership is checked uppercase on both sides.
  const allowedColorValues = new Set<string>(
    ['#FFFFFF', '#000000', ...collectHexValues(radixColors)].map((value) => value.toUpperCase()),
  );

  it.each(THEMES)(
    'every colour role in $name resolves to @radix-ui/colors, #FFFFFF, or #000000',
    ({ theme }) => {
      const colorValues = [...collectHexValues(theme.colors), ...collectHexValues(theme.bands)];

      expect(colorValues.length).toBeGreaterThan(0);

      for (const value of colorValues) {
        expect(allowedColorValues.has(value.toUpperCase())).toBe(true);
      }
    },
  );
});

describe('thirteen-step reachability', () => {
  it.each(THEMES)(
    'declares all 13 steps, with an Alpha counterpart, for every scheme in $name',
    ({ theme }) => {
      for (const scheme of SCHEMES) {
        for (const [tier, slot] of RAMP_SLOTS) {
          const tierColors = theme.colors[tier as keyof typeof theme.colors] as Record<
            string,
            Record<string, string>
          >;
          const schemeColors = tierColors[scheme];

          expect(typeof schemeColors[slot]).toBe('string');
          expect(typeof schemeColors[`${slot}Alpha`]).toBe('string');
        }
      }
    },
  );
});

describe('text.onSolid', () => {
  it('is #37401C for accent in both themes', () => {
    expect(lightTheme.colors.text.accent.onSolid).toBe('#37401C');
    expect(darkTheme.colors.text.accent.onSolid).toBe('#37401C');
  });

  it('is #FFFFFF for destructive in both themes', () => {
    expect(lightTheme.colors.text.destructive.onSolid).toBe('#FFFFFF');
    expect(darkTheme.colors.text.destructive.onSolid).toBe('#FFFFFF');
  });

  it('is #FFFFFF for neutral in both themes, per the same step-9 foreground rule', () => {
    expect(lightTheme.colors.text.neutral.onSolid).toBe('#FFFFFF');
    expect(darkTheme.colors.text.neutral.onSolid).toBe('#FFFFFF');
  });
});

describe('bands', () => {
  it('exposes trash, marginal, value and nuts, each with a solid and a text value', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const band of ['trash', 'marginal', 'value', 'nuts'] as const) {
        expect(typeof theme.bands[band].solid).toBe('string');
        expect(typeof theme.bands[band].text).toBe('string');
      }
    }
  });

  it('anchors each band solid to its documented Radix step 9, case-insensitively', () => {
    expect(lightTheme.bands.trash.solid.toUpperCase()).toBe('#00A2C7');
    expect(lightTheme.bands.marginal.solid.toUpperCase()).toBe('#46A758');
    expect(lightTheme.bands.value.solid.toUpperCase()).toBe('#F76B15');
    expect(lightTheme.bands.nuts.solid.toUpperCase()).toBe('#E54D2E');
  });

  it('keeps every band solid identical between the two themes', () => {
    for (const band of ['trash', 'marginal', 'value', 'nuts'] as const) {
      expect(lightTheme.bands[band].solid).toBe(darkTheme.bands[band].solid);
    }
  });
});

describe('typography', () => {
  // The four named text styles docs/conventions/design-system.md specifies,
  // all at 100% line height (so lineHeight === fontSize) and no fontFamily,
  // which a later font-bundling change adds. Spelled out here rather than
  // read back off the token, so a value drifting from the design fails.
  const roles = [
    ['body', 16, '400'],
    ['textLink', 16, '400'],
    ['heading', 18, '600'],
    ['navBarTitle', 18, '500'],
  ] as const;

  it.each(roles)(
    '%s is %ipx at weight %s, with lineHeight === fontSize and no fontFamily',
    (role, fontSize, fontWeight) => {
      expect(lightTheme.typography[role]).toEqual({
        fontSize,
        lineHeight: fontSize,
        fontWeight,
      });
      expect('fontFamily' in lightTheme.typography[role]).toBe(false);
    },
  );

  it('covers every declared role', () => {
    expect(Object.keys(lightTheme.typography).sort()).toEqual(
      roles.map(([role]) => role as string).sort(),
    );
  });

  it('is identical in both themes', () => {
    expect(lightTheme.typography).toEqual(darkTheme.typography);
  });
});

describe('space, radius and borderWidth', () => {
  it('exist as three separate families', () => {
    expect(lightTheme.space).toEqual({ x4: 4, x8: 8, x12: 12, x16: 16, x24: 24, x32: 32, x48: 48 });
    expect(lightTheme.radius).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, full: 9999 });
    expect(lightTheme.borderWidth.base).toBe(1);
    expect(lightTheme.borderWidth.thick).toBe(2);
    expect(typeof lightTheme.borderWidth.hairline).toBe('number');
  });

  it('does not resolve radius or borderWidth from a spacing step', () => {
    const spaceValues = new Set<number>(Object.values(lightTheme.space));

    // `radius.xs`/`sm`/`md`/`lg` happening to land on the same grid as a
    // spacing step is expected (both are 4/8px-grid values); what matters is
    // that neither family is *the same object* as `space`, i.e. neither is
    // implemented as an alias into it.
    expect(lightTheme.radius).not.toBe(lightTheme.space);
    expect(lightTheme.borderWidth).not.toBe(lightTheme.space);
    expect(spaceValues.has(lightTheme.radius.full)).toBe(false);
  });
});

describe('effects', () => {
  it('writes sheet as a boxShadow string with -2px and -3px spreads', () => {
    expect(lightTheme.effects.sheet).toBe(
      '0px 4px 6px -2px rgba(0, 0, 0, 0.05), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)',
    );
  });

  it('writes sheetInverted as sheet with both y-offsets negated', () => {
    expect(lightTheme.effects.sheetInverted).toBe(
      '0px -4px 6px -2px rgba(0, 0, 0, 0.05), 0px -10px 15px -3px rgba(0, 0, 0, 0.1)',
    );
  });

  it('is identical in both themes', () => {
    expect(lightTheme.effects).toEqual(darkTheme.effects);
  });
});

describe('jade and blue', () => {
  it('does not appear anywhere in the theme module', () => {
    for (const file of ['tokens.ts', 'palette.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf-8');

      expect(source.toLowerCase()).not.toMatch(/\bjade\b/);
      expect(source.toLowerCase()).not.toMatch(/\bblue\b/);
    }
  });
});

describe('contrast', () => {
  // Every text/non-text pairing the token layer itself determines, measured
  // per theme against the WCAG 2 floor it actually clears. A pairing that
  // clears only the large-text floor (3:1) is recorded in
  // docs/conventions/design-system.md, which requires 18pt/24px or 14pt-bold
  // type wherever it is used; this test asserts that floor specifically so a
  // regression below it fails.
  const NORMAL_TEXT_FLOOR = 4.5;
  const LARGE_TEXT_FLOOR = 3;

  const pairings = THEMES.flatMap(({ name, theme }) => [
    {
      name: `neutral text.high on background.app (${name})`,
      fg: theme.colors.text.neutral.high,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `neutral text.low on background.app (${name})`,
      fg: theme.colors.text.neutral.low,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `accent text.low on background.app (${name})`,
      fg: theme.colors.text.accent.low,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `destructive text.low on background.app (${name})`,
      fg: theme.colors.text.destructive.low,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `accent text.onSolid on solid.accent.rest (${name})`,
      fg: theme.colors.text.accent.onSolid,
      bg: theme.colors.solid.accent.rest,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `destructive text.onSolid on solid.destructive.rest (${name})`,
      fg: theme.colors.text.destructive.onSolid,
      bg: theme.colors.solid.destructive.rest,
      floor: LARGE_TEXT_FLOOR,
    },
    {
      name: `neutral text.onSolid on solid.neutral.rest (${name})`,
      fg: theme.colors.text.neutral.onSolid,
      bg: theme.colors.solid.neutral.rest,
      floor: name === 'light' ? LARGE_TEXT_FLOOR : NORMAL_TEXT_FLOOR,
    },
    {
      name: `trash band text on background.app (${name})`,
      fg: theme.bands.trash.text,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `marginal band text on background.app (${name})`,
      fg: theme.bands.marginal.text,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
    {
      name: `value band text on background.app (${name})`,
      fg: theme.bands.value.text,
      bg: theme.colors.background.neutral.app,
      floor: name === 'light' ? LARGE_TEXT_FLOOR : NORMAL_TEXT_FLOOR,
    },
    {
      name: `nuts band text on background.app (${name})`,
      fg: theme.bands.nuts.text,
      bg: theme.colors.background.neutral.app,
      floor: NORMAL_TEXT_FLOOR,
    },
  ]);

  it.each(pairings)('$name clears $floor:1', ({ fg, bg, floor }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(floor);
  });
});
