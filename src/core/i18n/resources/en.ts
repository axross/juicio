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
      // this row's label doubles as the Analytics child screen's own nav
      // bar title (issue #211), the same way `feedback` above already
      // doubles as `feedback.tsx`'s own nav bar title.
      analytics: 'Analytics',
    },
    // the Analytics child screen (issue #211): one card holding the
    // tracking switch, and a description below it — the same shape
    // `theme.description` above already takes for a different setting's
    // own child screen.
    analytics: {
      switchLabel: 'Share usage analytics',
      description:
        'Helps us understand which parts of the app get used, so we can improve them. No hand, card, or other personal information is ever included.',
      onValue: 'On',
      offValue: 'Off',
    },
    feedback: {
      intro: "Tell us what's working, what isn't, or what you'd like to see.",
      messageLabel: 'Message',
      messagePlaceholder: 'What would you like us to know?',
      messageRequired: 'A message is required.',
      nameLabel: 'Name (optional)',
      namePlaceholder: 'Your name',
      emailLabel: 'Email (optional)',
      emailPlaceholder: 'you@example.com',
      emailHint: "Add it only if you'd like a reply.",
      emailInvalid: "That doesn't look like an email address.",
      submit: 'Send',
      sentHeading: 'Thanks for the feedback',
      sentBody: 'Your message has been sent.',
      unavailable:
        "Feedback can't be sent from this build. Try again from an installed release build.",
      sendFailed: "Your message couldn't be sent. Try again.",
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
    // see docs/specs/equity-analysis.md's "The Board" section for why each
    // slot gets its own label and the row keeps a summary; `{{position}}`
    // is the slot's spoken position (1-5), `{{card}}` is
    // `../../../shared/ui/card-spoken-name.ts`'s composed name.
    board: {
      slotAccessibilityLabel: 'Board card {{position}} is not selected',
      filledSlotAccessibilityLabel: 'Board card {{position}}: {{card}}',
      // see docs/specs/equity-analysis.md's "The Board" section for why
      // this rides `accessibilityRole="summary"` instead of `accessible`.
      allSlotsEmptyAccessibilityLabel: 'Board, no cards yet',
      // read once the board holds at least one card — `{{cards}}` is every
      // filled slot's own spoken name, joined by the caller
      // (`../../../features/evaluations/ui/board/board.tsx`) rather than a
      // second interpolation scheme, since i18next carries no "join a
      // list" mechanism of its own.
      populatedAccessibilityLabel: 'Board: {{cards}}',
    },
    // the board input sheet's own copy — see docs/specs/equity-analysis.md's
    // "The Board Input Sheet" and docs/specs/hand-ranges.md's "The
    // Card/Range Input Sheet" for why the picker itself carries none of its
    // own. `{{card}}` stays in `handRanges.card` below.
    boardInput: {
      emptySlotAccessibilityLabel: 'Board card {{position}} is not selected',
      filledSlotAccessibilityLabel: 'Board card {{position}}: {{card}}',
      focusedSlotAccessibilityLabel:
        'Board card {{position}} ({{card}}) is focused. Your next pick replaces it.',
      allSlotsEmptyAccessibilityLabel: 'No board cards are selected',
      handle: {
        accessibilityLabel: 'Dismiss board card input',
      },
      sheet: {
        accessibilityLabel: "Enter the board's community cards",
      },
    },
    emptyHeading: 'Nothing in the water yet',
    emptyDescription: 'Add 2 players to start calculation.',
    playerRow: {
      // see docs/specs/equity-analysis.md's "Player Kinds" section for why
      // the row is labelled by `Player.number` rather than the holding's
      // own notation.
      title: 'Player {{number}}',
      holeCardsSubtitle: 'Hole cards',
      // see docs/specs/equity-analysis.md's "The Players List" section for
      // why the announcement speaks card names rather than on-screen
      // notation, and how `{{result}}` resolves.
      holeCardsAccessibilityLabel:
        'Player {{number}}: {{first}} and {{second}}. Result {{result}}.',
      // `{{combos}}` reuses `handRanges.cardPairCount`'s own visible
      // subtitle string; see docs/specs/equity-analysis.md's "The Players
      // List" section for why this row announces itself as a button.
      handRangeAccessibilityLabel:
        'Player {{number}}: custom hand range, {{combos}}. Result {{result}}. Opens equity breakdown.',
      // see docs/specs/equity-analysis.md's "The Players List" section for
      // the two-decimal formatting; `{{percent}}` is already a
      // fixed-precision numeral, so this template adds only the `%` glyph.
      resultPercentage: '{{percent}}%',
      // what `{{result}}` above interpolates to when no result is
      // currently available — see docs/specs/equity-analysis.md's "The
      // Players List" section for exactly when that is.
      resultUnavailableLabel: 'not yet available',
      // read on the row's preview `Pressable` action alongside `'delete'`
      // below — reaches tapping the preview without the gesture, the same
      // way `deleteAccessibilityLabel` already reaches the swipe.
      editAccessibilityLabel: 'Edit player',
      deleteAccessibilityLabel: 'Delete player',
    },
    // the persistent floating action button that replaced this feature's
    // two former, state-dependent add-player entry points (issue #155) —
    // `../../../features/evaluations/ui/new-player-fab/new-player-fab.tsx`.
    newPlayerFab: {
      label: 'New Player',
    },
    // `../../../features/evaluations/ui/toast/toast.tsx`'s own copy (issue
    // #99) — see docs/specs/equity-analysis.md's "The Toast" section for
    // these four strings and the dismiss affordance.
    toast: {
      incompleteBoard: 'The board was incomplete, so it was reverted.',
      incompleteHoleCardsAdding: 'The hole cards were incomplete, so no player was added.',
      incompleteHoleCardsEditing: 'The hole cards were incomplete, so the player was reverted.',
      // raised when the equity engine settles `no-valid-runout` — see
      // docs/specs/equity-analysis.md's "The Toast" section for when that
      // is.
      impossibleSituation: "This combination is impossible, so equity couldn't be calculated.",
      dismissAccessibilityLabel: 'Dismiss alert message',
    },
    // the Equity Breakdown sheet — see docs/specs/equity-analysis.md's "The
    // Equity Breakdown Sheet" section; reached from
    // `playerRow.handRangeAccessibilityLabel` above.
    equityBreakdown: {
      // the section heading beneath the header, and the sheet's own
      // accessibility identity — the design draws both as `Equity
      // Breakdown`, so this is one key read twice rather than two
      // identical literals kept in sync by hand.
      heading: 'Equity Breakdown',
      // see docs/specs/equity-analysis.md's "The Equity Breakdown Sheet"
      // section for why the header announces the player without announcing
      // itself as a button. `{{combos}}`/`{{result}}` mirror
      // `playerRow.handRangeAccessibilityLabel` above.
      headerAccessibilityLabel:
        'Player {{number}}: custom hand range, {{combos}}. Result {{result}}.',
      // the four strength-band names, in the histogram's own left-to-right
      // colour order — see docs/specs/equity-analysis.md's "The Equity
      // Breakdown Sheet" section.
      bands: {
        trash: 'Trash',
        marginal: 'Marginal',
        value: 'Value',
        nuts: 'Nuts',
      },
      chart: {
        // "combos" per docs/conventions/design-system.md's App-Wide Copy
        // Conventions — see docs/specs/equity-analysis.md's "The Equity
        // Breakdown Sheet" section for this histogram's own settling of the
        // word's casing.
        combosAxisLabel: 'combos',
        equityAxisLabel: 'Equity',
        // one label for the whole chart — see docs/specs/equity-analysis.md's
        // "The Equity Breakdown Sheet" section for why. `{{count}}` is
        // `chooseBarCount`'s resolved value; `{{max}}` is
        // `combosAxisUpperBound`'s (both
        // `../../../features/evaluations/model/equity-breakdown.ts`).
        accessibilityLabel:
          'Equity breakdown chart, {{count}} bars. The horizontal axis is equity, from 0 to 100; the vertical axis is card-pair count, from 0 to {{max}}.',
      },
      handle: {
        accessibilityLabel: 'Dismiss equity breakdown',
      },
      sheet: {
        accessibilityLabel: "View this player's equity breakdown",
      },
      // the Rank Pair list below the histogram (issue #234): every Rank
      // Pair in the player's own hand range, grouped under three headings
      // in this fixed order. Drafted, not yet reviewed by the maintainer —
      // the same carve-out this namespace's other new strings above
      // already carry.
      rankPairs: {
        groupHeading: {
          pocket: 'Pocket pairs',
          suited: 'Suited',
          offsuit: 'Offsuit',
        },
        // `{{rank}}` is `handRanges.card.rankName`'s own spoken rank word
        // (`ace`, `king`, …), read twice — a pocket pair's own two cards
        // share one rank, so this repeats the same interpolation rather
        // than naming a second one with nothing different to say.
        pocketAccessibilityLabel: '{{rank}} {{rank}} pocket pair',
        // `{{highRank}}`/`{{lowRank}}` are the same spoken rank words,
        // composed the same "the caller resolves the string" way
        // `../../../shared/ui/card-spoken-name.ts` already does for a
        // card's own rank/suit.
        suitedAccessibilityLabel: '{{highRank}} {{lowRank}} suited',
        offsuitAccessibilityLabel: '{{highRank}} {{lowRank}} offsuit',
      },
    },
  },
  presets: {
    // the Preset list screen — see docs/specs/hand-ranges.md's "The Preset
    // List" section.
    list: {
      title: 'Hand Range Preset',
      // the four tag axes' own display labels — see docs/specs/hand-ranges.md's
      // "Preset" section table and
      // docs/decisions/2026-08-26-unify-preset-filters-and-tags-on-four-axes.md.
      filterAxisLabel: {
        position: 'Position',
        players: '# of Players',
        stack: 'Depth',
        action: 'Action',
      },
      // `{{axis}}` is one of the four labels above, interpolated rather
      // than duplicated in translation.
      filterChipAccessibilityLabel: 'Filter by {{axis}}',
      // read on an applied-filter pill's own removal action — `{{value}}`
      // is the catalog value it names (`BTN`, `100BB`), never translated,
      // the same "notation stays as-is" rule
      // `handRanges.chip.accessibilityLabel` already follows for a
      // shorthand's own label.
      removeFilterAccessibilityLabel: 'Remove {{value}} filter',
      // one fixed accessibility identity for every axis's own instance of
      // this sheet — see docs/specs/hand-ranges.md's "The Preset List"
      // section for why.
      tagPickerSheet: {
        accessibilityLabel: 'Choose values to filter the preset list by',
        handle: {
          accessibilityLabel: 'Dismiss the filter picker',
        },
      },
      row: {
        // `{{tags}}` is this row's own visible tag-summary subtitle,
        // already joined in the fixed axis order — see
        // docs/specs/hand-ranges.md's "The Preset List" section.
        accessibilityLabel: '{{name}}. {{tags}}',
      },
      // the persistent floating action button
      // (`../../../features/presets/ui/new-preset-fab/new-preset-fab.tsx`)
      // that opens the Preset editor route in create mode — issue #176's
      // own Assumptions: "matching Analyze's existing 'New Player' button."
      newPresetFab: {
        label: 'New Preset',
      },
      // shown when no Preset has ever been saved — distinct from
      // `filteredEmpty` below, which is reached only once a filter is
      // applied.
      empty: {
        heading: 'No presets saved yet',
        description: 'Save a hand range as a preset to see it here.',
      },
      // shown once at least one filter is applied and no saved Preset
      // matches it — issue #176's own Option A: visibly distinct copy from
      // `empty` above, so a filtered-out list never reads as "nothing was
      // ever saved."
      filteredEmpty: {
        heading: 'No matching presets',
        description: 'Try removing a filter to see more presets.',
      },
      // issue #176's own Option A error presentation: reuses `EmptyState`
      // with this copy, no retry action.
      error: {
        heading: "Presets couldn't load",
        description: 'Something went wrong. Try again later.',
      },
    },
    // the Preset editor route's own titles — see docs/specs/hand-ranges.md's
    // "The Preset Editor" section; `createTitle` has no design reading
    // behind it, so this is an implementer's own pick mirroring
    // `editTitle`'s plain, mode-naming shape.
    editor: {
      createTitle: 'New Preset',
      editTitle: 'Edit Preset',
    },
  },
  history: {
    emptyHeading: 'Nothing to look back on',
    emptyDescription: "Run an analysis and it'll show up here.",
    // see docs/specs/calculation-history.md's "History Entries" section for
    // "Today"/"Yesterday" grouping; older dates use
    // `../../features/history/ui/date-group/date-heading.ts`'s
    // `formatShortCalendarDate` instead.
    dateHeading: {
      today: 'Today',
      yesterday: 'Yesterday',
    },
    // a condensed History row's own copy — see
    // docs/specs/calculation-history.md's "History Entries" section for why
    // this departs from the tag-axis subtitle format. `holeCardsSubtitle`
    // duplicates `analyze.playerRow.holeCardsSubtitle`'s own copy rather
    // than a cross-namespace reuse.
    entryRow: {
      holeCardsSubtitle: 'Hole cards',
      // `{{name}}` is the saved `HistoryEntryPlayer.name`; `{{first}}`/
      // `{{second}}` are `../../shared/ui/card-spoken-name.ts`'s own
      // composed spoken names.
      holeCardsAccessibilityLabel: '{{name}}: {{first}} and {{second}}.',
      // `{{combos}}` is this row's own visible subtitle —
      // `handRanges.cardPairCount`'s own `{{count}} combos` string,
      // reused rather than duplicated, mirroring `analyze.playerRow.
      // handRangeAccessibilityLabel`'s own reuse of the same string.
      handRangeAccessibilityLabel: '{{name}}: {{combos}}.',
      deleteAccessibilityLabel: 'Delete history entry',
    },
    // the board group's own board-thumbnail copy — see
    // docs/specs/calculation-history.md's "History Entries" section for the
    // 3/4/5-card and no-board cases.
    boardThumbnail: {
      populatedAccessibilityLabel: 'Board: {{cards}}',
      noCardsAccessibilityLabel: 'No board cards were set for this calculation',
    },
  },
  handRanges: {
    // the card/range input sheet (docs/specs/hand-ranges.md). the three
    // shorthand chip labels aren't translated — they come from
    // `../../../shared/model/hand-range-shorthand.ts`'s
    // `HAND_RANGE_SHORTHANDS`, this project's own notation.
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
    // "combos" is design copy, not this project's own term for rank pair
    // or card pair — see docs/conventions/design-system.md's App-Wide Copy
    // Conventions. kept lowercase, identical in Japanese too.
    cardPairCount: '{{count}} combos',
    grid: {
      // `{{rankPair}}` is `../../../shared/model/rank-pair.ts`'s
      // `rankPairLabel` (`AKs`, `AA`, `72o`) — this project's own notation,
      // not translated prose.
      cellAccessibilityLabel: 'Rank pair {{rankPair}}',
    },
    // a card's spoken name ("ace of spades") for accessibility only — the
    // design draws the suit as `SuitIcon`'s pip instead. two
    // interpolations, not one, since rank/suit word order differs by
    // language (English "ace of spades", Japanese 「スペードのエース」).
    card: {
      nameTemplate: '{{rank}} of {{suit}}',
      // a card already spoken for elsewhere reads its spoken name plus this
      // suffix — see docs/specs/hand-ranges.md's "A card already spoken for
      // elsewhere is excluded too" note; via
      // `../../../shared/ui/card-spoken-name.ts`'s
      // `unavailableCardAccessibilityLabel`.
      unavailableAccessibilityLabel: '{{card}}, unavailable',
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
      // keyed by `Suit`'s own letter (`../../../shared/model/card.ts`) —
      // `s`, `h`, `d`, `c` — not the suit's full name.
      suitName: {
        s: 'spades',
        h: 'hearts',
        d: 'diamonds',
        c: 'clubs',
      },
    },
    cards: {
      // see docs/specs/hand-ranges.md's "The `Cards` tab" section for why
      // each slot's own spoken identity is a full phrase rather than a bare
      // "left"/"right". `{{card}}` is
      // `../../../shared/ui/card-spoken-name.ts`'s composed name.
      slotName: {
        left: 'The left card',
        right: 'The right card',
      },
      emptySlotAccessibilityLabel: '{{slot}} is not selected',
      filledSlotAccessibilityLabel: 'Hole card {{index}}: {{card}}',
      focusedSlotAccessibilityLabel: '{{slot}} ({{card}}) is focused. Your next pick replaces it.',
      // see `../../../shared/ui/cards-pane/cards-pane.tsx`'s own comment
      // for why this reads as a summary rather than per-slot.
      bothSlotsEmptyAccessibilityLabel: 'Neither card is selected',
    },
    handle: {
      // this sheet's own text for `../../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s `handleAccessibilityLabel` prop, replacing
      // that component's generic default ("Dismiss") — named for this
      // sheet so a screen-reader user navigating a stack of sheets knows
      // which one a handle belongs to.
      accessibilityLabel: 'Dismiss card and hand range input',
    },
    sheet: {
      // this sheet's own text for `../../../shared/ui/bottom-sheet/
      // bottom-sheet.tsx`'s required `accessibilityLabel` prop, read on
      // entering the modal. distinct from `handle`'s own label above: that
      // names the dismiss affordance, this names the sheet's identity.
      accessibilityLabel: "Enter a player's hole cards or hand range",
    },
  },
};

export type Resources = typeof en;
