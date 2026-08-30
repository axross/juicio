import { HapticEvent } from '@/core/haptics/haptics';

import { RANKS, type Rank } from './card';
import type { HandRange } from './hand-range';
import { rankPair, rankPairKey, type RankPairKey } from './rank-pair';

/**
 * the three shapes docs/specs/hand-ranges.md's shorthand controls
 * bulk-select — `A2s+`, `55+`, `98s-54s` — as data over three fixed
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
  // the design file draws this chip's label as "A*s", which is not
  // standard hand-range notation; the maintainer ruled it a design mistake
  // and corrected the shipped label to "A2s+" — the same selection (every
  // suited ace), expressed the way the notation everyone else uses already
  // expresses it, the deuce being the weakest kicker and "+" meaning "and
  // up". see
  // docs/decisions/2026-08-29-correct-the-suited-ace-shorthand-label-to-a2s-plus.md.
  // "A2s+" is also espada-internal's own bottom-closed-suited-range notation
  // (`RankPair::Suited(Rank::Ace, Rank::Deuce)` plus `+`) for exactly this
  // selection — see
  // modules/espada-engine/lib/espada-internal/src/hand_range/hand_range_token.rs
  // — so `label` and `token` now agree for this one entry, unlike the
  // other two below, where the on-screen label and the espada token are
  // different strings.
  { kind: 'suitedAceRun', label: 'A2s+', token: 'A2s+' },
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

export type ShorthandToggleOutcome = {
  readonly next: HandRange;
  /** which haptic event the toggle earns — see docs/conventions/haptics.md's
   * `toggleOn`/`toggleOff` rows: a press that leaves the shorthand's own
   * rank pairs selected reports `toggleOn`, one that clears them reports
   * `toggleOff`, the same two-state-switch semantics that table already
   * assigns a boolean control, which a shorthand chip now is (see this
   * function's own doc comment). */
  readonly haptic: HapticEvent.ToggleOn | HapticEvent.ToggleOff;
};

/**
 * the maintainer's own rule for what a shorthand chip press does, pulled
 * out of `../ui/hand-range-pane.tsx` into a pure function so it is tested
 * apart from the UI, the same way every other rule in this feature is: if
 * **any** of `shorthand.rankPairs` is not yet in `selected`, the press
 * selects **all** of them; if **all** of them are already selected, the
 * press deselects **all** of them. A shorthand chip is a bulk two-state
 * toggle over exactly its own rank pairs, never a broader clear or
 * replace — every rank pair outside `shorthand.rankPairs` passes through
 * `selected` untouched in either direction, which is what still lets a
 * player combine more than one chip's own shape in the same range by
 * pressing each once (docs/specs/hand-ranges.md's own "combines their
 * selections").
 */
export function toggleShorthand(
  selected: HandRange,
  shorthand: HandRangeShorthand,
): ShorthandToggleOutcome {
  const allSelected = isEverySelected(selected, shorthand.rankPairs);
  const next = new Set(selected);

  for (const key of shorthand.rankPairs) {
    if (allSelected) {
      next.delete(key);
    } else {
      next.add(key);
    }
  }

  return { next, haptic: allSelected ? HapticEvent.ToggleOff : HapticEvent.ToggleOn };
}

/**
 * true when every one of `keys` is already in `selected` — the predicate
 * `toggleShorthand` above uses to decide its own select/deselect branch,
 * exported so a caller can also use it to decide whether a shorthand chip
 * reads as active (docs/specs/hand-ranges.md's own "outlined active
 * state"), without recomputing the same rule a second time.
 */
export function isEverySelected(selected: HandRange, keys: ReadonlySet<RankPairKey>): boolean {
  for (const key of keys) {
    if (!selected.has(key)) {
      return false;
    }
  }
  return true;
}
