import type { Resources } from './en';

/**
 * the complete Japanese translation resources, typed against `./en.ts`'s
 * `Resources` shape so this object cannot omit, misname, or add a key
 * relative to the English resources — see that module's doc comment.
 *
 * drafted for issue #6 and approved by the maintainer as written; `English
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
    playersHeading: '参加プレイヤー',
    board: {
      accessibilityLabel: 'ボード、カードはまだありません',
    },
    emptyHeading: 'まだ何も泳いでいません',
    emptyDescription: 'プレイヤーを2人追加すると計算が始まります。',
    emptyButton: 'プレイヤーを追加',
  },
  presets: {
    nativeDemo: {
      heading: '別スレッド実行デモ',
      description:
        'バックグラウンドスレッドで素数を数えている間も、この画面は JavaScript スレッドでアニメーションを続けます。ジョブの実行中、フレームレートはアイドル時の基準値から10%以内に収まるはずです。',
      startButton: 'ジョブを開始',
      cancelButton: 'ジョブをキャンセル',
      progress: '進捗: {{percent}}%',
      result: '{{count}} 個の素数が見つかりました。',
      cancelled: 'ジョブがキャンセルされました。',
      error: 'ジョブが失敗しました: {{message}}',
      frameRate: 'フレームレート — 現在: {{current}}、最小: {{min}}、アイドル基準値: {{baseline}}',
      heartbeat: 'ハートビート: {{count}}',
    },
  },
  history: {
    emptyHeading: '振り返る記録がまだありません',
    emptyDescription: '解析を実行すると、ここに表示されます。',
  },
  handRanges: {
    // drafted for this change, not yet reviewed by a native speaker or
    // the maintainer the way the rest of this file's Japanese copy was for
    // issue #6. every string in this namespace is unreviewed, not some
    // subset of them — treat the whole block as provisional until the
    // maintainer reads it.
    tabs: {
      handRange: 'ハンドレンジ',
      cards: 'カード',
    },
    chip: {
      accessibilityLabel: '{{shorthand}} を適用',
    },
    // kept identical to the English resource — see `./en.ts`'s own
    // comment on why "Combos" is design copy that stays as drawn in both
    // languages.
    cardPairCount: '{{count}} Combos',
    grid: {
      // see `./en.ts`'s own comment: `{{rankPair}}` is this project's own
      // notation (`AKs`), not translated.
      cellAccessibilityLabel: 'ランクペア {{rankPair}}',
    },
    cards: {
      emptySlotAccessibilityLabel: 'ホールカード{{index}}、空です',
      filledSlotAccessibilityLabel: 'ホールカード{{index}}: {{card}}',
      focusedSlotAccessibilityLabel:
        'ホールカード{{index}}: {{card}}、フォーカス中 — 次に選ぶカードに差し替わります',
    },
    handle: {
      accessibilityLabel: 'カードとレンジの入力を閉じる',
    },
    sheet: {
      accessibilityLabel: 'プレイヤーのホールカードまたはハンドレンジを入力する',
    },
  },
};
