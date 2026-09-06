# Copy Conventions

This project's own app-wide copy rules: the fixed strings the design
specifies for a section heading and an empty state, this project's own
corrections to on-screen wording the design file gets wrong or leaves
ambiguous, and the Japanese translation this project ships alongside the
English original for every string in the app.

- A section heading MUST be title case — `Players`, `Language`, `About` —
  never all caps, even where a frame in the design file shows an all-caps
  treatment (`BOARD`, `PLAYERS`).
- The Analyze empty state MUST use the heading `Nothing in the water yet`
  and the description `Add 2 players to start calculation.`
- The History empty state MUST use the heading `Nothing to look back on`
  and the description `Run an analysis and it'll show up here.`
- A player row and a preset row MUST state their subtitle the same way: the
  four tag axes' values, joined in the fixed order
  `Position, # of Players, Depth, Action` — for example
  `BTN, 6max, 100BB, Open`. A history row is exempt from this format (issue
  #180): a `HistoryEntry` carries no position, player-count, depth, or action
  data of its own to render that way, so its subtitle instead reuses the
  existing player-holding description — `Hole cards`, or a card-pair count
  (`RankPairGrid`'s `handRanges.cardPairCount`) — the same truncated holding
  text `../specs/calculation-history.md`'s own History Entries section
  documents as shipped and
  `../../src/features/history/ui/history-entry-row/history-entry-row.tsx`
  renders.
- The rank-pair grid's first shorthand chip reads `A2s+`, not `A*s` as the
  design file draws it — `A*s` is not standard hand-range notation, and
  `A2s+` selects the same rank pairs (every suited ace) in the notation the
  grid's own `55+` chip already uses (`+` meaning "and up" from the weakest
  kicker, the deuce). `A2s+` is also this shorthand's own espada
  range-notation token (see [specs/hand-ranges.md](../specs/hand-ranges.md)),
  so the label and the token are now the same string for this one chip,
  unlike the other two. See
  [decisions/2026-08-29-correct-the-suited-ace-shorthand-label-to-a2s-plus.md](../decisions/2026-08-29-correct-the-suited-ace-shorthand-label-to-a2s-plus.md).
- The Equity Breakdown histogram MUST use the high-saturation bar palette —
  the design file draws the same histogram twice, once at high saturation and
  once muted; the high-saturation version is authoritative.
- The word `combos` (the rank-pair grid's own count control, the Equity
  Breakdown histogram's y-axis, a range player's ad-hoc subtitle) MUST stay
  on screen — a poker player reads "combos" on that control in every other
  range tool, and this is on-screen copy, not a choice about vocabulary.
  The rank-pair grid's own count control renders it lowercase
  (`{{count}} combos`), the maintainer's own correction, made when they
  reviewed every string in the `handRanges` i18n namespace
  (`src/core/i18n/resources/en.ts`, `./ja.ts`), of what the design file
  itself draws capitalized (`Combos`); the ad-hoc subtitle now renders
  lowercase too (issue #87), because the players list reuses that same
  `handRanges` string rather than introducing a second one — so the two
  agree by construction, not by a second decision. **The histogram's own
  y-axis now renders lowercase too** (issue #102), settling the deferral
  this note used to carry: `equityBreakdown.chart.combosAxisLabel`
  (`src/core/i18n/resources/en.ts`, `./ja.ts`) is its own separate string,
  not `handRanges.cardPairCount` reused a third time, since the axis label
  names the unit alone (`combos`) rather than a count sentence
  (`{{count}} combos`) — but it follows the same lowercase correction for
  the same reason. What it counts is
  [glossary.md](../glossary.md)'s **card pair** — the two-card
  representation, not the **rank pair** a rank-pair grid cell is (one rank
  pair stands for several card pairs; see that entry). `combo` MUST NOT
  otherwise appear as a domain term in this project's own documents or code
  — see [glossary.md](../glossary.md)'s Hand Ranges section, which carries
  **card pair** and **rank pair** instead — precisely because the screen
  already uses the word for something a reader could otherwise mistake for
  either without this note.

## Japanese Copy

Every string this app renders exists in both `en` and `ja` — see
[decisions/2026-08-26-adopt-i18next-for-localization.md](../decisions/2026-08-26-adopt-i18next-for-localization.md).
The Japanese copy below was drafted for issue #6 and approved by the
maintainer as written, at the same plan gate that approved the Theme
section's design. The `Theme` child screen's description row is later
copy, drafted for issue #76 and approved the same way, at that issue's own
plan gate. `src/core/i18n/resources/en.ts` and `./ja.ts` are the runtime
source `t()` reads from; this table is this copy's other home, so a reader
does not have to open the resource files to know what the app says in
Japanese.

| Surface | English | Japanese |
| --- | --- | --- |
| Analyze tab label | `Analyze` | `解析` |
| History tab label | `History` | `履歴` |
| Presets tab label | `Presets` | `プリセット` |
| Settings tab label | `Settings` | `設定` |
| Back affordance | `Back` | `戻る` |
| `Language` section heading, disclosure-row label, and child-screen title | `Language` | `言語` |
| Language option | `English (United States)` | `English (United States)` |
| Language option | `日本語` | `日本語` |
| `Theme` section heading, disclosure-row label, and child-screen title | `Theme` | `テーマ` |
| Theme option | `System` | `システム` |
| Theme option | `Light` | `ライト` |
| Theme option | `Dark` | `ダーク` |
| `Theme` child screen's description (issue #76) | `System follows the device's own appearance setting and switches with it. Light and Dark stay fixed whatever the device is set to.` | `「システム」はデバイス本体の外観設定に従い、設定が変わると自動的に切り替わります。「ライト」と「ダーク」はデバイスの設定にかかわらず固定されます。` |
| `About` section heading | `About` | `このアプリについて` |
| About row | `Feedback` | `フィードバック` |
| About row, `Analytics` child screen's own nav bar title (issue #211) | `Analytics` | `アナリティクス` |
| Analytics child screen, switch label (issue #211) | `Share usage analytics` | `利用状況データの共有` |
| Analytics child screen, description (issue #211) | `Helps us understand which parts of the app get used, so we can improve them. No hand, card, or other personal information is ever included.` | `アプリのどの部分が使われているかを把握し、改善に役立てるためのものです。手札やカードなどの個人情報が含まれることはありません。` |
| Analytics child screen, switch value | `On` / `Off` | `オン` / `オフ` |
| Technical Information label | `Build` | `ビルド` |
| Technical Information label | `App Version` | `アプリバージョン` |
| Technical Information label | `Build Number` | `ビルド番号` |
| Technical Information label | `SHA` | `SHA` |
| Analyze `Players` section heading | `Players` | `参加プレイヤー` |
| Analyze empty-state heading | `Nothing in the water yet` | `まだ何も泳いでいません` |
| Analyze empty-state description | `Add 2 players to start calculation.` | `プレイヤーを2人追加すると計算が始まります。` |
| Analyze add-player FAB | `New Player` | `プレイヤーを追加` |
| Analyze player row, result unavailable | `not yet available` | `未算出` |
| History empty-state heading | `Nothing to look back on` | `振り返る記録がまだありません` |
| History empty-state description | `Run an analysis and it'll show up here.` | `解析を実行すると、ここに表示されます。` |
| Card/range input sheet, `Hand Range` tab | `Hand Range` | `ハンドレンジ` |
| Card/range input sheet, `Cards` tab | `Cards` | `カード` |
| Card/range input sheet, drag handle | `Dismiss card and hand range input` | `カードとハンドレンジの入力をやめる` |
| Card/range input sheet, modal title | `Enter a player's hole cards or hand range` | `プレイヤーのホールカードまたはハンドレンジを入力する` |
| Board input sheet, drag handle | `Dismiss board card input` | `ボードのカード入力をやめる` |
| Board input sheet, modal title | `Enter the board's community cards` | `ボードのコミュニティカードを入力する` |
| Toast, `IncompleteBoard` | `The board was incomplete, so it was reverted.` | `ボードが不完全だったため元に戻しました。` |
| Toast, `IncompleteHoleCards`, adding a player | `The hole cards were incomplete, so no player was added.` | `不完全なホールカードだったためプレイヤーを追加しませんでした。` |
| Toast, `IncompleteHoleCards`, editing an existing player | `The hole cards were incomplete, so the player was reverted.` | `不完全なホールカードだったため元に戻しました。` |
| Toast, `ImpossibleSituation` | `This combination is impossible, so equity couldn't be calculated.` | `その組み合わせは起こり得ないため、エクイティを計算できませんでした。` |
| Toast, dismiss affordance | `Dismiss alert message` | `アラートメッセージを閉じる` |

The four card/range input sheet rows above, and every other `handRanges`
string in `src/core/i18n/resources/ja.ts` (the shorthand chips', the grid
cells', and the preview slots' own accessibility labels — templated strings
not reproduced in this table), are approved by the maintainer as written,
the same way the rest of this section's Japanese copy is — the maintainer
reviewed every string in the `handRanges` namespace and this table reflects
their corrections.

**The two board input sheet rows are the exception, and are not yet
reviewed that way.** The maintainer approved *that* the board's copy
changes — its row label `Board, no cards yet` gaining one label per slot
beneath it, and the new sheet needing a title and a handle label of its own
— at issue #85's plan gate. The row label itself is unchanged in both
languages: the row keeps it as a `summary`, which the per-slot labels did
not replace. They have not reviewed the Japanese wording each
string landed on, nor the board's own templated per-slot labels, which this
table does not reproduce for the same reason it reproduces no other
templated string. Whoever next reviews the `analyze` namespace should read
them as drafted, not as settled.

**Issue #99 adds two further, opposite carve-outs.** The board's own two
*new* templated accessibility labels — `analyze.board.
filledSlotAccessibilityLabel` and `.populatedAccessibilityLabel`
(`src/core/i18n/resources/en.ts`/`./ja.ts`) — and `handRanges.card.
unavailableAccessibilityLabel`, read whenever a card renders in the new
unavailable state — are drafted the same way the two board input sheet rows
above are, and this table does not reproduce them for the same
templated-string reason. **The four toast rows above are the opposite
case: their Japanese is maintainer-approved as written, at the same gate
that approved options A3 and B3 of issue #99's own design exhibit, and the
English mirroring it is what is drafted and not yet reviewed** — the
reverse of every other row in this table, where English ships settled and
Japanese is what carries the "drafted" caveat. Whoever next reviews this
namespace's English copy should read these four rows as the ones still
open, rather than assuming the whole table shares one review state.

**Issue #103 adds two further rows that join the board input sheet rows'
own category, not the four toast rows' reversed one.**
`analyze.playerRow.resultUnavailableLabel` (`Analyze player row, result
unavailable` above) and `analyze.toast.impossibleSituation` (`Toast,
ImpossibleSituation` above) are both new in both languages, drafted from
this project's own existing copy registers and not yet reviewed by the
maintainer in either column — `src/core/i18n/resources/en.ts`/`./ja.ts`'s
own comments on each say so directly. Read both rows as drafted, not as
settled, the same way the two board input sheet rows above are.

**Issue #211 adds four further rows that join the same drafted-and-not-yet-
reviewed category.** The `About` row's `Analytics` child-screen nav bar
title, and the Analytics child screen's own switch label, description, and
`On`/`Off` values, are all new in both languages, and neither column has
been reviewed by the maintainer — `src/core/i18n/resources/en.ts`/`./ja.ts`'s
own comments on `about.analytics` and `analytics` say so directly. Read all
four rows as drafted, not as settled, the same way the two board input
sheet rows above are.

**Issue #293 adds the Rank Pair list's own `equityBreakdown.rankPairs` copy
and the Blocker Score section's `equityBreakdown.blockerScore` copy, in
both languages, neither reviewed by the maintainer.** Every string either
key holds is either a group heading or an accessibility label built by
interpolation (`{{hand}}`, `{{count}}`, `{{value}}`, and the like) — the
same templated-string reason the two board input sheet rows and issue #99's
own two carve-outs above are not reproduced in this table —
`src/core/i18n/resources/en.ts`/`./ja.ts`'s own comments on `rankPairs` and
`blockerScore` say so directly. Whoever next reviews the `equityBreakdown`
namespace should read both blocks as drafted, not as settled, the same way
the two board input sheet rows above are.

`English (United States)`, `日本語`, and `SHA` are deliberately identical in
both languages: a language names itself, and an identifier is not prose.
The `Build` row's three values — `Development`, `Preview`, `Production` —
are the one further exception: they stay in English in both languages,
confirmed by the maintainer at the plan gate, because
[glossary.md](../glossary.md) defines Build Channel by those exact
literals and the same three words label the Sentry environment and the CI
pipeline — translating only the on-screen copy would break the tie between
what a user reads and what anyone can search for.
