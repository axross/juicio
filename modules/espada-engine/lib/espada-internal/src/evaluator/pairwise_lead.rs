// a single opponent's pairwise lead against one card pair on a given board — the
// weight-fraction of that opponent's live combos the card pair's made hand beats, a tie
// counting one half. this is current strength against one opponent; multiplying it across
// every opponent is a later stage's responsibility — see
// `docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`.

use super::equity::{unusable_weight, validate_board, EquityEvaluatorError};
use super::made_hand::MadeHand;
use crate::card::Card;
use crate::hand_range::{CardPair, HandRange};
use std::cmp::Ordering;

/// the weight-fraction of `opponent`'s live combos that `subject`'s made hand beats on
/// `board`, a tie counting one half — `Ok(None)` when the board and `subject` leave
/// `opponent` no live combo.
///
/// a combo sharing a card with `subject` or with `board` is not live and takes no part in
/// either the numerator or the denominator, matching how `EquityEvaluator::build` filters a
/// range against a board.
///
/// three things about the inputs must hold, checked in this order, and a violation is
/// reported through `EquityEvaluatorError` rather than through a panic: `board` must be a
/// valid postflop board — 3, 4, or 5 cards, none repeated (`validate_board`, the same check
/// `EquityEvaluator::postflop` runs); `subject` must name two distinct cards, neither of
/// which `board` already holds (`InvalidHolding` — `EquityEvaluator` has no fixed-holding
/// input to check this against, so this one is specific to `pairwise_lead`); and every combo
/// `opponent` weights must carry a finite, non-negative weight (`InvalidOpponentWeight`, the
/// single-opponent analogue of the `InvalidRangeWeight` `EquityEvaluator::build` reports).
pub fn pairwise_lead(
    subject: CardPair,
    board: &[Card],
    opponent: &HandRange,
) -> Result<Option<f64>, EquityEvaluatorError> {
    validate_board(board)?;

    if subject[0] == subject[1] || board.contains(&subject[0]) || board.contains(&subject[1]) {
        return Err(EquityEvaluatorError::InvalidHolding(subject));
    }

    if let Some(pair) = unusable_weight(opponent) {
        return Err(EquityEvaluatorError::InvalidOpponentWeight(pair));
    }

    let subject_hand = made_hand_of(subject[0], subject[1], board);

    let mut win_weight = 0.0_f64;
    let mut total_weight = 0.0_f64;

    for (combo, weight) in opponent.card_pairs() {
        let weight = *weight as f64;

        if weight <= 0.0 {
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

    Ok(if total_weight > 0.0 {
        Some(win_weight / total_weight)
    } else {
        None
    })
}

fn shares_a_card(combo: &CardPair, subject: CardPair, board: &[Card]) -> bool {
    (0..2).any(|index| {
        let card = combo[index];

        card == subject[0] || card == subject[1] || board.contains(&card)
    })
}

/// scores `a`, `b`, and `board` together as a made hand, dispatching to the 5-, 6-, or
/// 7-card scorer by board length. `pairwise_lead` calls `validate_board` before this ever
/// runs, so the board is already guaranteed to hold 3, 4, or 5 cards — the `unreachable!`
/// arm exists only to satisfy the match.
fn made_hand_of(a: Card, b: Card, board: &[Card]) -> MadeHand {
    match board.len() {
        3 => MadeHand::from([a, b, board[0], board[1], board[2]]),
        4 => MadeHand::from([a, b, board[0], board[1], board[2], board[3]]),
        5 => MadeHand::from([a, b, board[0], board[1], board[2], board[3], board[4]]),
        other => {
            unreachable!("pairwise_lead validates the board holds 3, 4, or 5 cards, not {other}.")
        }
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
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range())
            .unwrap()
            .unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.115);
    }

    #[test]
    fn it_pins_the_middle_pairs_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("AhTh").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range())
            .unwrap()
            .unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.714);
    }

    #[test]
    fn it_pins_the_top_pairs_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("AhJd").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range())
            .unwrap()
            .unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.855);
    }

    #[test]
    fn it_pins_the_sets_pairwise_lead_on_js_ts_4h() {
        let subject = CardPair::from_str("JhJc").unwrap();
        let lead = pairwise_lead(subject, &wet_board(), &wet_opponent_range())
            .unwrap()
            .unwrap();

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

        assert_eq!(pairwise_lead(subject, &board, &opponent), Ok(None));
    }

    #[test]
    fn it_rejects_a_board_of_the_wrong_size() {
        let opponent = wet_opponent_range();
        let subject = CardPair::from_str("KsQs").unwrap();

        let short_board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Ten, Suit::Spade),
        ];

        assert_eq!(
            pairwise_lead(subject, &short_board, &opponent),
            Err(EquityEvaluatorError::InvalidBoardSize(2))
        );

        let long_board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Ten, Suit::Spade),
            Card::new(Rank::Four, Suit::Heart),
            Card::new(Rank::Deuce, Suit::Club),
            Card::new(Rank::Nine, Suit::Diamond),
            Card::new(Rank::Eight, Suit::Club),
        ];

        assert_eq!(
            pairwise_lead(subject, &long_board, &opponent),
            Err(EquityEvaluatorError::InvalidBoardSize(6))
        );
    }

    #[test]
    fn it_prioritizes_board_size_over_board_duplication_when_both_are_invalid() {
        let board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Jack, Suit::Spade),
        ];
        let opponent = wet_opponent_range();
        let subject = CardPair::from_str("9d9c").unwrap();

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::InvalidBoardSize(2))
        );
    }

    #[test]
    fn it_rejects_an_opponent_range_with_an_unusable_weight() {
        let board = wet_board();
        let subject = CardPair::from_str("KsQs").unwrap();
        let combo = CardPair::from_str("AcKc").unwrap();
        let opponent = HandRange::from_iter([(combo, -1.0_f32)]);

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::InvalidOpponentWeight(combo))
        );
    }

    #[test]
    fn it_pins_the_sets_pairwise_lead_on_a_turn_board() {
        let board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Ten, Suit::Spade),
            Card::new(Rank::Four, Suit::Heart),
            Card::new(Rank::Deuce, Suit::Club),
        ];
        let subject = CardPair::from_str("JhJc").unwrap();
        let lead = pairwise_lead(subject, &board, &wet_opponent_range())
            .unwrap()
            .unwrap();

        assert_eq!(rounded_to_3dp(lead), 1.000);
    }

    #[test]
    fn it_pins_the_sets_pairwise_lead_on_a_river_board() {
        let board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Ten, Suit::Spade),
            Card::new(Rank::Four, Suit::Heart),
            Card::new(Rank::Deuce, Suit::Club),
            Card::new(Rank::Nine, Suit::Diamond),
        ];
        let subject = CardPair::from_str("JhJc").unwrap();
        let lead = pairwise_lead(subject, &board, &wet_opponent_range())
            .unwrap()
            .unwrap();

        assert_eq!(rounded_to_3dp(lead), 0.891);
    }

    #[test]
    fn it_rejects_a_board_that_repeats_a_card() {
        let board = vec![
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Jack, Suit::Spade),
            Card::new(Rank::Four, Suit::Heart),
        ];
        let opponent = wet_opponent_range();
        let subject = CardPair::from_str("9d9c").unwrap();

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::DuplicateBoardCard(Card::new(
                Rank::Jack,
                Suit::Spade
            )))
        );
    }

    #[test]
    fn it_rejects_a_subject_that_shares_a_card_with_the_board() {
        let board = wet_board();
        let opponent = wet_opponent_range();
        let subject = CardPair::from_str("Js9d").unwrap();

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::InvalidHolding(subject))
        );
    }

    #[test]
    fn it_rejects_a_subject_that_repeats_a_card_with_itself() {
        let board = wet_board();
        let opponent = wet_opponent_range();
        let subject = CardPair::from_str("AcAc").unwrap();

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::InvalidHolding(subject))
        );
    }

    #[test]
    fn it_names_the_lowest_indexed_offender_when_two_combos_have_an_unusable_weight() {
        let board = wet_board();
        let subject = CardPair::from_str("9d9c").unwrap();
        let lowest = CardPair::from_str("AcAd").unwrap();
        let highest = CardPair::from_str("KsQs").unwrap();
        let opponent = HandRange::from_iter([(highest, -2.0_f32), (lowest, -1.0_f32)]);

        assert_eq!(
            pairwise_lead(subject, &board, &opponent),
            Err(EquityEvaluatorError::InvalidOpponentWeight(lowest))
        );
    }
}
