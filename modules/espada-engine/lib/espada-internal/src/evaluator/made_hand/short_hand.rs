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

/// the power index of the best five-card hand these exact five cards make.
pub(super) fn score_five(cards: [Card; 5]) -> u16 {
    if let Some(suit) = flush_suit(&cards) {
        return AS_FLUSH[flush_mask(&cards, suit) as usize];
    }

    rainbow_index(&cards)
}

/// the power index of the best five-card hand obtainable from these six cards.
pub(super) fn score_six(cards: [Card; 6]) -> u16 {
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

        best = best.min(score_five(five));
    }

    best
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
    use crate::evaluator::made_hand::MadeHand;

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

    #[test]
    fn it_agrees_with_the_seven_card_evaluator_over_every_five_card_subset() {
        let mut rng = Xorshift64(0x9E3779B97F4A7C15);

        for _ in 0..SAMPLE_SIZE {
            let hand = random_seven_card_hand(&mut rng);
            let expected = MadeHand::from(hand).power_index();
            let best = five_card_subsets(&hand)
                .into_iter()
                .map(score_five)
                .min()
                .unwrap();

            assert_eq!(
                best, expected,
                "hand {hand:?} disagreed: best five-card subset scored {best}, the \
                 seven-card evaluator scored {expected}",
            );
        }
    }

    #[test]
    fn it_agrees_with_the_seven_card_evaluator_over_every_six_card_subset() {
        let mut rng = Xorshift64(0xD1B5_4A32_D192_ED03);

        for _ in 0..SAMPLE_SIZE {
            let hand = random_seven_card_hand(&mut rng);
            let expected = MadeHand::from(hand).power_index();
            let best = six_card_subsets(&hand)
                .into_iter()
                .map(score_six)
                .min()
                .unwrap();

            assert_eq!(
                best, expected,
                "hand {hand:?} disagreed: best six-card subset scored {best}, the \
                 seven-card evaluator scored {expected}",
            );
        }
    }
}
