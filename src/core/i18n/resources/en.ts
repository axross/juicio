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
};

export type Resources = typeof en;
