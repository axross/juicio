import * as radixColors from '@radix-ui/colors';

import { appThemes, breakpoints, darkTheme, lightTheme } from './tokens';

type ThemeName = 'light' | 'dark';

const THEMES: readonly { name: ThemeName; theme: typeof lightTheme }[] = [
  { name: 'light', theme: lightTheme },
  { name: 'dark', theme: darkTheme },
];

const SCHEMES = ['neutral', 'accent', 'destructive'] as const;

/** the 13 step-0-through-12 slots, as `[tier, slot]` pairs. */
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

/** recursively collects every `"a.b.c"` path to a non-object leaf. */
function collectPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** recursively collects every hex-looking (`#...`) string leaf. */
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
// this is a test-only measurement helper, not a token the app ships.
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
  // hex is case-insensitive, and @radix-ui/colors ships lowercase while this
  // module writes its two hand-derived literals (`#FFFFFF`/`#000000`, plus
  // `text.accent.onSolid`) uppercase to match docs/conventions/design-system.md
  // — so membership is checked uppercase on both sides.
  const allowedColorValues = new Set<string>(
    ['#FFFFFF', '#000000', ...collectHexValues(radixColors)].map((value) => value.toUpperCase()),
  );

  it.each(THEMES)(
    'every colour role in $name resolves to @radix-ui/colors, #FFFFFF, or #000000',
    ({ theme }) => {
      const colorValues = [
        ...collectHexValues(theme.colors),
        ...collectHexValues(theme.bands),
        ...collectHexValues(theme.suits),
      ];

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

describe('text.accent.brand', () => {
  // the one role that deliberately breaks same-step parity: dark keeps the
  // design's literal `lime/9` (#BDEE63), light substitutes `lime/11`
  // (#5C7C2F) so a lime mark standing on a neutral ground stays legible. see
  // tokens.ts's `accentBrand` doc comment.
  it('is #BDEE63 (lime dark/9) in the dark theme, matching the design exactly', () => {
    expect(darkTheme.colors.text.accent.brand.toUpperCase()).toBe('#BDEE63');
  });

  it('is #5C7C2F (lime/11) in the light theme, not the brand lime/9', () => {
    expect(lightTheme.colors.text.accent.brand.toUpperCase()).toBe('#5C7C2F');
  });

  it('clears the WCAG 2 AA 3:1 non-text floor against every neutral ground it renders on in light', () => {
    const grounds = [
      lightTheme.colors.background.neutral.app,
      lightTheme.colors.background.neutral.subtle,
      lightTheme.colors.component.neutral.rest,
    ];

    for (const ground of grounds) {
      expect(contrastRatio(lightTheme.colors.text.accent.brand, ground)).toBeGreaterThanOrEqual(3);
    }
  });

  it('clears the WCAG 2 AA 4.5:1 normal-text floor on background.neutral.subtle in light, where the active tab label — real text, not just a graphical mark — actually renders in this colour', () => {
    expect(
      contrastRatio(
        lightTheme.colors.text.accent.brand,
        lightTheme.colors.background.neutral.subtle,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('border.neutral.unselectedControl', () => {
  // the unselected radio ring's own border colour — the second role, beside
  // `text.accent.brand`, that deliberately breaks same-step parity to clear
  // the WCAG 2 AA 3:1 non-text floor. dark keeps the design's literal
  // `#687066` (olive dark/9); light moves one step further, to step 10,
  // rather than carrying step 9 over.
  it('is #687066 (olive dark/9) in the dark theme, matching the design exactly', () => {
    expect(darkTheme.colors.border.neutral.unselectedControl.toUpperCase()).toBe('#687066');
  });

  it('is #7F847D (olive/10) in the light theme, not the same-step olive/9', () => {
    expect(lightTheme.colors.border.neutral.unselectedControl.toUpperCase()).toBe('#7F847D');
    expect(lightTheme.colors.border.neutral.unselectedControl.toUpperCase()).not.toBe(
      lightTheme.colors.solid.neutral.rest.toUpperCase(),
    );
  });

  it('clears the WCAG 2 AA 3:1 non-text floor against the row background in both themes', () => {
    expect(
      contrastRatio(
        darkTheme.colors.border.neutral.unselectedControl,
        darkTheme.colors.component.neutral.rest,
      ),
    ).toBeGreaterThanOrEqual(3);

    expect(
      contrastRatio(
        lightTheme.colors.border.neutral.unselectedControl,
        lightTheme.colors.component.neutral.rest,
      ),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('board slot border contrast (issue #64)', () => {
  // Analyze's board (src/features/evaluations/ui/board/board.tsx) strokes its five
  // empty card slots with `border.neutral.unselectedControl`, not the
  // design's own literal `olive/7` (`border.neutral.interactive`): `olive/7`
  // measures only 1.90:1 dark / 1.50:1 light against `background.neutral.
  // subtle` — the board's own ground, since the board shares the nav bar's
  // background per option A of the presentation exhibit — well below the
  // WCAG 2 AA 3:1 non-text floor, and the dashed border is the only thing
  // that shows a slot exists. `unselectedControl` clears that floor against
  // both grounds the design's own colour role could plausibly render on;
  // see docs/conventions/design-system.md for the fuller measurement.
  it('the literal design value (border.neutral.interactive) fails the 3:1 floor against background.neutral.subtle in both themes', () => {
    expect(
      contrastRatio(
        darkTheme.colors.border.neutral.interactive,
        darkTheme.colors.background.neutral.subtle,
      ),
    ).toBeLessThan(3);

    expect(
      contrastRatio(
        lightTheme.colors.border.neutral.interactive,
        lightTheme.colors.background.neutral.subtle,
      ),
    ).toBeLessThan(3);
  });

  it('border.neutral.unselectedControl clears the 3:1 floor against background.neutral.subtle — the ground the board actually renders on — in both themes', () => {
    expect(
      contrastRatio(
        darkTheme.colors.border.neutral.unselectedControl,
        darkTheme.colors.background.neutral.subtle,
      ),
    ).toBeGreaterThanOrEqual(3);

    expect(
      contrastRatio(
        lightTheme.colors.border.neutral.unselectedControl,
        lightTheme.colors.background.neutral.subtle,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('border.neutral.unselectedControl also clears the 3:1 floor against background.neutral.app, in both themes', () => {
    expect(
      contrastRatio(
        darkTheme.colors.border.neutral.unselectedControl,
        darkTheme.colors.background.neutral.app,
      ),
    ).toBeGreaterThanOrEqual(3);

    expect(
      contrastRatio(
        lightTheme.colors.border.neutral.unselectedControl,
        lightTheme.colors.background.neutral.app,
      ),
    ).toBeGreaterThanOrEqual(3);
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

describe('suits', () => {
  // the four-colour deck, read from the design's card picker (node
  // `98:7317`) and the seventeen SVGs exported from it. this describe
  // block previously asserted the opposite of what it does now: that
  // "jade" and "blue" appear nowhere in tokens.ts or palette.ts, on the
  // strength of docs/conventions/design-system.md's old claim that
  // neither is rendered anywhere in the design file. `get_variable_defs`
  // on node `98:7317` returned `blue dark / 9 Solid backgrounds: #0090FF`
  // and `jade dark/9 Solid backgrounds: #29A383` alongside `ruby dark / 9`
  // and `olive dark/11` — so that claim, and this test, are corrected
  // together, not deleted and rewritten as if the mistake never happened.
  it('exposes spades, hearts, diamonds and clubs as single hex fills, in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const suit of ['s', 'h', 'd', 'c'] as const) {
        expect(typeof theme.suits[suit]).toBe('string');
      }
    }
  });

  it('spades is #AFB5AD (olive dark/11) in dark and #60655F (olive/11) in light, the same value text.neutral.low already exposes', () => {
    expect(darkTheme.suits.s.toUpperCase()).toBe('#AFB5AD');
    expect(darkTheme.suits.s).toBe(darkTheme.colors.text.neutral.low);
    expect(lightTheme.suits.s.toUpperCase()).toBe('#60655F');
    expect(lightTheme.suits.s).toBe(lightTheme.colors.text.neutral.low);
  });

  it('hearts is #E54666 (ruby dark/9) in both themes, the same value solid.destructive.rest already exposes', () => {
    expect(darkTheme.suits.h.toUpperCase()).toBe('#E54666');
    expect(lightTheme.suits.h.toUpperCase()).toBe('#E54666');
    expect(darkTheme.suits.h).toBe(darkTheme.colors.solid.destructive.rest);
    expect(lightTheme.suits.h).toBe(lightTheme.colors.solid.destructive.rest);
  });

  it('diamonds is #0090FF (blue dark/9) in both themes — a scale this project did not previously declare', () => {
    expect(darkTheme.suits.d.toUpperCase()).toBe('#0090FF');
    expect(lightTheme.suits.d.toUpperCase()).toBe('#0090FF');
  });

  it('clubs is #29A383 (jade dark/9) in both themes — the other scale this project did not previously declare', () => {
    expect(darkTheme.suits.c.toUpperCase()).toBe('#29A383');
    expect(lightTheme.suits.c.toUpperCase()).toBe('#29A383');
  });
});

describe('suit contrast against the card face', () => {
  // a suit pip sits on `component.neutral.rest` (olive dark/3 `#212220`
  // dark / olive/3 `#EFF1EF` light) at two sizes: 12pt in the card fan,
  // below the 18pt/24px large-text threshold this document already uses
  // elsewhere, so the 4.5:1 normal-text floor applies; and 24pt in a
  // preview slot, at or above that threshold, so the 3:1 large-text floor
  // applies instead. every value asserted here is the design's own
  // literal step-9 (or step-11, for spades) value, implemented unchanged
  // — where a ratio falls short of the floor that applies, this project
  // keeps the design's literal colour and records the shortfall in
  // docs/conventions/design-system.md rather than silently substituting a
  // different step, the same posture the equity-band solids already take
  // against the app background in light theme.
  const CARD_FACE_DARK = '#212220';
  const CARD_FACE_LIGHT = '#EFF1EF';
  const NORMAL_TEXT_FLOOR = 4.5; // the 12pt fan pip
  const LARGE_TEXT_FLOOR = 3; // the 24pt preview-slot pip

  it('spades clears the 4.5:1 normal-text floor (the 12pt fan pip) against the card face in both themes', () => {
    expect(contrastRatio(darkTheme.suits.s, CARD_FACE_DARK)).toBeGreaterThanOrEqual(
      NORMAL_TEXT_FLOOR,
    );
    expect(contrastRatio(lightTheme.suits.s, CARD_FACE_LIGHT)).toBeGreaterThanOrEqual(
      NORMAL_TEXT_FLOOR,
    );
  });

  it('hearts clears the 3:1 large-text floor (the 24pt preview-slot pip) in both themes but falls short of the 4.5:1 normal-text floor (the 12pt fan pip) in both', () => {
    expect(contrastRatio(darkTheme.suits.h, CARD_FACE_DARK)).toBeGreaterThanOrEqual(
      LARGE_TEXT_FLOOR,
    );
    expect(contrastRatio(lightTheme.suits.h, CARD_FACE_LIGHT)).toBeGreaterThanOrEqual(
      LARGE_TEXT_FLOOR,
    );
    expect(contrastRatio(darkTheme.suits.h, CARD_FACE_DARK)).toBeLessThan(NORMAL_TEXT_FLOOR);
    expect(contrastRatio(lightTheme.suits.h, CARD_FACE_LIGHT)).toBeLessThan(NORMAL_TEXT_FLOOR);
  });

  it('diamonds clears both floors against the dark card face but falls short of even the 3:1 large-text floor against the light one', () => {
    expect(contrastRatio(darkTheme.suits.d, CARD_FACE_DARK)).toBeGreaterThanOrEqual(
      NORMAL_TEXT_FLOOR,
    );
    expect(contrastRatio(lightTheme.suits.d, CARD_FACE_LIGHT)).toBeLessThan(LARGE_TEXT_FLOOR);
  });

  it('clubs clears both floors against the dark card face but falls short of even the 3:1 large-text floor against the light one', () => {
    expect(contrastRatio(darkTheme.suits.c, CARD_FACE_DARK)).toBeGreaterThanOrEqual(
      NORMAL_TEXT_FLOOR,
    );
    expect(contrastRatio(lightTheme.suits.c, CARD_FACE_LIGHT)).toBeLessThan(LARGE_TEXT_FLOOR);
  });
});

describe('typography', () => {
  // the four named text styles docs/conventions/design-system.md specifies,
  // all at 100% line height (so lineHeight === fontSize) and no fontFamily,
  // which a later font-bundling change adds. spelled out here rather than
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

  it('caption is 14px at weight 400 with a 20px lineHeight and no fontFamily', () => {
    expect(lightTheme.typography.caption).toEqual({
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400',
    });
    expect('fontFamily' in lightTheme.typography.caption).toBe(false);
  });

  it('description is 14px at weight 400 with an 18px lineHeight and no fontFamily', () => {
    // same size and weight as `caption`, deliberately a different role: the
    // Analyze/History empty-state descriptions measure an 18px line height
    // against caption's 20px, and a text role is applied whole, never with
    // a line height picked out of it — see tokens.ts's typography doc
    // comment.
    expect(lightTheme.typography.description).toEqual({
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '400',
    });
    expect('fontFamily' in lightTheme.typography.description).toBe(false);
  });

  it('label is 16px at weight 500, with lineHeight === fontSize and no fontFamily', () => {
    expect(lightTheme.typography.label).toEqual({
      fontSize: 16,
      lineHeight: 16,
      fontWeight: '500',
    });
    expect('fontFamily' in lightTheme.typography.label).toBe(false);
  });

  it('tabLabel is 12px at weight 400 with a 16px lineHeight and no fontFamily', () => {
    expect(lightTheme.typography.tabLabel).toEqual({
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400',
    });
    expect('fontFamily' in lightTheme.typography.tabLabel).toBe(false);
  });

  it('sectionHeading is 16px at weight 500 with a 20px lineHeight and no fontFamily', () => {
    // the Players heading above Analyze's board (issue #64): same size and
    // weight as `label`, deliberately a different role — `label` is 16px at
    // its own 100% (16px) line height, and a text role is applied whole,
    // never with a line height picked out of it by the caller, same as the
    // caption/description split above.
    expect(lightTheme.typography.sectionHeading).toEqual({
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '500',
    });
    expect('fontFamily' in lightTheme.typography.sectionHeading).toBe(false);
  });

  it('gridCellLabel is 10px at weight 400, with lineHeight === fontSize and no fontFamily', () => {
    // the rank-pair grid's own cell label (docs/specs/hand-ranges.md)
    // — 10px appears nowhere else in this table, the same way tabLabel's 12px
    // introduced its own new size.
    expect(lightTheme.typography.gridCellLabel).toEqual({
      fontSize: 10,
      lineHeight: 10,
      fontWeight: '400',
    });
    expect('fontFamily' in lightTheme.typography.gridCellLabel).toBe(false);
  });

  it('chipLabel is 14px at weight 400, with lineHeight === fontSize and no fontFamily', () => {
    // the card/range input sheet's three shorthand chips
    // (docs/specs/hand-ranges.md) — a third 14px/400 pairing alongside
    // caption (14/20) and description (14/18), at its own 100% line height,
    // for the same reason those two need separate roles rather than one.
    expect(lightTheme.typography.chipLabel).toEqual({
      fontSize: 14,
      lineHeight: 14,
      fontWeight: '400',
    });
    expect('fontFamily' in lightTheme.typography.chipLabel).toBe(false);
  });

  it('covers every declared role', () => {
    expect(Object.keys(lightTheme.typography).sort()).toEqual(
      [
        ...roles.map(([role]) => role as string),
        'caption',
        'description',
        'label',
        'tabLabel',
        'sectionHeading',
        'gridCellLabel',
        'chipLabel',
      ].sort(),
    );
  });

  it('is identical in both themes', () => {
    expect(lightTheme.typography).toEqual(darkTheme.typography);
  });
});

describe('space, radius and borderWidth', () => {
  it('exist as three separate families', () => {
    expect(lightTheme.space).toEqual({ x4: 4, x8: 8, x12: 12, x16: 16, x24: 24, x32: 32, x48: 48 });
    expect(lightTheme.radius).toEqual({ xs: 4, sm: 8, md: 10, lg: 16, full: 9999 });
    expect(lightTheme.borderWidth.base).toBe(1);
    expect(lightTheme.borderWidth.thick).toBe(2);
    expect(typeof lightTheme.borderWidth.hairline).toBe('number');
  });

  it('does not resolve radius or borderWidth from a spacing step', () => {
    const spaceValues = new Set<number>(Object.values(lightTheme.space));

    // `radius.xs`/`sm`/`lg` happening to land on the same grid as a spacing
    // step is expected (both are 4/8px-grid values); `radius.md` (10) is the
    // one exception — a real measurement against the design file rather
    // than a derived grid value, and it does not land on the grid. what
    // matters here is that neither family is *the same object* as `space`,
    // i.e. neither is implemented as an alias into it.
    expect(lightTheme.radius).not.toBe(lightTheme.space);
    expect(lightTheme.borderWidth).not.toBe(lightTheme.space);
    expect(spaceValues.has(lightTheme.radius.md)).toBe(false);
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

describe('contrast', () => {
  // every text/non-text pairing the token layer itself determines, measured
  // per theme against the WCAG 2 floor it actually clears. a pairing that
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
