import type { Card } from '@/shared/model/card';
import type { CardPair } from '@/shared/model/card-pair';
import type { RankPairKey } from '@/shared/model/rank-pair';

/**
 * a History Entry's own holding representation (issue #178's plan) —
 * structurally identical to `@/features/hand-ranges/model/holding.ts`'s
 * `Holding`, deliberately *not* imported from there. A saved holding means
 * something to this feature alone from this point on (it is a permanent
 * record of what a calculation ran against, not live input state), the same
 * reasoning `docs/conventions/directory-structure.md`'s `features/` and
 * `shared/` section already applied to keep `Holding` itself out of
 * `shared/model/`. Because the two types are structurally identical, a
 * `Holding` value is directly assignable here with no cast and no import —
 * see `@/features/evaluations/adapter/use-equity-evaluation.ts`'s own save
 * call, which builds this shape from a `Player`'s `Holding` this way.
 */
export type HistoryEntryHolding =
  | { readonly kind: 'holeCards'; readonly holeCards: CardPair }
  | { readonly kind: 'handRange'; readonly rankPairs: ReadonlySet<RankPairKey> };

/**
 * one player's computed equity result — the same `{ win, tie, equity }`
 * shape `modules/espada-engine/src/specs/espada-engine.nitro.ts`'s
 * `EspadaEquityPlayerResult` reports, defined independently here rather
 * than imported: a History Entry stores this feature's own copy of the
 * numbers the engine produced, not a live reference to the engine's own
 * wire type.
 */
export type HistoryEntryResult = {
  readonly win: number;
  readonly tie: number;
  readonly equity: number;
};

/** one player, in seat order, as a saved History Entry records them. */
export type HistoryEntryPlayer = {
  readonly holding: HistoryEntryHolding;
  readonly result: HistoryEntryResult;
  /**
   * the rendered "Player N" display string `../../evaluations/ui/
   * player-row/player-row.tsx` showed for this player at the moment this
   * calculation was saved — the maintainer's own plan amendment on issue
   * #178, overriding that issue's own approved plan's Assumptions section
   * (which ruled out persisting `Player.number` as a saved player's
   * identity). A frozen copy of that one rendered string
   * (`t('playerRow.title', { number: player.number })`, namespace
   * `analyze`), not a live reference: i18next is never re-resolved once
   * this is saved, so a later language change leaves an already-saved
   * entry's `name` exactly as it read at save time. **Independent of seat
   * identity**, which stays this array's own position, per the still-
   * standing part of that same Assumption — `name` is purely an added
   * display label alongside it, never used to determine order or identity.
   */
  readonly name: string;
};

/**
 * a record of one past calculation (`docs/glossary.md`'s History Entry
 * entry) — the board it ran against, every player's holding and computed
 * result in seat order, and when it was calculated. Saved automatically the
 * instant a running equity evaluation reaches its successful result (issue
 * #178's plan); never constructed for any other evaluation outcome.
 */
export type HistoryEntry = {
  readonly id: string;
  /** epoch ms. */
  readonly calculatedAt: number;
  /** 0, 3, 4, or 5 cards, in dealing order — the same 0/3/4/5 rule
   * `@/features/evaluations/model/board.ts`'s `Board` enforces, restated
   * here as a plain `readonly Card[]` rather than importing that feature's
   * own `Board` type, per this feature's own Assumptions (issue #178's
   * plan). */
  readonly board: readonly Card[];
  /** seat order. */
  readonly players: readonly HistoryEntryPlayer[];
};
