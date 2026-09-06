// scores a hand of exactly five or exactly six cards on the same power-index space
// `MadeHand`'s seven-card evaluator uses, so a 5-, 6-, and 7-card score are directly
// comparable — needed to score a made hand on the flop and turn, where only 5 or 6 cards
// are known.
//
// a flush (including a straight flush) is scored by reusing `AS_FLUSH` directly: that
// table is indexed purely by which ranks a suit holds, with no dependence on how many
// other cards came along, so the same lookup that resolves a seven-card flush resolves a
// five- or six-card one. every other category has no such total-card-independent table to
// reuse — the seven-card evaluator's non-flush hashing (`dp_ref`/`AS_RAINBOW`) is built
// around combinatorial positions computed for a fixed total of seven cards, and reusing it
// with a different total silently returns some other hand's value — so those categories
// are ranked here from first principles instead: a hand's category comes from its rank
// counts, and its position within that category is the combinatorial-number-system rank of
// its kickers, offset by the category's starting power index — the same `..._START`
// constants `MadeHand::hand_type` matches against, imported from there rather than
// redeclared here, so the two can never drift apart. the cross-subset consistency tests in
// this module verify the result empirically against the real seven-card evaluator.

use super::{
    FULL_HOUSE_START, HIGH_CARD_START, PAIR_START, QUADS_START, STRAIGHT_START, TRIPS_START,
    TWO_PAIR_START,
};
use crate::card::{Card, Rank, Suit};
use crate::evaluator::dp_table::AS_FLUSH;
use std::sync::OnceLock;

/// the power index of the best five-card hand these exact five cards make, or `None` when
/// the five do not name five distinct cards. total rather than panicking on a repeated card:
/// a repeated rank empties every one of `rainbow_index`'s own category buckets at once (no
/// rank ever reaches a count of 4, 3, 2, or the "exactly one" `ranks` needs a straight or high
/// card to read from), which `straight_effective_high` then reads as a vacuously-consecutive
/// empty slice and indexes at `[0]` — an out-of-bounds panic, not a wrong score, which is why
/// this is checked up front rather than left to surface downstream. this check runs
/// regardless of whether the caller already validated its own input, since it is meant to
/// hold on its own — see this crate's own callers for how `pairwise_lead` layers its own
/// validation on top of this rather than relying on it alone.
pub(super) fn score_five(cards: [Card; 5]) -> Option<u16> {
    if has_duplicate(&cards) {
        return None;
    }

    Some(if let Some(suit) = flush_suit(&cards) {
        AS_FLUSH[flush_mask(&cards, suit) as usize]
    } else {
        rainbow_index(&cards)
    })
}

/// the power index of the best five-card hand obtainable from these six cards, or `None` when
/// the six do not name six distinct cards — same totality guarantee as `score_five` above,
/// and for the same reason.
pub(super) fn score_six(cards: [Card; 6]) -> Option<u16> {
    if has_duplicate(&cards) {
        return None;
    }

    let mut best = u16::MAX;

    for excluded in 0..6 {
        let mut five = [cards[0]; 5];
        let mut slot = 0;

        for (index, card) in cards.iter().enumerate() {
            if index == excluded {
                continue;
            }

            five[slot] = *card;
            slot += 1;
        }

        // every five-card subset of a six-card hand already checked duplicate-free is
        // itself duplicate-free, so `score_five` here always returns `Some`.
        best = best.min(score_five(five).expect("six-card input already checked for duplicates"));
    }

    Some(best)
}

/// whether any two of `cards` name the same card — the check both `score_five` and
/// `score_six` above run up front, since neither's own category-counting logic is meaningful
/// once a card repeats.
fn has_duplicate(cards: &[Card]) -> bool {
    (0..cards.len()).any(|i| (i + 1..cards.len()).any(|j| cards[i] == cards[j]))
}

fn flush_suit(cards: &[Card; 5]) -> Option<Suit> {
    let suit = *cards[0].suit();

    if cards[1..].iter().all(|card| card.suit() == &suit) {
        Some(suit)
    } else {
        None
    }
}

fn flush_mask(cards: &[Card; 5], suit: Suit) -> u16 {
    cards
        .iter()
        .filter(|card| *card.suit() == suit)
        .fold(0u16, |mask, card| mask | rank_bit(card.rank()))
}

/// this card's bit in the 13-bit rank mask `AS_FLUSH` is indexed by — bit 12 for the ace
/// down to bit 0 for the deuce — matching `hash_for_flush`'s own bit assignment in
/// `made_hand.rs` exactly, since the two must agree for the reuse above to be valid.
fn rank_bit(rank: &Rank) -> u16 {
    1 << strength(rank)
}

/// this rank's strength for comparison: 0 for the deuce up to 12 for the ace, the reverse
/// of `u8::from(Rank)`'s deal-order numbering.
fn strength(rank: &Rank) -> u8 {
    12 - u8::from(rank)
}

/// the power index of the best five-card hand these five cards make, given a flush has
/// already been ruled out — `score_five` is this function's only caller, reached only after
/// `flush_suit` has come back `None`.
fn rainbow_index(cards: &[Card; 5]) -> u16 {
    let mut counts = [0u8; 13];

    for card in cards {
        counts[strength(card.rank()) as usize] += 1;
    }

    if let Some(quad) = (0..13u8).find(|&s| counts[s as usize] == 4) {
        let kicker = (0..13u8).find(|&s| counts[s as usize] == 1).unwrap();

        return QUADS_START + group_index(quad, &[kicker]);
    }

    let trips: Vec<u8> = (0..13u8).filter(|&s| counts[s as usize] == 3).collect();
    let pairs: Vec<u8> = (0..13u8).filter(|&s| counts[s as usize] == 2).collect();

    if trips.len() == 1 {
        if pairs.len() == 1 {
            return FULL_HOUSE_START + group_index(trips[0], &[pairs[0]]);
        }

        let kickers: Vec<u8> = (0..13u8).filter(|&s| counts[s as usize] == 1).collect();

        return TRIPS_START + group_index(trips[0], &kickers);
    }

    if pairs.len() == 2 {
        let kicker = (0..13u8).find(|&s| counts[s as usize] == 1).unwrap();

        // `pairs` is ascending, so the last element is the higher-strength pair.
        return TWO_PAIR_START + two_pair_index(pairs[1], pairs[0], kicker);
    }

    if pairs.len() == 1 {
        let kickers: Vec<u8> = (0..13u8).filter(|&s| counts[s as usize] == 1).collect();

        return PAIR_START + group_index(pairs[0], &kickers);
    }

    let ranks: Vec<u8> = (0..13u8).filter(|&s| counts[s as usize] == 1).collect();
    let ranks_desc: Vec<u8> = ranks.iter().rev().copied().collect();

    if let Some(effective_high) = straight_effective_high(&ranks_desc) {
        return STRAIGHT_START + (12 - effective_high) as u16;
    }

    let raw_rank = best_first_rank(&ranks, 13);
    let excluded_below = straight_raw_ranks()
        .iter()
        .filter(|&&rank| rank < raw_rank)
        .count() as u32;

    HIGH_CARD_START + (raw_rank - excluded_below) as u16
}

/// `primary`'s own best-first rank among the 13 ranks, crossed with the best-first rank of
/// `secondary` (kicker ranks distinct from `primary`) among the 12 remaining ranks. this
/// shape covers quads (one kicker), full house (one pair rank as the lone "secondary"),
/// trips (two kickers), and pair (three kickers) — every category whose index is "which
/// primary rank" combined with "which of the remaining ranks fill out the hand".
fn group_index(primary: u8, secondary: &[u8]) -> u16 {
    let primary_rank = best_first_rank(&[primary], 13);
    let compressed_secondary: Vec<u8> = secondary
        .iter()
        .map(|&value| compress(value, &[primary]))
        .collect();
    let secondary_rank = best_first_rank(&compressed_secondary, 12);
    let multiplier = choose(12, secondary.len() as u8);

    (primary_rank * multiplier + secondary_rank) as u16
}

fn two_pair_index(high_pair: u8, low_pair: u8, kicker: u8) -> u16 {
    let pair_rank = best_first_rank(&[high_pair, low_pair], 13);
    let compressed_kicker = compress(kicker, &[high_pair, low_pair]);
    let kicker_rank = best_first_rank(&[compressed_kicker], 11);

    (pair_rank * 11 + kicker_rank) as u16
}

/// the straight's effective high strength for ranking purposes, or `None` if these five
/// distinct, already pair-free strengths (sorted descending) do not form a straight. the
/// wheel (ace-low, `{12, 3, 2, 1, 0}`) reports `3` — the five's own strength — since it
/// ranks just below the six-high straight and above every non-straight hand.
fn straight_effective_high(strengths_desc: &[u8]) -> Option<u8> {
    let consecutive = strengths_desc.windows(2).all(|pair| pair[0] == pair[1] + 1);

    if consecutive {
        return Some(strengths_desc[0]);
    }

    if strengths_desc == [12, 3, 2, 1, 0] {
        return Some(3);
    }

    None
}

/// each of the 10 straights' raw best-first rank (see `best_first_rank`), memoized since
/// the high-card branch above would otherwise recompute this fixed set on every call.
fn straight_raw_ranks() -> &'static [u32; 10] {
    static RANKS: OnceLock<[u32; 10]> = OnceLock::new();

    RANKS.get_or_init(|| {
        let mut sets = [[0u8; 5]; 10];

        for high in 4..=12u8 {
            let index = (12 - high) as usize;

            for offset in 0..5u8 {
                sets[index][offset as usize] = high - offset;
            }
        }

        sets[9] = [12, 3, 2, 1, 0];

        let mut ranks = [0u32; 10];

        for (index, set) in sets.iter().enumerate() {
            ranks[index] = best_first_rank(set, 13);
        }

        ranks
    })
}

/// `value` translated into the reduced universe left once every rank in `excluded` is
/// removed and the gap closed — still increasing with `value`, so relative order among the
/// surviving ranks is unchanged.
fn compress(value: u8, excluded: &[u8]) -> u8 {
    value - excluded.iter().filter(|&&e| e < value).count() as u8
}

/// the "best-first" rank of a `k`-subset of `{0, .., n-1}`, given as its members in any
/// order: rank 0 for the subset made of the `k` largest values, rising as the subset gets
/// weaker under "compare the largest member first, then the next, and so on" — which is
/// exactly how one poker hand outranks another within a shared category.
///
/// this is the ordinary colex rank of the *ascending* member list, taken from the far end:
/// colex ranks a set by its largest member first, so feeding it the members ascending puts
/// this function's own largest (best) member in colex's dominant last slot, and
/// `choose(n, k) - 1 - colex` turns "colex counts up from the smallest max-member" into
/// "this function counts up from the largest max-member" instead.
fn best_first_rank(values: &[u8], n: u8) -> u32 {
    let k = values.len() as u8;
    let mut ascending = values.to_vec();

    ascending.sort_unstable();

    let colex: u32 = ascending
        .iter()
        .enumerate()
        .map(|(i, &value)| choose(value, (i + 1) as u8))
        .sum();

    choose(n, k) - 1 - colex
}

/// a binomial-coefficient (`n` choose `k`) lookup table built by Pascal's triangle
/// recurrence, sized 14x14 so every `n` this module's `choose` calls use (up to 13) has its
/// own row — `k` never exceeds 5.
const fn build_choose_table() -> [[u32; 14]; 14] {
    let mut table = [[0u32; 14]; 14];
    let mut n = 0;

    while n < 14 {
        table[n][0] = 1;

        let mut k = 1;

        while k <= n {
            table[n][k] = table[n - 1][k - 1] + table[n - 1][k];
            k += 1;
        }

        n += 1;
    }

    table
}

const CHOOSE: [[u32; 14]; 14] = build_choose_table();

/// `n` choose `k`, for the small values (`n` and `k` both below 14) this module needs.
fn choose(n: u8, k: u8) -> u32 {
    CHOOSE[n as usize][k as usize]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{RankRange, SuitRange};
    use crate::evaluator::made_hand::{MadeHand, MadeHandType};
    use std::collections::HashSet;

    const SAMPLE_SIZE: usize = 5_000;

    fn all_52_cards() -> [Card; 52] {
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 52];
        let mut index = 0;

        for rank in RankRange::all() {
            for suit in SuitRange::all() {
                cards[index] = Card::new(rank, suit);
                index += 1;
            }
        }

        cards
    }

    /// a small deterministic xorshift64 generator, seeded fixed so this property test is
    /// reproducible rather than flaky. this crate carries no `rand` dependency, and this
    /// module's own randomness need — shuffling a 52-card deck for a sample size this
    /// small — is narrow enough not to justify adding one.
    struct Xorshift64(u64);

    impl Xorshift64 {
        fn next(&mut self) -> u64 {
            let mut x = self.0;

            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;

            x
        }

        fn next_below(&mut self, bound: usize) -> usize {
            (self.next() % bound as u64) as usize
        }
    }

    fn random_seven_card_hand(rng: &mut Xorshift64) -> [Card; 7] {
        let mut deck = all_52_cards();
        let mut hand = [deck[0]; 7];

        for (slot, card) in hand.iter_mut().enumerate() {
            let pick = slot + rng.next_below(52 - slot);

            deck.swap(slot, pick);
            *card = deck[slot];
        }

        hand
    }

    fn five_card_subsets(hand: &[Card; 7]) -> Vec<[Card; 5]> {
        let mut subsets = Vec::with_capacity(21);

        for exclude_a in 0..7 {
            for exclude_b in (exclude_a + 1)..7 {
                let mut five = [hand[0]; 5];
                let mut slot = 0;

                for (index, card) in hand.iter().enumerate() {
                    if index == exclude_a || index == exclude_b {
                        continue;
                    }

                    five[slot] = *card;
                    slot += 1;
                }

                subsets.push(five);
            }
        }

        subsets
    }

    fn six_card_subsets(hand: &[Card; 7]) -> Vec<[Card; 6]> {
        let mut subsets = Vec::with_capacity(7);

        for excluded in 0..7 {
            let mut six = [hand[0]; 6];
            let mut slot = 0;

            for (index, card) in hand.iter().enumerate() {
                if index == excluded {
                    continue;
                }

                six[slot] = *card;
                slot += 1;
            }

            subsets.push(six);
        }

        subsets
    }

    /// every five-card subset of a six-card hand — the same single-exclusion pattern
    /// `six_card_subsets` above uses one level up, dropping exactly one of the six cards at a
    /// time instead of one of seven.
    fn five_card_subsets_of_six(hand: &[Card; 6]) -> Vec<[Card; 5]> {
        let mut subsets = Vec::with_capacity(6);

        for excluded in 0..6 {
            let mut five = [hand[0]; 5];
            let mut slot = 0;

            for (index, card) in hand.iter().enumerate() {
                if index == excluded {
                    continue;
                }

                five[slot] = *card;
                slot += 1;
            }

            subsets.push(five);
        }

        subsets
    }

    /// asserts that the best of `hand`'s own 21 five-card subsets, scored by [`score_five`],
    /// matches the seven-card evaluator's own power index for `hand` — shared by the random
    /// sample test below and the deterministic per-category corpus, so both exercise the
    /// identical check.
    fn assert_five_card_subsets_agree(hand: [Card; 7]) {
        let expected = MadeHand::from(hand).power_index();
        // every subset of a real, duplicate-free seven-card hand is itself duplicate-free, so
        // `filter_map` here never actually drops anything — it only adapts `score_five`'s own
        // `Option<u16>` into the plain `u16` this comparison needs.
        let best = five_card_subsets(&hand)
            .into_iter()
            .filter_map(score_five)
            .min()
            .unwrap();

        assert_eq!(
            best, expected,
            "hand {hand:?} disagreed: best five-card subset scored {best}, the seven-card \
             evaluator scored {expected}",
        );
    }

    /// asserts two things about `hand`'s own seven six-card subsets: that the best of them,
    /// scored by [`score_six`], matches the seven-card evaluator's own power index for `hand`
    /// (the same check the random sample test always ran), and that each of the seven, on its
    /// own, scores exactly the minimum [`score_five`] over its own six five-card subsets — a
    /// six-card subset scored too weak by [`score_six`] would stay invisible to the first
    /// check whenever it was not the one that happened to be the overall minimum, which is
    /// what the second check closes. shared by the random sample test below and the
    /// deterministic per-category corpus.
    fn assert_six_card_subsets_agree(hand: [Card; 7]) {
        let expected = MadeHand::from(hand).power_index();
        let subsets = six_card_subsets(&hand);

        let best = subsets.iter().copied().filter_map(score_six).min().unwrap();

        assert_eq!(
            best, expected,
            "hand {hand:?} disagreed: best six-card subset scored {best}, the seven-card \
             evaluator scored {expected}",
        );

        for six in subsets {
            let own_best = five_card_subsets_of_six(&six)
                .into_iter()
                .filter_map(score_five)
                .min()
                .unwrap();
            let actual = score_six(six).expect("six-card input already checked for duplicates");

            assert_eq!(
                actual, own_best,
                "six-card subset {six:?} scored {actual}, but the minimum over its own \
                 five-card subsets is {own_best}",
            );
        }
    }

    #[test]
    fn it_agrees_with_the_seven_card_evaluator_over_every_five_card_subset() {
        let mut rng = Xorshift64(0x9E3779B97F4A7C15);

        for _ in 0..SAMPLE_SIZE {
            assert_five_card_subsets_agree(random_seven_card_hand(&mut rng));
        }
    }

    #[test]
    fn it_agrees_with_the_seven_card_evaluator_over_every_six_card_subset() {
        let mut rng = Xorshift64(0xD1B5_4A32_D192_ED03);

        for _ in 0..SAMPLE_SIZE {
            assert_six_card_subsets_agree(random_seven_card_hand(&mut rng));
        }
    }

    #[test]
    fn score_five_returns_none_for_a_repeated_card_instead_of_panicking() {
        let repeated = Card::new(Rank::Ace, Suit::Club);
        let cards = [
            repeated,
            repeated,
            Card::new(Rank::King, Suit::Spade),
            Card::new(Rank::Queen, Suit::Heart),
            Card::new(Rank::Jack, Suit::Diamond),
        ];

        assert_eq!(score_five(cards), None);
    }

    #[test]
    fn score_six_returns_none_for_a_repeated_card_instead_of_panicking() {
        let repeated = Card::new(Rank::Ace, Suit::Club);
        let cards = [
            repeated,
            repeated,
            Card::new(Rank::King, Suit::Spade),
            Card::new(Rank::Queen, Suit::Heart),
            Card::new(Rank::Jack, Suit::Diamond),
            Card::new(Rank::Ten, Suit::Club),
        ];

        assert_eq!(score_six(cards), None);
    }

    /// exhaustively enumerates every one of the `52 choose 5` = 2,598,960 distinct five-card
    /// hands from a full deck and pins the well-known category-frequency counts for standard
    /// poker hand rankings, alongside the total number of distinct power indices `score_five`
    /// reaches. runs unconditionally in `cargo test` rather than behind a release or `#[ignore]`
    /// gate: measured at roughly 7 seconds in a debug build, comfortably inside this crate's
    /// test suite's own time budget.
    #[test]
    fn it_scores_every_five_card_hand_in_a_52_card_deck_with_the_known_category_counts() {
        let deck = all_52_cards();

        let mut hands_scored: u64 = 0;
        let mut distinct_power_indices: HashSet<u16> = HashSet::new();
        let mut straight_flush = 0u64;
        let mut quads = 0u64;
        let mut full_house = 0u64;
        let mut flush = 0u64;
        let mut straight = 0u64;
        let mut trips = 0u64;
        let mut two_pair = 0u64;
        let mut pair = 0u64;
        let mut high_card = 0u64;

        for a in 0..52 {
            for b in (a + 1)..52 {
                for c in (b + 1)..52 {
                    for d in (c + 1)..52 {
                        for e in (d + 1)..52 {
                            let hand = [deck[a], deck[b], deck[c], deck[d], deck[e]];
                            let made_hand = MadeHand::try_from(hand).unwrap_or_else(|_| {
                                panic!("hand {hand:?} of five distinct cards failed to score")
                            });

                            hands_scored += 1;
                            distinct_power_indices.insert(made_hand.power_index());

                            match made_hand.hand_type() {
                                MadeHandType::StraightFlush => straight_flush += 1,
                                MadeHandType::Quads => quads += 1,
                                MadeHandType::FullHouse => full_house += 1,
                                MadeHandType::Flush => flush += 1,
                                MadeHandType::Straight => straight += 1,
                                MadeHandType::Trips => trips += 1,
                                MadeHandType::TwoPair => two_pair += 1,
                                MadeHandType::Pair => pair += 1,
                                MadeHandType::HighCard => high_card += 1,
                            }
                        }
                    }
                }
            }
        }

        assert_eq!(hands_scored, 2_598_960);
        assert_eq!(distinct_power_indices.len(), 7462);
        assert_eq!(straight_flush, 40, "straight flush count");
        assert_eq!(quads, 624, "quads count");
        assert_eq!(full_house, 3744, "full house count");
        assert_eq!(flush, 5108, "flush count");
        assert_eq!(straight, 10200, "straight count");
        assert_eq!(trips, 54912, "trips count");
        assert_eq!(two_pair, 123552, "two pair count");
        assert_eq!(pair, 1098240, "pair count");
        assert_eq!(high_card, 1302540, "high card count");
        assert_eq!(
            straight_flush
                + quads
                + full_house
                + flush
                + straight
                + trips
                + two_pair
                + pair
                + high_card,
            2_598_960,
            "category counts should sum to the total number of five-card hands",
        );
    }

    /// the minimum number of times the subset-consistency checks above must each exercise
    /// every one of the nine hand categories. a 5,000-hand random sample leaves the rarest
    /// categories effectively untested — a straight flush lands roughly once, quads roughly
    /// eight times — so this floor is enforced against the deterministic corpus below instead
    /// of a larger random sample, which would need tens of thousands of draws to reach it for
    /// the rarest categories and still not guarantee it.
    const MIN_CATEGORY_OCCURRENCES: usize = 6;

    /// every rank in ascending strength order (deuce lowest), the same ordering `strength`
    /// above assigns — restated here as a lookup since the category builders below count up
    /// from the deuce to build a straight or a set of pairwise non-adjacent kicker ranks.
    const RANKS_BY_STRENGTH: [Rank; 13] = [
        Rank::Deuce,
        Rank::Trey,
        Rank::Four,
        Rank::Five,
        Rank::Six,
        Rank::Seven,
        Rank::Eight,
        Rank::Nine,
        Rank::Ten,
        Rank::Jack,
        Rank::Queen,
        Rank::King,
        Rank::Ace,
    ];

    fn rank_at(strength: usize) -> Rank {
        RANKS_BY_STRENGTH[strength % 13]
    }

    /// a `4 + variant`-high straight flush in spades, plus two off-suit filler cards drawn
    /// from ranks above the straight's own so they can neither duplicate nor extend it.
    fn straight_flush_hand(variant: usize) -> [Card; 7] {
        let high = 4 + variant;
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        for (offset, card) in cards.iter_mut().take(5).enumerate() {
            *card = Card::new(rank_at(high - offset), Suit::Spade);
        }

        cards[5] = Card::new(rank_at(high + 1), Suit::Heart);
        cards[6] = Card::new(rank_at(high + 2), Suit::Diamond);

        cards
    }

    /// all four suits of one rank, plus three kickers at ranks spaced apart from the quad rank
    /// and from each other so none of them can compete with the quads for best hand.
    fn quads_hand(variant: usize) -> [Card; 7] {
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        for (slot, suit) in SuitRange::all().into_iter().enumerate() {
            cards[slot] = Card::new(rank_at(variant), suit);
        }

        cards[4] = Card::new(rank_at(variant + 2), Suit::Spade);
        cards[5] = Card::new(rank_at(variant + 4), Suit::Heart);
        cards[6] = Card::new(rank_at(variant + 6), Suit::Diamond);

        cards
    }

    /// a three-of-a-kind at one rank and a pair at another, plus two kickers at ranks distinct
    /// from both and from each other, so neither can turn a kicker into a second pair or a
    /// fourth card of either rank.
    fn full_house_hand(variant: usize) -> [Card; 7] {
        let trip_rank = rank_at(variant);
        let pair_rank = rank_at(variant + 6);
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        cards[0] = Card::new(trip_rank, Suit::Spade);
        cards[1] = Card::new(trip_rank, Suit::Heart);
        cards[2] = Card::new(trip_rank, Suit::Diamond);
        cards[3] = Card::new(pair_rank, Suit::Spade);
        cards[4] = Card::new(pair_rank, Suit::Heart);
        cards[5] = Card::new(rank_at(variant + 2), Suit::Diamond);
        cards[6] = Card::new(rank_at(variant + 4), Suit::Club);

        cards
    }

    /// five spades at ranks spaced two strengths apart (so no run of five consecutive ranks
    /// hides among them), plus two off-suit filler cards.
    fn flush_hand(variant: usize) -> [Card; 7] {
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        for (slot, offset) in [0, 2, 4, 6, 8].into_iter().enumerate() {
            cards[slot] = Card::new(rank_at(variant + offset), Suit::Spade);
        }

        cards[5] = Card::new(rank_at(variant + 1), Suit::Heart);
        cards[6] = Card::new(rank_at(variant + 3), Suit::Diamond);

        cards
    }

    /// five consecutive ranks split across suits so they cannot also be read as a flush, plus
    /// two filler cards at ranks above the straight's own so they can neither duplicate nor
    /// extend it.
    fn straight_hand(variant: usize) -> [Card; 7] {
        let high = 4 + variant;
        let suits = [
            Suit::Spade,
            Suit::Heart,
            Suit::Diamond,
            Suit::Club,
            Suit::Spade,
        ];
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        for (offset, (card, &suit)) in cards.iter_mut().zip(suits.iter()).enumerate() {
            *card = Card::new(rank_at(high - offset), suit);
        }

        cards[5] = Card::new(rank_at(high + 1), Suit::Heart);
        cards[6] = Card::new(rank_at(high + 3), Suit::Diamond);

        cards
    }

    /// a three-of-a-kind at one rank, plus four kickers spaced two strengths apart from the
    /// trip rank and from each other (so no straight hides among them) and spread across all
    /// four suits (so no flush does either).
    fn trips_hand(variant: usize) -> [Card; 7] {
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        cards[0] = Card::new(rank_at(variant), Suit::Spade);
        cards[1] = Card::new(rank_at(variant), Suit::Heart);
        cards[2] = Card::new(rank_at(variant), Suit::Diamond);

        let kicker_suits = [Suit::Spade, Suit::Heart, Suit::Diamond, Suit::Club];
        for (slot, offset) in [2, 4, 6, 8].into_iter().enumerate() {
            cards[3 + slot] = Card::new(rank_at(variant + offset), kicker_suits[slot]);
        }

        cards
    }

    /// two pairs at ranks spaced two strengths apart, plus three single kickers continuing
    /// that same spacing — pairwise non-adjacent ranks throughout, so no straight hides among
    /// them, and no rank ever reaches three cards, so no set does either.
    fn two_pair_hand(variant: usize) -> [Card; 7] {
        let ranks: Vec<Rank> = [0, 2, 4, 6, 8]
            .into_iter()
            .map(|offset| rank_at(variant + offset))
            .collect();
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        cards[0] = Card::new(ranks[0], Suit::Spade);
        cards[1] = Card::new(ranks[0], Suit::Heart);
        cards[2] = Card::new(ranks[1], Suit::Diamond);
        cards[3] = Card::new(ranks[1], Suit::Club);
        cards[4] = Card::new(ranks[2], Suit::Spade);
        cards[5] = Card::new(ranks[3], Suit::Heart);
        cards[6] = Card::new(ranks[4], Suit::Diamond);

        cards
    }

    /// one pair, plus five single kickers, every one of the six distinct ranks involved spaced
    /// two strengths apart from its neighbours so no straight hides among them.
    fn pair_hand(variant: usize) -> [Card; 7] {
        let ranks: Vec<Rank> = [0, 2, 4, 6, 8, 10]
            .into_iter()
            .map(|offset| rank_at(variant + offset))
            .collect();
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        cards[0] = Card::new(ranks[0], Suit::Spade);
        cards[1] = Card::new(ranks[0], Suit::Heart);

        let kicker_suits = [
            Suit::Diamond,
            Suit::Club,
            Suit::Spade,
            Suit::Heart,
            Suit::Diamond,
        ];
        for (slot, &rank) in ranks[1..].iter().enumerate() {
            cards[2 + slot] = Card::new(rank, kicker_suits[slot]);
        }

        cards
    }

    /// seven single cards at ranks spaced two strengths apart, spread across suits so no
    /// flush hides among them and no two ranks are ever adjacent, so no straight does either.
    fn high_card_hand(variant: usize) -> [Card; 7] {
        let offsets = [0, 2, 4, 6, 8, 10, 12];
        let suits = [
            Suit::Spade,
            Suit::Heart,
            Suit::Diamond,
            Suit::Club,
            Suit::Spade,
            Suit::Heart,
            Suit::Diamond,
        ];
        let mut cards = [Card::new(Rank::Ace, Suit::Spade); 7];

        for (slot, (&offset, &suit)) in offsets.iter().zip(suits.iter()).enumerate() {
            cards[slot] = Card::new(rank_at(variant + offset), suit);
        }

        cards
    }

    /// one seven-card hand alongside the category its own builder above guarantees —
    /// self-checked against `MadeHand::from`'s own classification in the test below before
    /// either subset-consistency assertion runs on it.
    struct CategorySample {
        hand: [Card; 7],
        category: MadeHandType,
    }

    /// `MIN_CATEGORY_OCCURRENCES` distinct hands per category, built from first principles
    /// rather than drawn from `random_seven_card_hand`, so every category is exercised the
    /// same guaranteed number of times regardless of the random sample tests' own draw.
    fn deterministic_category_corpus() -> Vec<CategorySample> {
        let mut samples = Vec::with_capacity(MIN_CATEGORY_OCCURRENCES * 9);

        for variant in 0..MIN_CATEGORY_OCCURRENCES {
            samples.push(CategorySample {
                hand: straight_flush_hand(variant),
                category: MadeHandType::StraightFlush,
            });
            samples.push(CategorySample {
                hand: quads_hand(variant),
                category: MadeHandType::Quads,
            });
            samples.push(CategorySample {
                hand: full_house_hand(variant),
                category: MadeHandType::FullHouse,
            });
            samples.push(CategorySample {
                hand: flush_hand(variant),
                category: MadeHandType::Flush,
            });
            samples.push(CategorySample {
                hand: straight_hand(variant),
                category: MadeHandType::Straight,
            });
            samples.push(CategorySample {
                hand: trips_hand(variant),
                category: MadeHandType::Trips,
            });
            samples.push(CategorySample {
                hand: two_pair_hand(variant),
                category: MadeHandType::TwoPair,
            });
            samples.push(CategorySample {
                hand: pair_hand(variant),
                category: MadeHandType::Pair,
            });
            samples.push(CategorySample {
                hand: high_card_hand(variant),
                category: MadeHandType::HighCard,
            });
        }

        samples
    }

    #[test]
    fn it_guarantees_every_hand_category_is_exercised_by_the_subset_consistency_checks() {
        let mut straight_flush = 0usize;
        let mut quads = 0usize;
        let mut full_house = 0usize;
        let mut flush = 0usize;
        let mut straight = 0usize;
        let mut trips = 0usize;
        let mut two_pair = 0usize;
        let mut pair = 0usize;
        let mut high_card = 0usize;

        for sample in deterministic_category_corpus() {
            let made_hand = MadeHand::from(sample.hand);
            assert_eq!(
                made_hand.hand_type(),
                sample.category,
                "hand {:?} was built to be a {:?} but scored as a {:?}",
                sample.hand,
                sample.category,
                made_hand.hand_type(),
            );

            match made_hand.hand_type() {
                MadeHandType::StraightFlush => straight_flush += 1,
                MadeHandType::Quads => quads += 1,
                MadeHandType::FullHouse => full_house += 1,
                MadeHandType::Flush => flush += 1,
                MadeHandType::Straight => straight += 1,
                MadeHandType::Trips => trips += 1,
                MadeHandType::TwoPair => two_pair += 1,
                MadeHandType::Pair => pair += 1,
                MadeHandType::HighCard => high_card += 1,
            }

            assert_five_card_subsets_agree(sample.hand);
            assert_six_card_subsets_agree(sample.hand);
        }

        for (label, count) in [
            ("StraightFlush", straight_flush),
            ("Quads", quads),
            ("FullHouse", full_house),
            ("Flush", flush),
            ("Straight", straight),
            ("Trips", trips),
            ("TwoPair", two_pair),
            ("Pair", pair),
            ("HighCard", high_card),
        ] {
            assert!(
                count >= MIN_CATEGORY_OCCURRENCES,
                "{label} was only exercised {count} times, below the required floor of \
                 {MIN_CATEGORY_OCCURRENCES}",
            );
        }
    }
}
