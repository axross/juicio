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
    // screen-reader-only, one label per slot rather than one for the whole
    // row: each of the five slots is its own press target now, and five
    // separate controls cannot be reached through the collapsed parent the
    // row's single `Board, no cards yet` label used to need. `{{position}}`
    // is the slot's spoken position, 1 to 5, not the zero-based index
    // `../../../features/evaluations/ui/board/board.tsx` iterates.
    // `filledSlotAccessibilityLabel` and `populatedAccessibilityLabel`
    // (issue #99) are this namespace's own filled counterparts, now that
    // that component renders the board's own cards — mirroring
    // `boardInput.filledSlotAccessibilityLabel`'s own wording and
    // templating below, and reusing `../../../shared/ui/
    // card-spoken-name.ts` for `{{card}}` rather than inventing a second
    // spoken form. drafted, not yet reviewed by the maintainer — see
    // `boardInput`'s own comment below, which this follows.
    board: {
      slotAccessibilityLabel: 'Board card {{position}} is not selected',
      filledSlotAccessibilityLabel: 'Board card {{position}}: {{card}}',
      // the row's own summary, restored from the single `Board, no cards
      // yet` label the row used to carry: five separately reachable slots
      // do not replace the one-line answer to "what is this row" a screen
      // reader reaching it wants. it rides `accessibilityRole="summary"`
      // rather than `accessible`, which would collapse the five slots
      // again — the same construction the picker's own slots row uses.
      allSlotsEmptyAccessibilityLabel: 'Board, no cards yet',
      // read once the board holds at least one card — `{{cards}}` is every
      // filled slot's own spoken name, joined by the caller
      // (`../../../features/evaluations/ui/board/board.tsx`) rather than a
      // second interpolation scheme, since i18next carries no "join a
      // list" mechanism of its own.
      populatedAccessibilityLabel: 'Board: {{cards}}',
    },
    // the board input sheet — Analyze's own sheet, so its copy lives in
    // this screen's namespace rather than in `handRanges` beside the
    // player sheet's. the first three are the board's wording for the
    // three states a preview slot takes; the fourth is the slots row's own
    // summary, read only while every slot is empty. the picker itself now
    // carries neither sheet's wording and takes whichever it is handed.
    // `{{card}}` is `../../../shared/ui/card-spoken-name.ts`'s composed
    // name, which stays in `handRanges.card` below: a card's spoken name
    // is the same phrase wherever a card is shown.
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
      // the row's own title (the maintainer's own on-device pass over
      // PR #93) — `{{number}}` is `Player.number` (`../../../features/
      // evaluations/model/player.ts`), assigned once at creation and never
      // recomputed from the row's own position, so deleting an earlier
      // player never renumbers the ones after it. replaces the holding's
      // own notation and the range player's `Custom` label, both of which
      // used to render here.
      title: 'Player {{number}}',
      holeCardsSubtitle: 'Hole cards',
      // `{{first}}`/`{{second}}` are `../../../shared/ui/
      // card-spoken-name.ts`'s composed spoken names ("ace of hearts"),
      // not this row's own on-screen notation (`A♡T♡`, gone from the row's
      // own text entirely — the two card faces already carry it) — a
      // screen reader reads the spoken form, the same way `handRanges.card`
      // already does for a single card.
      // `{{result}}` is either `resultPercentage` below (interpolated with
      // that player's own real percent) or `resultUnavailableLabel`
      // (issue #103) — whichever `../../../features/evaluations/ui/
      // player-row/player-row.tsx` resolves `resultLabel` to for this
      // player — interpolated here rather than duplicated. issue #102
      // first added `{{result}}` to every row's own announcement,
      // hole-cards included, per that issue's own Accessibility section.
      holeCardsAccessibilityLabel:
        'Player {{number}}: {{first}} and {{second}}. Result {{result}}.',
      // `{{combos}}` is already the row's own visible subtitle — this
      // project's `handRanges.cardPairCount`'s `{{count}} combos`
      // pattern, reused rather than a second one
      // (docs/conventions/design-system.md's own instruction). issue #102
      // appends the result figure and the "opens a breakdown" phrase its
      // own Accessibility section asks for — this is the one row kind
      // that announces itself as a button now (`content`'s own
      // `accessibilityRole` in `../../../features/evaluations/ui/
      // player-row/player-row.tsx`), so its announcement says what
      // pressing it does.
      handRangeAccessibilityLabel:
        'Player {{number}}: custom hand range, {{combos}}. Result {{result}}. Opens equity breakdown.',
      // issue #103: every row's result figure is a real, computed
      // percentage now, shown to two decimal places as of issue #192 —
      // `{{percent}}` is `(result.equity * 100).toFixed(2)`
      // (`../../../features/evaluations/ui/player-row/live-content.tsx`),
      // already a fixed-precision numeral needing no translation, so this
      // template's own prose stays limited to the trailing `%` glyph —
      // identical in both languages, the same "a numeral is a numeral" rule
      // this key's own fixed `0%` literal used to state before this change
      // gave it a real value.
      // used to be a bare fixed string (`'0%'`, every row, until the
      // equity engine landed) — kept as this same key name, since every
      // caller already read it as "this row's own result figure," rather
      // than adding a second key for the identical role.
      resultPercentage: '{{percent}}%',
      // issue #103: what `{{result}}` above interpolates to when no result
      // is currently available for this player (fewer than 2 players, more
      // than 3, an evaluation in flight, or none yet attempted) — drafted,
      // not yet reviewed by the maintainer, per
      // docs/conventions/design-system.md's Japanese Copy table convention
      // for a not-yet-settled string.
      resultUnavailableLabel: 'not yet available',
      // read on the row's preview `Pressable` action alongside `'delete'`
      // below — reaches tapping the preview (the maintainer's own
      // on-device pass over PR #93) without the gesture, the same way
      // `deleteAccessibilityLabel` already reaches the swipe.
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
    // #99): the four strings a discarded board or holding sheet close
    // reports, plus the toast's own dismiss affordance. Taken verbatim
    // from the plan's own UI design table. **Reversed from `board`/
    // `boardInput` above**: there, the English is settled and the
    // Japanese is drafted; here, the Japanese is maintainer-approved as
    // written and this English is what is drafted to mirror it, not yet
    // reviewed — see `./ja.ts`'s matching comment and
    // docs/conventions/design-system.md's Japanese Copy table, which
    // states the same reversal.
    toast: {
      incompleteBoard: 'The board was incomplete, so it was reverted.',
      incompleteHoleCardsAdding: 'The hole cards were incomplete, so no player was added.',
      incompleteHoleCardsEditing: 'The hole cards were incomplete, so the player was reverted.',
      // issue #103: raised from `../../../features/evaluations/adapter/
      // use-equity-evaluation.ts`'s own `impossibleSignal` one-shot
      // counter, whenever `startEquity` settles `'no-valid-runout'` — a
      // combinatorially impossible situation despite every player's range
      // and the board each looking individually valid (the standing
      // example: three players each pinned to `AA`, since only four aces
      // exist). drafted from this project's own toast-copy register (the
      // three sibling strings above), not yet reviewed by the maintainer —
      // the plan's own Open Questions note that the maintainer is welcome
      // to refine the exact wording during review, the same carve-out this
      // section's own two board-input-sheet rows already carry.
      impossibleSituation: "This combination is impossible, so equity couldn't be calculated.",
      dismissAccessibilityLabel: 'Dismiss alert message',
    },
    // the Equity Breakdown sheet (issue #102, docs/specs/
    // equity-analysis.md): reached from a hand-range row's own detail
    // press (`playerRow.handRangeAccessibilityLabel` above). Its header
    // repeats that same row (option B, the design of record) through
    // `../../../features/evaluations/ui/player-row-content/
    // player-row-content.tsx` — nothing here duplicates `playerRow`'s own
    // copy for it.
    equityBreakdown: {
      // the section heading beneath the header, and the sheet's own
      // accessibility identity — the design draws both as `Equity
      // Breakdown`, so this is one key read twice rather than two
      // identical literals kept in sync by hand.
      heading: 'Equity Breakdown',
      // the header's own accessible group — announces the player it is
      // about without announcing itself as a button, since option B makes
      // it look identical to the row that opened it (issue #102's own
      // Accessibility section). `{{combos}}`/`{{result}}` mirror
      // `playerRow.handRangeAccessibilityLabel` above, minus the "opens a
      // breakdown" phrase, since this header opens nothing.
      headerAccessibilityLabel:
        'Player {{number}}: custom hand range, {{combos}}. Result {{result}}.',
      // the four-name band legend, in the fixed order the histogram's own
      // colour ramp runs left to right — `../../../core/theme/tokens.ts`'s
      // `buildBands` and docs/conventions/design-system.md's Equity
      // Strength-Band Colours already name these four; this is their
      // on-screen label, not a fifth source for the colours themselves.
      bands: {
        trash: 'Trash',
        marginal: 'Marginal',
        value: 'Value',
        nuts: 'Nuts',
      },
      chart: {
        // the y-axis's own label — `handRanges.cardPairCount`'s "combos"
        // lowered per the maintainer's own review of that word elsewhere
        // in this file (docs/conventions/design-system.md's App-Wide Copy
        // Conventions); this histogram is the surface that document's own
        // "still not built, keeps the design's own capitalization until a
        // change that builds it settles its own copy" note deferred to,
        // and this change settles it the same way the rank-pair grid's
        // own count control and the ad-hoc subtitle already were.
        combosAxisLabel: 'combos',
        equityAxisLabel: 'Equity',
        // one label for the whole chart, read once — never one stop per
        // bar (issue #102's own Accessibility section: "naming what it
        // shows and how many bins it drew, rather than exposing every bar
        // as a separate stop with no value to read"). `{{count}}` is the
        // bar count `../../../features/evaluations/model/
        // equity-breakdown.ts`'s own `chooseBarCount` resolved to;
        // `{{max}}` is that same module's `combosAxisUpperBound` for the
        // bins actually drawn, never a fixed figure — this announces
        // whatever the chart's own combos axis actually draws, per issue
        // #102's revised plan.
        //
        // It also names which axis runs where, which the two axis labels
        // beside the canvas used to say by themselves. Victory Native
        // paints them into a Skia canvas now, so nothing inside the chart
        // reaches assistive technology on its own and this one string is
        // all of it there is (issue #102's own Accessibility section).
        accessibilityLabel:
          'Equity breakdown chart, {{count}} bars. The horizontal axis is equity, from 0 to 100; the vertical axis is card-pair count, from 0 to {{max}}.',
      },
      handle: {
        accessibilityLabel: 'Dismiss equity breakdown',
      },
      sheet: {
        accessibilityLabel: "View this player's equity breakdown",
      },
    },
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
    // `../../../shared/model/hand-range-shorthand.ts`'s
    // `HAND_RANGE_SHORTHANDS`, this project's own poker notation,
    // language-invariant like `SHA` above.
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
      // `{{rankPair}}` is `../../../shared/model/rank-pair.ts`'s
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
    // `../../../shared/ui/card-spoken-name.ts` composes
    // `nameTemplate` from `rankName`/`suitName` below, kept out of
    // `../../../shared/model/card.ts` (pure, no i18n). two
    // interpolations, not one, because rank/suit word order differs by
    // language (English "ace of spades", Japanese 「スペードのエース」).
    card: {
      nameTemplate: '{{rank}} of {{suit}}',
      // issue #99's own addition — a card already spoken for elsewhere (the
      // board, or another player's own exact holding) reads its spoken
      // name plus this suffix, via `../../../shared/ui/card-spoken-name.ts`'s
      // `unavailableCardAccessibilityLabel`. drafted, not yet reviewed by
      // the maintainer the way every other string in this namespace
      // already has been (see `cardPairCount`'s own comment above) —
      // `docs/conventions/design-system.md` already records the same
      // precedent for the board input sheet's own new copy.
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
      // the maintainer's own shape: each slot's spoken identity is the
      // whole phrase "the left card"/"the right card", not a bare
      // "left"/"right" — those words alone read as too broad and
      // ambiguous out of context. `{{slot}}` interpolates one of the two
      // phrases below, always sentence-initial in both templates that use
      // it, so a translation never needs a second, lowercase variant of
      // either phrase. `filledSlotAccessibilityLabel` below still
      // interpolates `{{index}}` (1 or 2, the slot's spoken position, not
      // the zero-based index `../../../shared/ui/cards-pane/selection.ts`
      // tracks internally) rather than `{{slot}}` — it was not part of
      // the maintainer's copy review that introduced `slotName` below.
      // `{{card}}` is `../../../shared/ui/card-spoken-name.ts`'s composed
      // name — see `card` above.
      slotName: {
        left: 'The left card',
        right: 'The right card',
      },
      emptySlotAccessibilityLabel: '{{slot}} is not selected',
      filledSlotAccessibilityLabel: 'Hole card {{index}}: {{card}}',
      focusedSlotAccessibilityLabel: '{{slot}} ({{card}}) is focused. Your next pick replaces it.',
      // the slots row's own label, read only while both slots are empty —
      // see `../../../shared/ui/cards-pane/cards-pane.tsx`'s
      // own comment on why this container announces a summary rather than
      // letting a screen reader reach two identical "is not selected"
      // lines with nothing tying them together, and how it does that
      // without hiding either slot's own label from the accessibility
      // tree the way `accessible={true}` would.
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
