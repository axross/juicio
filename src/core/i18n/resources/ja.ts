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
};
