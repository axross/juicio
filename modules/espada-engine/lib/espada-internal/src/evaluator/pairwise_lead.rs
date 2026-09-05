// a single opponent's pairwise lead against one card pair on a given board — the
// weight-fraction of that opponent's live combos the card pair's made hand beats, a tie
// counting one half. this is current strength against one opponent; multiplying it across
// every opponent is a later stage's responsibility — see
// `docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`.

use super::made_hand::MadeHand;
use crate::card::Card;
use crate::hand_range::{CardPair, HandRange};
use std::cmp::Ordering;

/// the weight-fraction of `opponent`'s live combos that `subject`'s made hand beats on
/// `board`, a tie counting one half — `None` when the board and `subject` leave `opponent`
/// no live combo.
///
/// a combo sharing a card with `subject` or with `board` is not live and takes no part in
/// either the numerator or the denominator, matching how `EquityEvaluator::build` filters a
/// range against a board.
///
/// `board` must hold 3, 4, or 5 cards, mirroring `EquityEvaluator::postflop`'s own
/// precondition; anything else is a caller bug this function panics on rather than
/// silently misevaluating.
pub fn pairwise_lead(subject: CardPair, board: &[Card], opponent: &HandRange) -> Option<f64> {
    let subject_hand = made_hand_of(subject[0], subject[1], board);

    let mut win_weight = 0.0_f64;
    let mut total_weight = 0.0_f64;

    for (combo, weight) in opponent.card_pairs() {
        let weight = *weight as f64;

        if !weight.is_finite() || weight <= 0.0 {
            continue;
        }

        if shares_a_card(combo, subject, board) {
            continue;
        }

        let opponent_hand = made_hand_of(combo[0], combo[1], board);

        total_weight += weight;

        win_weight += match subject_hand.power_index().cmp(&opponent_hand.power_index()) {
            Ordering::Less => weight,
            Ordering::Equal => weight * 0.5,
            Ordering::Greater => 0.0,
        };
    }

    if total_weight > 0.0 {
        Some(win_weight / total_weight)
    } else {
        None
    }
}

fn shares_a_card(combo: &CardPair, subject: CardPair, board: &[Card]) -> bool {
    (0..2).any(|index| {
        let card = combo[index];

        card == subject[0] || card == subject[1] || board.contains(&card)
    })
}

fn made_hand_of(a: Card, b: Card, board: &[Card]) -> MadeHand {
    match board.len() {
        3 => MadeHand::from([a, b, board[0], board[1], board[2]]),
        4 => MadeHand::from([a, b, board[0], board[1], board[2], board[3]]),
        5 => MadeHand::from([a, b, board[0], board[1], board[2], board[3], board[4]]),
        other => panic!("a board holds 3, 4, or 5 cards, not {other}."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Rank, Suit};
    use std::str::FromStr;

    fn wet_board() -> Vec<Card> {
        vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Ten, Suit::Spade),
            Card::new(Rank::Four, Suit::Heart),
        ]
    }

    fn wet_opponent_range() -> HandRange {
        "22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+"
            .parse()
            .unwrap()
    }

    fn rounded_to_3dp(value: f64) -> f64 {
        (value * 1000.0).round() / 1000.0
    }

    #[test]
    fn it_pins_the_flush_and_straight_draws_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("KsQs").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range()).unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.115);
    }

    #[test]
    fn it_pins_the_middle_pairs_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("AhTh").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range()).unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.714);
    }

    #[test]
    fn it_pins_the_top_pairs_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("AhJd").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range()).unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.855);
    }

    #[test]
    fn it_pins_the_sets_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("JhJc").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range()).unwrap();

        assert_eq!(rounded_to_3dp(lead), 1.000);
    }

    #[test]
    fn it_returns_none_when_the_opponent_has_no_live_combo() {
        let board = vec![
            Card::new(Rank::Ace, Suit::Spade),
            Card::new(Rank::Ace, Suit::Heart),
            Card::new(Rank::Ace, Suit::Diamond),
        ];
        let opponent: HandRange = "AA".parse().unwrap();
        let subject = CardPair::from_str("2c2d").unwrap();

        assert_eq!(pairwise_lead(subject, &board, &opponent), None);
    }
}
