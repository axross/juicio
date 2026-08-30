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
      description:
        '「システム」はデバイス本体の外観設定に従い、設定が変わると自動的に切り替わります。「ライト」と「ダーク」はデバイスの設定にかかわらず固定されます。',
    },
    about: {
      sectionTitle: 'このアプリについて',
      feedback: 'フィードバック',
    },
    feedback: {
      intro: 'うまくいっていること、いないこと、ほしい機能などを教えてください。',
      messageLabel: 'メッセージ',
      messagePlaceholder: '伝えたいことを書いてください',
      messageRequired: 'メッセージを入力してください。',
      nameLabel: '名前（任意）',
      namePlaceholder: 'お名前',
      emailLabel: 'メールアドレス（任意）',
      emailPlaceholder: 'you@example.com',
      emailHint: '返信が必要な場合のみ入力してください。',
      emailInvalid: 'メールアドレスの形式が正しくありません。',
      submit: '送信',
      sentHeading: 'フィードバックをありがとうございます',
      sentBody: 'メッセージを送信しました。',
      unavailable:
        'このビルドからはフィードバックを送信できません。リリースビルドからお試しください。',
      sendFailed: 'メッセージを送信できませんでした。もう一度お試しください。',
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
    // see `./en.ts` for why the row's single label became one per slot,
    // and why there is no filled counterpart.
    board: {
      slotAccessibilityLabel: 'ボードの{{position}}枚目が選択されていません',
      // see `./en.ts` for why the row keeps a summary of its own alongside
      // the five per-slot labels.
      allSlotsEmptyAccessibilityLabel: 'ボード、カードはまだありません',
    },
    // the board input sheet — see `./en.ts` for why its copy lives in this
    // namespace and `{{card}}` stays in `handRanges.card` below.
    boardInput: {
      emptySlotAccessibilityLabel: 'ボードの{{position}}枚目が選択されていません',
      filledSlotAccessibilityLabel: 'ボードの{{position}}枚目: {{card}}',
      focusedSlotAccessibilityLabel:
        'ボードの{{position}}枚目（{{card}}）にフォーカスを当てています。次に選ぶカードに差し替わります。',
      allSlotsEmptyAccessibilityLabel: 'ボードのカードが選択されていません',
      handle: {
        accessibilityLabel: 'ボードのカード入力をやめる',
      },
      sheet: {
        accessibilityLabel: 'ボードのコミュニティカードを入力する',
      },
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
    // like the rest of this file, every string in this namespace has now
    // been reviewed by the maintainer, a native Japanese speaker.
    tabs: {
      handRange: 'ハンドレンジ',
      cards: 'カード',
    },
    chip: {
      accessibilityLabel: '{{shorthand}} を適用',
    },
    // identical to English: see `./en.ts`'s `cardPairCount` comment for
    // why "combos" isn't translated.
    cardPairCount: '{{count}} combos',
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
        // poker's own name for the rank-2 card — see `./en.ts`'s matching
        // comment.
        '2': 'デュース',
      },
      suitName: {
        s: 'スペード',
        h: 'ハート',
        d: 'ダイヤ',
        c: 'クラブ',
      },
    },
    // see `./en.ts`'s matching comment for why `slotName` exists and why
    // `filledSlotAccessibilityLabel` alone keeps `{{index}}`.
    cards: {
      slotName: {
        left: '左のカード',
        right: '右のカード',
      },
      emptySlotAccessibilityLabel: '{{slot}}が選択されていません',
      filledSlotAccessibilityLabel: 'ホールカード{{index}}: {{card}}',
      focusedSlotAccessibilityLabel:
        '{{slot}}（{{card}}）にフォーカスを当てています。次に選ぶカードに差し替わります。',
      bothSlotsEmptyAccessibilityLabel: 'カードがどちらも選択されていません',
    },
    handle: {
      accessibilityLabel: 'カードとハンドレンジの入力をやめる',
    },
    sheet: {
      accessibilityLabel: 'プレイヤーのホールカードまたはハンドレンジを入力する',
    },
  },
};
