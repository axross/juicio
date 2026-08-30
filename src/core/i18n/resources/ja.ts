import type { Resources } from './en';

/**
 * Japanese translation resources, typed against `./en.ts`'s `Resources`
 * shape so this object cannot omit, misname, or add a key relative to the
 * English resources — see that module's doc comment.
 *
 * the maintainer approved this copy as written. `English (United States)`
 * and `日本語` stay identical to the English resource (a language names
 * itself); `SHA` is an identifier, not translated prose.
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
    // unlike the rest of this file, no string in this namespace has been
    // reviewed by a native speaker or the maintainer — treat the whole
    // block as provisional.
    tabs: {
      handRange: 'ハンドレンジ',
      cards: 'カード',
    },
    chip: {
      accessibilityLabel: '{{shorthand}} を適用',
    },
    // identical to English: see `./en.ts`'s `cardPairCount` comment for
    // why "Combos" isn't translated.
    cardPairCount: '{{count}} Combos',
    grid: {
      // `{{rankPair}}` is this project's own notation (`AKs`), not
      // translated — see `./en.ts`.
      cellAccessibilityLabel: 'ランクペア {{rankPair}}',
    },
    // word order reverses English's (suit before rank), which is why this
    // composes through two interpolations — see `./en.ts`.
    card: {
      nameTemplate: '{{suit}}の{{rank}}',
      rankName: {
        A: 'エース',
        K: 'キング',
        Q: 'クイーン',
        J: 'ジャック',
        T: 'テン',
        '9': 'ナイン',
        '8': 'エイト',
        '7': 'セブン',
        '6': 'シックス',
        '5': 'ファイブ',
        '4': 'フォー',
        '3': 'スリー',
        '2': 'ツー',
      },
      suitName: {
        s: 'スペード',
        h: 'ハート',
        d: 'ダイヤ',
        c: 'クラブ',
      },
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
