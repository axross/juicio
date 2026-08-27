import type { Resources } from './en';

/**
 * The complete Japanese translation resources, typed against `./en.ts`'s
 * `Resources` shape so this object cannot omit, misname, or add a key
 * relative to the English resources — see that module's doc comment.
 *
 * Drafted for issue #6 and approved by the maintainer as written; `English
 * (United States)` and `日本語` are deliberately identical to the English
 * resource (a language names itself), and `SHA` is an identifier, not
 * translated prose.
 */
export const ja: Resources = {
  navigation: {
    analyzeTab: '解析',
    historyTab: '履歴',
    presetsTab: 'プリセット',
    settingsTab: '設定',
    back: '戻る',
  },
  settings: {
    language: {
      sectionTitle: '言語',
      optionEnglish: 'English (United States)',
      optionJapanese: '日本語',
    },
    theme: {
      sectionTitle: 'テーマ',
      optionSystem: 'システム',
      optionLight: 'ライト',
      optionDark: 'ダーク',
    },
    about: {
      sectionTitle: 'このアプリについて',
      feedback: 'フィードバック',
    },
    technicalInfo: {
      build: 'ビルド',
      appVersion: 'アプリバージョン',
      buildNumber: 'ビルド番号',
      sha: 'SHA',
    },
  },
  analyze: {
    emptyHeading: 'まだ何も泳いでいません',
    emptyDescription: 'プレイヤーを2人追加すると計算が始まります。',
    emptyButton: 'プレイヤーを追加',
  },
  history: {
    emptyHeading: '振り返る記録がまだありません',
    emptyDescription: '解析を実行すると、ここに表示されます。',
  },
};
