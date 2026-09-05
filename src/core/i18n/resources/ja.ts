import type { Resources } from './en';

/**
 * Japanese translation resources, typed against `./en.ts`'s `Resources`
 * shape so this object cannot omit, misname, or add a key relative to the
 * English resources — see that module's doc comment.
 *
 * `English (United States)` and `日本語` stay identical to the English
 * resource (a language names itself); `SHA` is an identifier, not
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
      description:
        '「システム」はデバイス本体の外観設定に従い、設定が変わると自動的に切り替わります。「ライト」と「ダーク」はデバイスの設定にかかわらず固定されます。',
    },
    about: {
      sectionTitle: 'このアプリについて',
      feedback: 'フィードバック',
      analytics: 'アナリティクス',
    },
    analytics: {
      switchLabel: '利用状況データの共有',
      description:
        'アプリのどの部分が使われているかを把握し、改善に役立てるためのものです。手札やカードなどの個人情報が含まれることはありません。',
      onValue: 'オン',
      offValue: 'オフ',
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
    // see `./en.ts` for why the row's single label became one per slot, and
    // for `filledSlotAccessibilityLabel`/`populatedAccessibilityLabel`
    // (issue #99).
    board: {
      slotAccessibilityLabel: 'ボードの{{position}}枚目が選択されていません',
      filledSlotAccessibilityLabel: 'ボードの{{position}}枚目: {{card}}',
      // see `./en.ts` for why the row keeps a summary of its own alongside
      // the five per-slot labels.
      allSlotsEmptyAccessibilityLabel: 'ボード、カードはまだありません',
      populatedAccessibilityLabel: 'ボード: {{cards}}',
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
    playerRow: {
      title: 'プレイヤー{{number}}',
      holeCardsSubtitle: 'ホールカード',
      holeCardsAccessibilityLabel: 'プレイヤー{{number}}: {{first}}と{{second}}。結果 {{result}}。',
      handRangeAccessibilityLabel:
        'プレイヤー{{number}}: カスタムハンドレンジ、{{combos}}。結果 {{result}}。エクイティの内訳を開きます。',
      resultPercentage: '{{percent}}%',
      // issue #103: what `{{result}}` above interpolates to when no result
      // is currently available for this player — see `./en.ts`'s own
      // comment for the full list of when that is.
      resultUnavailableLabel: '未算出',
      editAccessibilityLabel: 'プレイヤーを編集',
      deleteAccessibilityLabel: 'プレイヤーを削除',
    },
    // see `./en.ts` for why this key exists and what replaced it (issue
    // #155's persistent floating action button).
    newPlayerFab: {
      label: 'プレイヤーを追加',
    },
    // see `./en.ts` for why this exists and what each key covers.
    toast: {
      incompleteBoard: 'ボードが不完全だったため元に戻しました。',
      incompleteHoleCardsAdding: '不完全なホールカードだったためプレイヤーを追加しませんでした。',
      incompleteHoleCardsEditing: '不完全なホールカードだったため元に戻しました。',
      impossibleSituation: 'その組み合わせは起こり得ないため、エクイティを計算できませんでした。',
      dismissAccessibilityLabel: 'アラートメッセージを閉じる',
    },
    // the Equity Breakdown sheet — see `./en.ts`'s own comment for what
    // each key covers.
    equityBreakdown: {
      heading: 'エクイティの内訳',
      headerAccessibilityLabel:
        'プレイヤー{{number}}: カスタムハンドレンジ、{{combos}}。結果 {{result}}。',
      bands: {
        trash: 'トラッシュ',
        marginal: 'マージナル',
        value: 'バリュー',
        nuts: 'ナッツ',
      },
      chart: {
        combosAxisLabel: 'コンボ数',
        equityAxisLabel: 'エクイティ',
        accessibilityLabel:
          'エクイティの内訳グラフ。バー{{count}}本。横軸はエクイティで0から100、縦軸はコンボ数で0から{{max}}です。',
      },
      handle: {
        accessibilityLabel: 'エクイティの内訳を閉じる',
      },
      sheet: {
        accessibilityLabel: 'このプレイヤーのエクイティの内訳を見る',
      },
      // ランクペアの一覧（issue #234）— この実装者による下書きで、上の
      // `equityBreakdown` 内の他の新規文字列と同じく、まだメンテナーの
      // レビューを受けていない。
      rankPairs: {
        groupHeading: {
          pocket: 'ポケットペア',
          suited: 'スーテッド',
          offsuit: 'オフスート',
        },
        pocketAccessibilityLabel: '{{rank}}{{rank}}のポケットペア',
        suitedAccessibilityLabel: '{{highRank}}{{lowRank}}のスーテッド',
        offsuitAccessibilityLabel: '{{highRank}}{{lowRank}}のオフスート',
      },
    },
  },
  presets: {
    // the Preset list screen — see docs/specs/hand-ranges.md's "The Preset
    // List" section.
    list: {
      title: 'ハンドレンジプリセット',
      filterAxisLabel: {
        position: 'ポジション',
        players: '参加人数',
        stack: 'スタック',
        action: 'アクション',
      },
      filterChipAccessibilityLabel: '{{axis}}で絞り込む',
      removeFilterAccessibilityLabel: '{{value}}の絞り込みを解除',
      tagPickerSheet: {
        accessibilityLabel: 'プリセット一覧を絞り込む値を選択',
        handle: {
          accessibilityLabel: '絞り込みの選択を閉じる',
        },
      },
      row: {
        accessibilityLabel: '{{name}}。{{tags}}',
      },
      newPresetFab: {
        label: 'プリセットを追加',
      },
      empty: {
        heading: 'プリセットはまだありません',
        description: 'ハンドレンジをプリセットとして保存すると、ここに表示されます。',
      },
      filteredEmpty: {
        heading: '一致するプリセットがありません',
        description: '絞り込みを解除すると、他のプリセットが表示されます。',
      },
      error: {
        heading: 'プリセットを読み込めませんでした',
        description: '問題が発生しました。しばらくしてからもう一度お試しください。',
      },
    },
    // issue #177 — drafted, not yet reviewed by the maintainer, the same
    // carve-out `list`'s own new rows above once carried; see `./en.ts`'s
    // matching comment.
    editor: {
      createTitle: '新規プリセット',
      editTitle: 'プリセットを編集',
      nameLabel: '名前',
      namePlaceholder: '例: HJ Call against CO 4bet',
      nameRequired: '名前を入力してください。',
      handRangeHeading: 'ハンドレンジ',
      handRangeRequired: 'ランクペアを1つ以上選択してください。',
      bothRequired: '名前とハンドレンジの両方を入力してください。',
      tagsHeading: 'タグ',
      save: '保存',
      loadFailed: {
        heading: 'プリセットを読み込めませんでした',
        description: '問題が発生しました。しばらくしてからもう一度お試しください。',
      },
      saveFailed: 'プリセットを保存できませんでした。もう一度お試しください。',
    },
  },
  history: {
    emptyHeading: '振り返る記録がまだありません',
    emptyDescription: '解析を実行すると、ここに表示されます。',
    // see docs/specs/calculation-history.md's "History Entries" section for
    // "Today"/"Yesterday" grouping.
    dateHeading: {
      today: '今日',
      yesterday: '昨日',
    },
    entryRow: {
      // identical to `analyze.playerRow.holeCardsSubtitle`'s own Japanese
      // copy — see `./en.ts`'s own comment on why this is a duplicated key
      // rather than a cross-namespace reuse.
      holeCardsSubtitle: 'ホールカード',
      holeCardsAccessibilityLabel: '{{name}}: {{first}}と{{second}}。',
      handRangeAccessibilityLabel: '{{name}}: {{combos}}。',
      deleteAccessibilityLabel: '履歴を削除',
    },
    boardThumbnail: {
      populatedAccessibilityLabel: 'ボード: {{cards}}',
      noCardsAccessibilityLabel: 'この計算にはボードのカードが設定されていません',
    },
  },
  handRanges: {
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
      unavailableAccessibilityLabel: '{{card}}は選択できません',
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
