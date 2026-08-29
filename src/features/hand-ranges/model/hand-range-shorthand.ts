import { RANKS, type Rank } from './card';
import type { HandRange } from './hand-range';
import { rankPair, rankPairKey } from './rank-pair';

/**
 * the three shapes docs/specs/hand-ranges.md's shorthand controls
 * bulk-select — `A*s`, `55+`, `98s-54s` — as data over three fixed
 * builders, not a general expression parser: the spec names exactly
 * these three, and a parser would be an abstraction with no second
 * caller (`software-development`'s YAGNI). a fourth shorthand that fits
 * one of these three shapes (another suited-ace-style run, another
 * pocket-pair-plus threshold, another suited-connector run) is a new
 * entry in `SHORTHAND_DESCRIPTORS` below, not new code; one that does not
 * fit any of the three is out of this module's stated scope.
 */
type ShorthandDescriptor =
  | { readonly kind: 'suitedAceRun'; readonly label: string; readonly token: string }
  | {
      readonly kind: 'pocketPairPlus';
      readonly label: string;
      readonly token: string;
      readonly from: Rank;
    }
  | {
      readonly kind: 'suitedConnectorRun';
      readonly label: string;
      readonly token: string;
      /** the higher card's own rank in the topmost connector of the run. */
      readonly from: Rank;
      /** the higher card's own rank in the bottommost connector of the run. */
      readonly to: Rank;
    };

function expandShorthand(descriptor: ShorthandDescriptor): HandRange {
  switch (descriptor.kind) {
    case 'suitedAceRun':
      // every suited ace, AKs down to A2s: every rank but A itself, paired
      // suited with A.
      return new Set(
        RANKS.filter((rank) => rank !== 'A').map((rank) => rankPairKey(rankPair('A', rank, true))),
      );
    case 'pocketPairPlus': {
      // every pocket pair from `from` up to AA — RANKS is ascending, so
      // this is everything from `from`'s own index to the end.
      const fromIndex = RANKS.indexOf(descriptor.from);
      return new Set(
        RANKS.slice(fromIndex).map((rank) => rankPairKey(rankPair(rank, rank, false))),
      );
    }
    case 'suitedConnectorRun': {
      // a run of suited connectors: for each top-card rank from `from`
      // down to `to`, the suited rank pair of that rank and the one
      // directly below it (RANKS[index - 1]).
      const fromIndex = RANKS.indexOf(descriptor.from);
      const toIndex = RANKS.indexOf(descriptor.to);
      const keys: string[] = [];
      for (let index = fromIndex; index >= toIndex; index -= 1) {
        keys.push(rankPairKey(rankPair(RANKS[index], RANKS[index - 1], true)));
      }
      return new Set(keys);
    }
  }
}

const SHORTHAND_DESCRIPTORS: readonly ShorthandDescriptor[] = [
  // "A2s+" is espada-internal's own bottom-closed-suited-range notation
  // (`RankPair::Suited(Rank::Ace, Rank::Deuce)` plus `+`) for exactly this
  // selection — see
  // modules/espada-engine/lib/espada-internal/src/hand_range/hand_range_token.rs.
  { kind: 'suitedAceRun', label: 'A*s', token: 'A2s+' },
  // "55+" is already valid espada-internal notation verbatim — a
  // bottom-closed pocket-pair range, the same crate's
  // `bottom_closed_pocket_pair_range_regex` arm.
  { kind: 'pocketPairPlus', label: '55+', from: '5', token: '55+' },
  {
    kind: 'suitedConnectorRun',
    label: '98s-54s',
    from: '9',
    to: '5',
    // NOT "98s-54s" verbatim, despite the label reading that way: that
    // crate's `HandRangeToken::from_str` only accepts a dash-joined
    // suited range when both ends share the same high card (its own
    // `double_rank_pair_range_regex` arm requires `s[0..1] == s[4..5]`,
    // matching "AQs-A9s" — one high card, a swept kicker — never two
    // different high cards). a run of suited connectors changes high card
    // on every step, so "98s-54s" itself does not parse there. the valid
    // espada notation for this exact selection is the five single-
    // rank-pair tokens comma-joined — the same shape that crate's own
    // `HandRange::Display` falls back to for a selection its combining
    // logic cannot merge into one range (see `hand_range.rs`'s
    // `it_formats_incomplete_*` tests). flagged for the maintainer: this
    // run's own report says so, since the plan this shorthand was built
    // from named "98s-54s" itself as the token.
    token: '98s,87s,76s,65s,54s',
  },
];

export type HandRangeShorthand = {
  readonly label: string;
  /**
   * the espada range-notation string this shorthand's own selection
   * parses from — see
   * modules/espada-engine/lib/espada-internal/src/hand_range/hand_range_token.rs.
   * nothing in this codebase consumes it yet: carried so a future caller
   * can hand it straight to the Rust parser once this feature is wired to
   * the engine, rather than re-deriving it from `rankPairs`.
   */
  readonly token: string;
  readonly rankPairs: HandRange;
};

/**
 * the three shorthand controls docs/specs/hand-ranges.md's grid draws,
 * each already expanded at module load — a caller renders this list
 * directly (its own label, its own card pair count via
 * `handRangeCardPairCount`) with no switch of its own over which shorthand
 * it is.
 */
export const HAND_RANGE_SHORTHANDS: readonly HandRangeShorthand[] = SHORTHAND_DESCRIPTORS.map(
  (descriptor) => ({
    label: descriptor.label,
    token: descriptor.token,
    rankPairs: expandShorthand(descriptor),
  }),
);
