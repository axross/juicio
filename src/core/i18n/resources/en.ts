/**
 * English translation resources, one i18next namespace per surface, keyed
 * by meaning rather than by the English text so a copy change never renames
 * a key. `docs/conventions/design-system.md` records this same copy; this
 * module is what `t()` reads at runtime.
 *
 * `Resources` (exported below) is what `./ja.ts` types its object against,
 * so a key missing from either file is a type error, not a silent
 * fallback.
 */
export const en = {
  navigation: {
    analyzeTab: 'Analyze',
    historyTab: 'History',
    presetsTab: 'Presets',
    settingsTab: 'Settings',
    // distinct from a screen's own title: announces the action, not the
    // destination.
    back: 'Back',
  },
  settings: {
    language: {
      sectionTitle: 'Language',
      // a language names itself — same literal in both `en` and `ja`, not
      // translated.
      optionEnglish: 'English (United States)',
      optionJapanese: '日本語',
    },
    theme: {
      sectionTitle: 'Theme',
      optionSystem: 'System',
      optionLight: 'Light',
      optionDark: 'Dark',
      // shown 16px below the `Theme` child screen's options card (issue
      // #76) — the design file's own `Calculation Accuracy` helper-text
      // pattern, reused rather than invented.
      description:
        "System follows the device's own appearance setting and switches with it. Light and Dark stay fixed whatever the device is set to.",
    },
    about: {
      sectionTitle: 'About',
      feedback: 'Feedback',
    },
    technicalInfo: {
      build: 'Build',
      appVersion: 'App Version',
      buildNumber: 'Build Number',
      // an identifier, not prose — stays "SHA" in both languages.
      sha: 'SHA',
    },
  },
  analyze: {
    // the `Players` heading above the empty state, 32px beneath the board
    // — see docs/specs/equity-analysis.md.
    playersHeading: 'Players',
    // screen-reader-only: one label for the whole board, not five
    // identical unlabelled stops for each empty slot.
    board: {
      accessibilityLabel: 'Board, no cards yet',
    },
    emptyHeading: 'Nothing in the water yet',
    emptyDescription: 'Add 2 players to start calculation.',
    emptyButton: 'New Player',
  },
  presets: {
    // the espada-engine off-thread demo — proves the JS thread stays
    // responsive under a native job, standing in for real Presets content
    // until that exists.
    nativeDemo: {
      heading: 'Off-thread job demo',
      description:
        'Counts primes on a background thread while this screen keeps animating on the JavaScript thread. Frame rate should stay within 10% of its idle baseline while a job runs.',
      startButton: 'Start job',
      cancelButton: 'Cancel job',
      progress: 'Progress: {{percent}}%',
      result: 'Found {{count}} primes.',
      cancelled: 'Job cancelled.',
      error: 'Job failed: {{message}}',
      frameRate: 'Frame rate — current: {{current}}, min: {{min}}, idle baseline: {{baseline}}',
      heartbeat: 'Heartbeat: {{count}}',
    },
  },
  history: {
    emptyHeading: 'Nothing to look back on',
    emptyDescription: "Run an analysis and it'll show up here.",
  },
  handRanges: {
    // the card/range input sheet (docs/specs/hand-ranges.md). the three
    // shorthand chip labels (`A2s+`, `55+`, `98s-54s`) aren't translated
    // here — they come straight from
    // `../../shared/model/hand-range-shorthand.ts`'s `HAND_RANGE_SHORTHANDS`,
    // this project's own poker notation, language-invariant like `SHA`
    // above.
    tabs: {
      handRange: 'Hand Range',
      cards: 'Cards',
    },
    chip: {
      // read alongside the shorthand's own on-screen label (`A2s+`, say)
      // — `{{shorthand}}` is that literal notation, interpolated rather
      // than duplicated in translation, since it isn't itself translated
      // copy.
      accessibilityLabel: 'Apply {{shorthand}}',
    },
    // docs/conventions/design-system.md's App-Wide Copy Conventions:
    // "combos" is design copy, not this project's own term for rank pair
    // or card pair — kept lowercase per the maintainer's review of this
    // namespace, and identical in Japanese too, like `SHA` and the Build
    // Channel literals elsewhere in this file.
    cardPairCount: '{{count}} combos',
    grid: {
      // `{{rankPair}}` is `../../shared/model/rank-pair.ts`'s
      // `rankPairLabel` (`AKs`, `AA`, `72o`) — this project's own
      // notation, read letter by letter, not translated prose. kept as
      // one interpolated key rather than a rank-by-rank name table, the
      // same "notation stays as-is" rule as `chip.accessibilityLabel` and
      // `cardPairCount` above.
      cellAccessibilityLabel: 'Rank pair {{rankPair}}',
    },
    // a card's spoken name — "ace of spades" — for `PlayingCard`'s and the
    // preview slots' accessibility labels only; the design never draws
    // this word, every visible suit is `SuitIcon`'s pip instead.
    // `../../shared/ui/card-spoken-name.ts` composes
    // `nameTemplate` from `rankName`/`suitName` below, kept out of
    // `../../shared/model/card.ts` (pure, no i18n). two
    // interpolations, not one, because rank/suit word order differs by
    // language (English "ace of spades", Japanese 「スペードのエース」).
    card: {
      nameTemplate: '{{rank}} of {{suit}}',
      rankName: {
        A: 'ace',
        K: 'king',
        Q: 'queen',
        J: 'jack',
        T: 'ten',
        '9': 'nine',
        '8': 'eight',
        '7': 'seven',
        '6': 'six',
        '5': 'five',
        '4': 'four',
        '3': 'three',
        // poker's own name for the rank-2 card, not the cardinal number —
        // every other rank name here is the plain cardinal/face word.
        '2': 'deuce',
      },
      // keyed by `Suit`'s own letter (`../../shared/model/card.ts`) —
      // `s`, `h`, `d`, `c` — not the suit's full name.
      suitName: {
        s: 'spades',
        h: 'hearts',
        d: 'diamonds',
        c: 'clubs',
      },
    },
    cards: {
      // the maintainer's own shape: each slot's spoken identity is the
      // whole phrase "the left card"/"the right card", not a bare
      // "left"/"right" — those words alone read as too broad and
      // ambiguous out of context. `{{slot}}` interpolates one of the two
      // phrases below, always sentence-initial in both templates that use
      // it, so a translation never needs a second, lowercase variant of
      // either phrase. `filledSlotAccessibilityLabel` below still
      // interpolates `{{index}}` (1 or 2, the slot's spoken position, not
      // the zero-based index `../../shared/ui/cards-pane/selection.ts`
      // tracks internally) rather than `{{slot}}` — it was not part of
      // the maintainer's copy review that introduced `slotName` below.
      // `{{card}}` is `../../shared/ui/card-spoken-name.ts`'s composed
      // name — see `card` above.
      slotName: {
        left: 'The left card',
        right: 'The right card',
      },
      emptySlotAccessibilityLabel: '{{slot}} is not selected',
      filledSlotAccessibilityLabel: 'Hole card {{index}}: {{card}}',
      focusedSlotAccessibilityLabel: '{{slot}} ({{card}}) is focused. Your next pick replaces it.',
      // the slots row's own label, read only while both slots are empty —
      // see `../../shared/ui/cards-pane/cards-pane.tsx`'s
      // own comment on why this container announces a summary rather than
      // letting a screen reader reach two identical "is not selected"
      // lines with nothing tying them together, and how it does that
      // without hiding either slot's own label from the accessibility
      // tree the way `accessible={true}` would.
      bothSlotsEmptyAccessibilityLabel: 'Neither card is selected',
    },
    handle: {
      // this sheet's own text for `../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s `handleAccessibilityLabel` prop, replacing
      // that component's generic default ("Dismiss") — named for this
      // sheet so a screen-reader user navigating a stack of sheets knows
      // which one a handle belongs to.
      accessibilityLabel: 'Dismiss card and hand range input',
    },
    sheet: {
      // this sheet's own text for `../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s required `accessibilityLabel` prop, read on
      // entering the modal. distinct from `handle`'s own label above: that
      // names the dismiss affordance, this names the sheet's identity.
      accessibilityLabel: "Enter a player's hole cards or hand range",
    },
  },
};

export type Resources = typeof en;
