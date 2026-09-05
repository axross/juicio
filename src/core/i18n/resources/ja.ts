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
      // issue #211: drafted, not yet reviewed by the maintainer, unlike
      // every other string in this namespace — see `./en.ts`'s matching
      // comment and `analytics` below.
      analytics: 'アナリティクス',
    },
    // issue #211's Analytics child screen. drafted, not yet reviewed by the
    // maintainer, per `docs/conventions/design-system.md`'s Japanese Copy
    // table convention for a not-yet-settled string — see `theme.description`
    // above for the same reversal this namespace's other strings don't need.
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
    // (issue #99) — drafted, not yet reviewed by the maintainer the way
    // every other string in this namespace already has been.
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
    // this feature's own new copy (issue #87) — reviewed for consistency
    // with the rest of this namespace's tone, not yet reviewed by the
    // maintainer the way the rest of this file's Japanese copy states it
    // has been (see this file's own header comment). that carve-out covers
    // every key below: `title`, `holeCardsSubtitle`,
    // `holeCardsAccessibilityLabel`, `handRangeAccessibilityLabel`,
    // `editAccessibilityLabel`, and `deleteAccessibilityLabel` are all this
    // same implementer's translation, none of it maintainer-reviewed yet —
    // issue #102 added `resultPercentage` (identical to English — see
    // `./en.ts`'s own comment on why a numeral needs no translation) and
    // extended the two accessibility labels with the same result-figure and
    // "opens a breakdown" phrasing `./en.ts` adds, under this same
    // not-yet-reviewed carve-out. issue #103 turns `resultPercentage` into
    // an interpolated `{{percent}}%` template (still identical to English
    // for the same reason) and adds `resultUnavailableLabel`, drafted the
    // same not-yet-reviewed way.
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
    // see `./en.ts` for why this exists and what each key covers — the
    // first three are the maintainer-approved half of that pair; the
    // English mirroring them is drafted, not reviewed. `impossibleSituation`
    // (issue #103) breaks that reversal: it is new in both languages, so
    // both are drafted and neither is yet maintainer-approved — see
    // `./en.ts`'s own comment on it.
    toast: {
      incompleteBoard: 'ボードが不完全だったため元に戻しました。',
      incompleteHoleCardsAdding: '不完全なホールカードだったためプレイヤーを追加しませんでした。',
      incompleteHoleCardsEditing: '不完全なホールカードだったため元に戻しました。',
      impossibleSituation: 'その組み合わせは起こり得ないため、エクイティを計算できませんでした。',
      dismissAccessibilityLabel: 'アラートメッセージを閉じる',
    },
    // the Equity Breakdown sheet (issue #102) — see `./en.ts`'s own
    // comment for what each key covers. drafted by this same implementer,
    // not yet reviewed by the maintainer, the same carve-out `playerRow`
    // above already carries for its own new strings.
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
    },
  },
  presets: {
    // the Preset list screen (issue #176) — see `./en.ts`'s matching
    // comment for what replaced `nativeDemo` and why. every string below is
    // this implementer's own draft, not yet reviewed by the maintainer the
    // way the rest of this file's Japanese copy states it has been (this
    // file's own header comment).
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
    editor: {
      createTitle: '新規プリセット',
      editTitle: 'プリセットを編集',
    },
  },
  history: {
    emptyHeading: '振り返る記録がまだありません',
    emptyDescription: '解析を実行すると、ここに表示されます。',
    // issue #180 — drafted, not yet reviewed by the maintainer the way
    // `./en.ts`'s own comment on this namespace's other rows already
    // states for that file's own unreviewed rows; see this project's own
    // convention (`docs/conventions/design-system.md`'s Japanese Copy
    // section) for what "drafted" means here.
    dateHeading: {
      today: '今日',
      yesterday: '昨日',
    },
    entryRow: {
      // identical to `analyze.playerRow.holeCardsSubtitle`'s own
      // maintainer-reviewed Japanese copy — see `./en.ts`'s own comment
      // on why this is a duplicated key rather than a cross-namespace
      // reuse.
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
      // issue #99's own addition — see `./en.ts`'s matching comment for
      // why this ships drafted rather than maintainer-reviewed, unlike the
      // rest of this namespace.
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
