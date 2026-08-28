// `EquityEvaluator` checked against the evaluator it replaces, on a flop, where the two
// cover the same board space and the same matchups and so must report the same aggregate
// equity for every player.
//
// **This is the last commit in which this comparison can exist.** The next commit deletes
// `FlopExhaustiveEvaluator` and `Showdown`, and this file goes with them. It is written as
// its own file rather than folded into `equity_evaluator.rs` for exactly that reason: the
// removal then deletes a file instead of unpicking a module.
//
// The comparison is worth running only because this fork already fixed the cross-player
// card-removal defect in `Showdown::new` and `FlopExhaustiveEvaluatorIterator::next` — an
// enumeration that deals one physical card to two players is not an oracle for anything.
// With that fix in place the outgoing evaluator is matchup-major and exhaustive over the
// 1,176 board completions of a flop, which is the same population the board-major sweep
// covers by an entirely different route: the sweep never materializes a matchup, it
// reaches the same totals through inclusion–exclusion over cumulative weights.
//
// The ranges below are narrow on purpose. The outgoing evaluator's cost is the product of
// the range widths times 1,176 boards, so the medium ranges the new evaluator is sized for
// would put this file far outside the CI wall clock — which is the whole reason the
// replacement exists.

use espada::card::Card;
use espada::evaluator::{EquityEvaluator, FlopExhaustiveEvaluator};
use espada::hand_range::HandRange;
use std::str::FromStr;

fn cards(text: &str) -> Vec<Card> {
    text.split_whitespace()
        .map(|card| Card::from_str(card).unwrap())
        .collect()
}

fn ranges(texts: &[&str]) -> Vec<HandRange> {
    texts
        .iter()
        .map(|text| HandRange::from_str(text).unwrap())
        .collect()
}

/// The board-major aggregate: `sum(weight * share) / sum(weight * total)` per player. The
/// holding's own weight enters here and nowhere else, because `share / total` is already
/// an equity.
fn board_major(flop: &[Card], players: &[HandRange]) -> Vec<f64> {
    let evaluator = EquityEvaluator::postflop(flop, players).unwrap();
    let mut share = vec![0.0; players.len()];
    let mut total = vec![0.0; players.len()];

    for runout in &evaluator {
        for row in runout.players() {
            share[row.player_index()] += row.weight() * row.share();
            total[row.player_index()] += row.weight() * row.total();
        }
    }

    share
        .into_iter()
        .zip(total)
        .map(|(share, total)| share / total)
        .collect()
}

/// The matchup-major aggregate the outgoing evaluator computes. Every `Showdown` it yields
/// is one fully dealt matchup on one completed board, carrying the product of the
/// holdings' weights as its probability; a player's equity is its pot share summed over
/// those, over the same sum with the share replaced by one.
fn matchup_major(flop: &[Card], players: &[HandRange]) -> Vec<f64> {
    let board = [Some(flop[0]), Some(flop[1]), Some(flop[2]), None, None];
    let evaluator = FlopExhaustiveEvaluator::new(&board, &players.to_vec());
    let mut share = vec![0.0; players.len()];
    let mut total = vec![0.0; players.len()];

    for showdown in evaluator {
        let probability = showdown.probability() as f64;
        let winners = f64::from(showdown.winner_len());

        for (index, player) in showdown.players().iter().enumerate() {
            total[index] += probability;

            if player.is_winner() {
                share[index] += probability / winners;
            }
        }
    }

    share
        .into_iter()
        .zip(total)
        .map(|(share, total)| share / total)
        .collect()
}

fn assert_agrees(flop: &str, texts: &[&str]) {
    let flop = cards(flop);
    let players = ranges(texts);
    let incoming = board_major(&flop, &players);
    let outgoing = matchup_major(&flop, &players);

    assert_eq!(incoming.len(), outgoing.len());

    // the equities sum to one across the players, so an absolute tolerance is a relative
    // one here; 1e-9 is far above the f64 noise of two summations in different orders and
    // far below anything a real disagreement would produce.
    for (index, (incoming, outgoing)) in incoming.iter().zip(&outgoing).enumerate() {
        assert!(
            (incoming - outgoing).abs() <= 1e-9,
            "player {index} on {texts:?}: board-major {incoming}, matchup-major {outgoing}",
        );
    }
}

#[test]
fn it_agrees_with_the_outgoing_evaluator_at_two_players() {
    assert_agrees("Qs 8d 2h", &["JJ+", "AQs+"]);
}

/// A two-tone flop, where the new evaluator's suit stabilizer is non-trivial and the walk
/// therefore emits most of its boards by relabelling a representative rather than by
/// scoring them. The outgoing evaluator has no such machinery, so this is the case where
/// the two routes diverge most and the agreement says most.
#[test]
fn it_agrees_with_the_outgoing_evaluator_on_a_board_whose_stabilizer_is_non_trivial() {
    assert_agrees("Qs 8s 2h", &["JJ+", "AQs+"]);
}

/// Three players, which is the other sweep form: the opponents' joint total is
/// `W_1 W_2 - sum_z V_1[z] V_2[z] + P_12` rather than a single opponent's weight, and
/// nothing in the two-player agreement above exercises it.
#[test]
fn it_agrees_with_the_outgoing_evaluator_at_three_players() {
    assert_agrees("Qs 8d 2h", &["AKs", "JJ", "T9s"]);
}

/// Three players whose ranges overlap, so the `P_12` term — the weight of holdings two
/// opponents share — is non-zero rather than quietly cancelling.
#[test]
fn it_agrees_with_the_outgoing_evaluator_at_three_overlapping_players() {
    assert_agrees("Qs 8d 2h", &["JJ", "JJ", "AKs"]);
}
