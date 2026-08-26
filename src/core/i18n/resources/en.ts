/**
 * The complete English translation resources, grouped into one i18next
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
  },
  settings: {
    language: {
      sectionTitle: 'Language',
      // A language names itself: this and `optionJapanese` below are the
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
      // An identifier, not prose — stays "SHA" in both languages.
      sha: 'SHA',
    },
  },
  analyze: {
    emptyHeading: 'Nothing in the water yet',
    emptyDescription: 'Add 2 players to start calculation.',
    emptyButton: 'New Player',
  },
  history: {
    emptyHeading: 'Nothing to look back on',
    emptyDescription: "Run an analysis and it'll show up here.",
  },
};

export type Resources = typeof en;
