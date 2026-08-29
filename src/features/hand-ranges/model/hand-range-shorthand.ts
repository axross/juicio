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
  | { readonly kind: 'suitedAceRun'; readonly label: string }
  | { readonly kind: 'pocketPairPlus'; readonly label: string; readonly from: Rank }
  | {
      readonly kind: 'suitedConnectorRun';
      readonly label: string;
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
      // down to `to`, the suited combo of that rank and the one directly
      // below it (RANKS[index - 1]).
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
  { kind: 'suitedAceRun', label: 'A*s' },
  { kind: 'pocketPairPlus', label: '55+', from: '5' },
  { kind: 'suitedConnectorRun', label: '98s-54s', from: '9', to: '5' },
];

export type HandRangeShorthand = {
  readonly label: string;
  readonly rankPairs: HandRange;
};

/**
 * the three shorthand controls docs/specs/hand-ranges.md's grid draws,
 * each already expanded at module load — a caller renders this list
 * directly (its own label, its own combo count via
 * `handRangeComboCount`) with no switch of its own over which shorthand
 * it is.
 */
export const HAND_RANGE_SHORTHANDS: readonly HandRangeShorthand[] = SHORTHAND_DESCRIPTORS.map(
  (descriptor) => ({ label: descriptor.label, rankPairs: expandShorthand(descriptor) }),
);
