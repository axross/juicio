/**
 * the Blocker Score section's own model (docs/specs/equity-breakdown.md's
 * "The Blocker Score"): reading one figure out of a settled result's
 * `blockerScores` buffer, this project's own round-half-away-from-zero
 * formatting rule, and the grouping rule that decides, within one Rank
 * Pair, which of its live Card Pairs share one entry and which get their
 * own row. No I/O, no React — `../ui/equity-breakdown-blocker-score/
 * equity-breakdown-blocker-score.tsx` is this module's own caller.
 *
 * Every "combo" this project's own copy conventions license on screen
 * (docs/conventions/copy-conventions.md) is a **Card Pair** in this module
 * and everywhere else this codebase speaks about the domain — see
 * docs/glossary.md's Hand Ranges section.
 */

import { cardPair, cardPairNumber, type CardPair } from '@/shared/model/card-pair';
import { SUITS } from '@/shared/model/card';
import { parseRankPairKey, type RankPairKey } from '@/shared/model/rank-pair';

/**
 * one row the Blocker Score section renders: either one Rank Pair standing
 * for the largest group of its own live Card Pairs that all display the
 * same figures (`combinationCount` names how many), or one Card Pair pulled
 * out onto its own row because it displays something different — never
 * both at once for the same Card Pair. `values` is one already-rounded
 * figure per opponent, in opponent-ordinal order (`blockerScoreOpponentOrdinal`
 * below) — the same array `blockerScoreRowsForRankPair`'s own grouping key
 * is built from, so a row's own displayed figures and the group it was
 * placed in can never disagree (docs/specs/equity-breakdown.md's "System
 * design": "the group key is the formatted figure, not the raw float").
 */
export type BlockerScoreRow =
  | {
      readonly kind: 'rankPair';
      readonly rankPairKey: RankPairKey;
      /** how many of this Rank Pair's own live Card Pairs this row stands
       * for — always more than one; a lone Card Pair never takes a Rank
       * Pair row (`blockerScoreRowsForRankPair`'s own doc comment). */
      readonly combinationCount: number;
      readonly values: readonly number[];
    }
  | {
      readonly kind: 'cardPair';
      readonly cardPair: CardPair;
      readonly values: readonly number[];
    };

/**
 * round-half-away-from-zero to one decimal: `Math.round` alone rounds a
 * half toward positive infinity, which reads a negative half the wrong way
 * — `Math.round(-1.25 * 10) / 10` gives `-1.2`, not the `-1.3` this
 * project's own 四捨五入 rule calls for. Rounding the **magnitude** instead
 * (always non-negative, so `Math.round`'s own half-up behaviour already is
 * half-away-from-zero) and reattaching `value`'s own sign afterward is what
 * fixes it — docs/specs/equity-breakdown.md's "System design" section
 * states this exact fix.
 */
export function roundBlockerScoreToOneDecimal(value: number): number {
  const magnitude = Math.round(Math.abs(value) * 10) / 10;
  return value < 0 ? -magnitude : magnitude;
}

/**
 * one figure, formatted for display: signed percentage points to exactly
 * one decimal, sign always explicit — `+1.3`, `-2.1`, `+0.0`. A value that
 * rounds to zero (`roundBlockerScoreToOneDecimal` above) always reads
 * `+0.0`, never `-0.0`, regardless of `value`'s own original sign — the
 * same convention this project's own high-fidelity mockup's reference
 * `fmt()` establishes. This is also the group key `blockerScoreRowsForRankPair`
 * below groups Card Pairs by, per this project's own rule that the key is
 * the **formatted** figure, not the raw float: two Card Pairs whose raw
 * scores differ only past the displayed precision must group together, and
 * two rows must never display the same figure while sitting apart.
 */
export function formatBlockerScore(value: number): string {
  const rounded = roundBlockerScoreToOneDecimal(value);
  if (rounded === 0) {
    return '+0.0';
  }
  return (rounded > 0 ? '+' : '') + rounded.toFixed(1);
}

/**
 * one opponent's own **opponent ordinal** — the skip-self index
 * `blockerScores` is indexed by, minor to a Card Pair's own **card pair
 * number** — from that opponent's own seat index and the scoring player's:
 * the opponent's seat index, minus one once the opponent sits past the
 * scoring player. Matches
 * `modules/espada-engine/src/specs/espada-engine.nitro.ts`'s own
 * `EspadaEquityPlayerResult.blockerScores` doc comment, and
 * docs/specs/equity-breakdown.md's "System design" section, bit for bit.
 */
export function blockerScoreOpponentOrdinal(
  opponentSeatIndex: number,
  scoringPlayerSeatIndex: number,
): number {
  return opponentSeatIndex - (opponentSeatIndex > scoringPlayerSeatIndex ? 1 : 0);
}

/**
 * whether a settled result's own `blockerScores` buffer actually carries a
 * settled calculation — `false` for a progress tick's empty
 * `ArrayBuffer(0)`, per `EspadaEquityPlayerResult.blockerScores`'s own doc
 * comment ("a progress tick carries this `ArrayBuffer` empty"), and equally
 * `false` for the practically-unreachable no-result case
 * `../ui/equity-breakdown-sheet/equity-breakdown-sheet.tsx` already
 * degrades for (a deleted player, or a restarted evaluation, while this
 * sheet somehow stays open) — that caller passes a stand-in empty buffer
 * for exactly this reason, so this one check covers both. `../ui/
 * equity-breakdown-blocker-score/equity-breakdown-blocker-score.tsx` reads
 * this once, ahead of choosing between its pre-settlement skeleton and its
 * settled rows — named rather than an inline `blockerScores.byteLength > 0`
 * at that call site, so the one sentinel this module relies on is stated
 * and tested in one place.
 */
export function isBlockerScoreSettled(blockerScores: ArrayBuffer): boolean {
  return blockerScores.byteLength > 0;
}

/**
 * one Card Pair's own blocker score against one opponent, read directly out
 * of a settled result's `blockerScores` buffer
 * (`EspadaEquityPlayerResult.blockerScores`, `@/modules/espada-engine/index`)
 * — `CARD_PAIR_COUNT × (playerCount − 1)` 64-bit floats, row-major by **card
 * pair number** then `opponentOrdinal` above. `blockerScores` empty (zero
 * bytes) — a progress tick, never a settled result — reads as `NaN`, the
 * same "no score yet" sentinel a non-live Card Pair's own slot already
 * carries, so a caller need not special-case "not yet settled" apart from
 * "not live."
 *
 * **scaled by ×100 here, the one place every caller in this module reads
 * the buffer through.** The engine's own buffer carries a plain fraction in
 * `[-1, 1]` — `modules/espada-engine/src/specs/espada-engine.nitro.ts`'s own
 * `blockerScores` doc comment states this explicitly, and
 * `modules/espada-engine/lib/espada-engine/src/equity_job.rs`'s own
 * `blocker_score` returns `baseline - restricted`, both plain
 * `share_weight / total_weight` ratios with no scaling of their own — while
 * docs/specs/equity-breakdown.md and the approved plan both call for
 * **signed percentage points** on screen. This is the same fraction-to-
 * percentage-points step this project already takes for the aggregate
 * `equity` figure itself (`../ui/equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx`'s own `result.equity * 100`,
 * `../ui/player-row/live-content.tsx`'s identical `* 100`) — applied once,
 * at the read, so every caller downstream (`roundBlockerScoreToOneDecimal`,
 * `formatBlockerScore`, the grouping key they feed) already works in
 * display-scale percentage points and never has to know the buffer's own
 * raw fraction scale.
 */
export function readBlockerScore(
  blockerScores: ArrayBuffer,
  cardPairNum: number,
  opponentOrdinal: number,
  playerCount: number,
): number {
  if (blockerScores.byteLength === 0) {
    return NaN;
  }
  const view = new Float64Array(blockerScores);
  return view[cardPairNum * (playerCount - 1) + opponentOrdinal] * 100;
}

/**
 * every Card Pair one Rank Pair stands for, in an arbitrary but fixed
 * enumeration order — `blockerScoreRowsForRankPair` below sorts this
 * module's own **card pair number** ordering out of it immediately, so
 * nothing downstream depends on the order this function itself produces.
 * 6 for a pocket pair (`SUITS`'s own C(4,2) pairs), 4 for suited (one per
 * suit), 12 for offsuit (every non-matching suit pairing) — the same counts
 * `@/shared/model/rank-pair`'s own `cardPairCount` names.
 */
function cardPairsForRankPair(key: RankPairKey): readonly CardPair[] {
  const pair = parseRankPairKey(key);
  if (pair.isPocket) {
    const pairs: CardPair[] = [];
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        pairs.push(
          cardPair(
            { rank: pair.highRank, suit: SUITS[i] },
            { rank: pair.highRank, suit: SUITS[j] },
          ),
        );
      }
    }
    return pairs;
  }
  if (pair.suitedness === 'suited') {
    return SUITS.map((suit) =>
      cardPair({ rank: pair.highRank, suit }, { rank: pair.lowRank, suit }),
    );
  }
  const pairs: CardPair[] = [];
  for (const highSuit of SUITS) {
    for (const lowSuit of SUITS) {
      if (highSuit !== lowSuit) {
        pairs.push(
          cardPair({ rank: pair.highRank, suit: highSuit }, { rank: pair.lowRank, suit: lowSuit }),
        );
      }
    }
  }
  return pairs;
}

/**
 * one live Card Pair's own working record while `blockerScoreRowsForRankPair`
 * below groups it — distinct from `../model/strength-band.ts`'s own
 * `LiveCardPair` (that one pairs an `equity`/`strength` for the histogram;
 * this one pairs a Card Pair with its own already-rounded, per-opponent
 * blocker-score figures for grouping), so this type's own name says
 * "entry" rather than reusing that one's shape or name.
 */
type LiveCardPairEntry = {
  readonly cardPair: CardPair;
  /** this Card Pair's own position among its Rank Pair's live Card Pairs,
   * in ascending **card pair number** order — this module's own "canonical
   * order" for a tie-break and for the final row order alike. */
  readonly canonicalIndex: number;
  readonly values: readonly number[];
  /** the grouping key — every one of `values` above, formatted
   * (`formatBlockerScore`) and joined — never the raw floats; see
   * `formatBlockerScore`'s own doc comment for why. */
  readonly groupKey: string;
};

/**
 * one Rank Pair's own Blocker Score rows (docs/specs/equity-breakdown.md's
 * "Which entries a rank pair produces"): every one of `rankPairKey`'s live
 * Card Pairs, grouped by the exact figures they display against every
 * opponent. The **largest** group is left implicit under `rankPairKey`'s
 * own label — a `'rankPair'` row, `combinationCount` naming its size — and
 * every Card Pair outside it gets its own `'cardPair'` row. A tie for
 * largest resolves toward the group containing the earliest Card Pair in
 * canonical (**card pair number**) order, so the outcome never depends on
 * iteration order. If the largest group holds only one Card Pair — every
 * live Card Pair displays something different — no `'rankPair'` row appears
 * at all and every row is its own `'cardPair'`. Returns `[]` when this Rank
 * Pair has no live Card Pair at all.
 *
 * The returned rows are already in this Rank Pair's own presentation
 * order: sorted by each row's own earliest member's `canonicalIndex`, so a
 * `'rankPair'` row sits exactly where its earliest standing-for Card Pair
 * would have, and every pulled-out `'cardPair'` row keeps its own canonical
 * position among the rest — the same ordering this project's own
 * high-fidelity mockup's reference `buildBlockerRows()` produces.
 *
 * Liveness is read off `equities`, exactly the test the histogram above
 * this section already applies (`../model/strength-band.ts`'s own
 * `liveCardPairsFromBuffers`), not off `blockerScores` itself — a card pair
 * that is not live never gets an entry here regardless of what its own
 * (meaningless) `blockerScores` slot happens to hold.
 *
 * Hardening, not a reachable defect today: every real call site guards on
 * `isBlockerScoreSettled(equities)` first, and a genuinely settled result
 * always carries an `equities` buffer sized for every card pair number this
 * function looks up. But this function's own exported signature documents
 * no such precondition, so it bounds its liveness check the same way
 * `liveCardPairsFromBuffers` above bounds its loop — by `equityView.length`
 * — rather than indexing unconditionally, so an undersized or empty
 * `equities` yields "nothing live" instead of `Number.isNaN(undefined)`
 * silently reading `false` and treating every card pair as live.
 */
export function blockerScoreRowsForRankPair(
  rankPairKey: RankPairKey,
  equities: ArrayBuffer,
  blockerScores: ArrayBuffer,
  playerCount: number,
): readonly BlockerScoreRow[] {
  const opponentCount = playerCount - 1;
  const equityView = new Float32Array(equities);

  const canonicalCardPairs = cardPairsForRankPair(rankPairKey)
    .map((pair) => ({ pair, number: cardPairNumber(pair) }))
    .sort((a, b) => a.number - b.number);

  const live: LiveCardPairEntry[] = [];
  canonicalCardPairs.forEach(({ pair, number }, canonicalIndex) => {
    if (number >= equityView.length || Number.isNaN(equityView[number])) {
      return; // not live — never listed, never counted toward grouping.
    }
    const values: number[] = [];
    for (let ordinal = 0; ordinal < opponentCount; ordinal++) {
      values.push(
        roundBlockerScoreToOneDecimal(
          readBlockerScore(blockerScores, number, ordinal, playerCount),
        ),
      );
    }
    live.push({
      cardPair: pair,
      canonicalIndex,
      values,
      groupKey: values.map((value) => formatBlockerScore(value)).join('|'),
    });
  });

  if (live.length === 0) {
    return [];
  }

  const groups = new Map<string, LiveCardPairEntry[]>();
  for (const entry of live) {
    const group = groups.get(entry.groupKey);
    if (group === undefined) {
      groups.set(entry.groupKey, [entry]);
    } else {
      group.push(entry);
    }
  }

  let largestMembers: readonly LiveCardPairEntry[] | null = null;
  let largestKey: string | null = null;
  let largestEarliestIndex = Infinity;
  for (const [groupKey, members] of groups) {
    const earliestIndex = Math.min(...members.map((member) => member.canonicalIndex));
    if (
      largestMembers === null ||
      members.length > largestMembers.length ||
      (members.length === largestMembers.length && earliestIndex < largestEarliestIndex)
    ) {
      largestMembers = members;
      largestKey = groupKey;
      largestEarliestIndex = earliestIndex;
    }
  }

  const indexedRows: { readonly canonicalIndex: number; readonly row: BlockerScoreRow }[] = [];

  if (largestMembers !== null && largestMembers.length > 1) {
    const earliestIndex = Math.min(...largestMembers.map((member) => member.canonicalIndex));
    indexedRows.push({
      canonicalIndex: earliestIndex,
      row: {
        kind: 'rankPair',
        rankPairKey,
        combinationCount: largestMembers.length,
        values: largestMembers[0].values,
      },
    });
    for (const [groupKey, members] of groups) {
      if (groupKey === largestKey) {
        continue;
      }
      for (const member of members) {
        indexedRows.push({
          canonicalIndex: member.canonicalIndex,
          row: { kind: 'cardPair', cardPair: member.cardPair, values: member.values },
        });
      }
    }
  } else {
    for (const entry of live) {
      indexedRows.push({
        canonicalIndex: entry.canonicalIndex,
        row: { kind: 'cardPair', cardPair: entry.cardPair, values: entry.values },
      });
    }
  }

  indexedRows.sort((a, b) => a.canonicalIndex - b.canonicalIndex);
  return indexedRows.map((entry) => entry.row);
}

/**
 * the bar scale every row's own bar draws proportional to
 * (docs/specs/equity-breakdown.md's "Which entries a rank pair produces" —
 * "the largest absolute figure among all the entries currently listed,
 * across every opponent, reaches the end of its track"): the largest
 * absolute figure across every one of `rows`' own `values`, or `0` when
 * `rows` is empty or every figure it carries rounds to zero — `0` is a
 * valid, meaningful return here (`blockerScoreBarFraction` below reads it as
 * "draw no bar," never as a division to guard against on its own side).
 */
export function blockerScoreScale(rows: readonly BlockerScoreRow[]): number {
  let max = 0;
  for (const row of rows) {
    for (const value of row.values) {
      const magnitude = Math.abs(value);
      if (magnitude > max) {
        max = magnitude;
      }
    }
  }
  return max;
}

/**
 * one figure's own bar fill, as a fraction of its track's full length —
 * `0` when `scale` is `0` (an all-zero list), rather than dividing by zero;
 * otherwise `|value| / scale`, clamped to `1` so a figure exactly at scale
 * still reaches the end of its track rather than overshooting it by a
 * floating-point hair.
 */
export function blockerScoreBarFraction(value: number, scale: number): number {
  if (scale === 0) {
    return 0;
  }
  return Math.min(Math.abs(value), scale) / scale;
}
