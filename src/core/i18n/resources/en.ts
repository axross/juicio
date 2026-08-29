/**
 * the complete English translation resources, grouped into one i18next
 * namespace per surface and keyed by meaning rather than by the English text
 * itself, so a copy revision does not rename a key. `docs/conventions/
 * design-system.md` carries this same copy as the project's record of the
 * app-wide strings; this module is the runtime source `t()` reads from.
 *
 * `Resources` (exported from this module) is what `./ja.ts` types its own
 * object against, so a key present here and missing there — or vice versa —
 * is a type error rather than a silent runtime fallback.
 */
export const en = {
  navigation: {
    analyzeTab: 'Analyze',
    historyTab: 'History',
    presetsTab: 'Presets',
    settingsTab: 'Settings',
    // the generic back-affordance label, distinct from a screen's own
    // title: a back button announces the action, not the destination.
    back: 'Back',
  },
  settings: {
    language: {
      sectionTitle: 'Language',
      // a language names itself: this and `optionJapanese` below are the
      // same literal in both `en` and `ja`, deliberately not translated.
      optionEnglish: 'English (United States)',
      optionJapanese: '日本語',
    },
    theme: {
      sectionTitle: 'Theme',
      optionSystem: 'System',
      optionLight: 'Light',
      optionDark: 'Dark',
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
    // the `Players` section heading above the empty state, 32px beneath
    // the board (issue #64) — see docs/specs/equity-analysis.md.
    playersHeading: 'Players',
    // screen-reader-only: the board exposes one accessibility label naming
    // it as the board with no cards, rather than five identical unlabelled
    // stops for its five empty slots.
    board: {
      accessibilityLabel: 'Board, no cards yet',
    },
    emptyHeading: 'Nothing in the water yet',
    emptyDescription: 'Add 2 players to start calculation.',
    emptyButton: 'New Player',
  },
  presets: {
    // `nativeDemo` is the espada-engine off-thread demo (issue #7): a
    // temporary surface proving the JS thread stays responsive while a
    // native job runs, occupying the place real Presets content
    // eventually takes rather than a permanent piece of its own design.
    // relocated here from `analyze` by issue #64, to make room for
    // Analyze's own top-aligned board and players layout.
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
    // the card/range input sheet (docs/specs/hand-ranges.md) — its two
    // tabs, its hand-range pane's shorthand chips, card-pair count and
    // 13×13 grid, its cards pane's slots, and the sheet's own drag
    // handle. the three shorthand chip labels themselves (`A2s+`, `55+`,
    // `98s-54s`) are not translated here: they come straight from
    // `../../features/hand-ranges/model/hand-range-shorthand.ts`'s own
    // `HAND_RANGE_SHORTHANDS`, this project's own poker notation, the
    // same kind of language-invariant identifier `SHA` and the Build
    // Channel literals already are elsewhere in this file.
    tabs: {
      handRange: 'Hand Range',
      cards: 'Cards',
    },
    chip: {
      // read by a screen reader alongside the shorthand's own on-screen
      // label (`A2s+`, say) — `{{shorthand}}` is that literal notation,
      // interpolated rather than duplicated in translation, since it is
      // not itself translated copy.
      accessibilityLabel: 'Apply {{shorthand}}',
    },
    // docs/conventions/design-system.md's App-Wide Copy Conventions: the
    // word "Combos" is on-screen design copy, not this project's own term
    // for either rank pair or card pair, and MUST stay exactly as the
    // design draws it — including in Japanese, the same way `SHA` and the
    // Build Channel literals stay English in both languages elsewhere in
    // this file. `{{count}}` is `handRangeCardPairCount`'s own result.
    cardPairCount: '{{count}} Combos',
    grid: {
      // `{{rankPair}}` is `../../features/hand-ranges/model/rank-pair.ts`'s
      // own `rankPairLabel` (`AKs`, `AA`, `72o`) — this project's own
      // notation, read out letter by letter, not translated prose; kept
      // as one interpolated key rather than a rank-by-rank name table (a
      // spoken "Ace King suited" would need translating all thirteen rank
      // names plus "suited"/"offsuit"/"pocket pair" into a poker
      // convention this project has no other precedent for) so the same
      // "notation stays as-is, the sentence around it translates" rule
      // `chip.accessibilityLabel` and `cardPairCount` already apply here
      // too.
      cellAccessibilityLabel: 'Rank pair {{rankPair}}',
    },
    cards: {
      // `{{index}}` is 1 or 2 — the slot's own spoken position, not the
      // zero-based array index `../../features/hand-ranges/ui/
      // cards-pane-selection.ts` tracks internally. `{{card}}` is
      // `../../features/hand-ranges/model/card.ts`'s own `cardLabel`
      // (`A♠`), the same glyph label `PlayingCard` already reads onto
      // every card face — language-invariant, so it is interpolated
      // rather than translated.
      emptySlotAccessibilityLabel: 'Hole card {{index}}, empty',
      filledSlotAccessibilityLabel: 'Hole card {{index}}: {{card}}',
      focusedSlotAccessibilityLabel:
        'Hole card {{index}}: {{card}}, focused — your next pick replaces it',
    },
    handle: {
      // this sheet's own text for `../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s `handleAccessibilityLabel` prop, in place of
      // that component's own generic default ("Dismiss") — named for
      // what this specific sheet is, since a screen-reader user
      // navigating a stack of sheets benefits from knowing which one a
      // handle belongs to.
      accessibilityLabel: 'Dismiss card and range input',
    },
    sheet: {
      // this sheet's own text for `../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s required `accessibilityLabel` prop — read on
      // entering the modal itself, alongside its
      // `accessibilityViewIsModal`. distinct from the `handle` block's own
      // `accessibilityLabel` above: that one names the dismiss affordance,
      // this one names the sheet's own identity, so a screen-reader user
      // hears what they have entered, not only how to leave it.
      accessibilityLabel: "Enter a player's hole cards or hand range",
    },
  },
};

export type Resources = typeof en;
