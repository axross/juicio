//! Walks one board space on a single thread and prints, per player, every holding's own
//! equity and the range's aggregate equity.
//!
//! Usage: `single-thread [<board>] <range> <range> [<range>]`, as in
//! `single-thread Qs8d2h JJ+ A2s+`. The board is 3, 4, or 5 cards written back to back;
//! leave it out entirely for a preflop walk.
//!
//! `multi-thread` prints the same figures from the same walk, and the two are compared
//! line for line. They agree apart from that program's `threads:` and `elapsed:` lines
//! and one stated exception: the two sum the same equities in different associations, so
//! a figure within an ULP of the six-decimal rounding boundary the reporting uses can
//! print one digit differently. No input exhibiting one has been constructed.

use espada::card::Card;
use espada::evaluator::{EquityEvaluator, Runout};
use espada::hand_range::{CardPair, HandRange};
use std::collections::HashMap;
use std::process::ExitCode;

/// What one holding accumulated over the walk: its own weight in the range, and the
/// opponent-combination weights it shared and was consistent with, summed over every
/// runout the walk emitted.
#[derive(Clone, Copy, Default)]
struct Tally {
    weight: f64,
    share: f64,
    total: f64,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (board, players) = match parse(&args) {
        Ok(parsed) => parsed,
        Err(message) => {
            eprintln!("{message}");

            return ExitCode::FAILURE;
        }
    };

    let evaluator = match board.as_slice() {
        [] => EquityEvaluator::preflop(&players),
        board => EquityEvaluator::postflop(board, &players),
    };
    let evaluator = match evaluator {
        Ok(evaluator) => evaluator,
        Err(error) => {
            eprintln!("{error}");

            return ExitCode::FAILURE;
        }
    };

    describe(&board, &players, evaluator.len());

    let mut tallies = empty_tallies(&players);
    let instant = std::time::Instant::now();

    for runout in &evaluator {
        accumulate(&mut tallies, &runout);
    }

    let elapsed = instant.elapsed();

    println!("elapsed: {} ms", elapsed.as_millis());

    report(&players, &tallies);

    ExitCode::SUCCESS
}

/// Splits the arguments into an optional board and one range per player. A first argument
/// that reads as a run of cards is the board unless the run is exactly two cards long;
/// anything else is the first range, which is what makes the board optional without a
/// flag.
fn parse(args: &[String]) -> Result<(Vec<Card>, Vec<HandRange>), String> {
    let (board, rest) = match args.split_first() {
        // two cards is the one length that stays a range. `AhKh` reads end to end as two
        // cards *and* is a legal range token, so without that one exception the first range
        // became a board nobody wrote — and there was no spelling at all that reached a
        // preflop walk with a combo in first position. every other length goes on to the
        // evaluator, which names the board size it will not take; a run of six valid cards
        // is a board of the wrong size, and saying so beats re-reading it as a range and
        // reporting that it is not a range token either.
        Some((first, rest)) => match cards(first).filter(|run| run.len() != 2) {
            Some(board) => (board, rest),
            None => (vec![], args),
        },
        None => (vec![], args),
    };

    if rest.len() < 2 {
        return Err(
            "usage: single-thread [<board>] <range> <range> [<range>]  (e.g. Qs8d2h JJ+ A2s+)"
                .to_string(),
        );
    }

    let players = rest
        .iter()
        .map(|text| text.parse::<HandRange>().map_err(|error| error.to_string()))
        .collect::<Result<Vec<HandRange>, String>>()?;

    Ok((board, players))
}

/// `Some` only when the whole string is a run of two-character cards, so a range token
/// such as `JJ+` or `A2s+` is never mistaken for a board. The length is `parse`'s
/// business, not this function's.
fn cards(text: &str) -> Option<Vec<Card>> {
    let characters: Vec<char> = text.chars().collect();

    if characters.is_empty() {
        return None;
    }

    // matching the pair is what keeps this off `usize::is_multiple_of`, which is what
    // clippy suggests for a parity test and which needs Rust 1.87. `--all-targets` lints
    // the examples, so reaching for it here would raise what this crate needs to build,
    // against a manifest that pins no `rust-version`. an odd trailing character simply
    // has no arm.
    characters
        .chunks(2)
        .map(|pair| match pair {
            [rank, suit] => format!("{rank}{suit}").parse::<Card>().ok(),
            _ => None,
        })
        .collect()
}

fn describe(board: &[Card], players: &[HandRange], runouts: usize) {
    let board: Vec<String> = board.iter().map(Card::to_string).collect();

    println!(
        "board: {}",
        if board.is_empty() {
            "(preflop)".to_string()
        } else {
            board.join("")
        }
    );

    for (index, player) in players.iter().enumerate() {
        println!(
            "player[{index}]: {player} ({} combos)",
            player.card_pairs().len()
        );
    }

    println!("runouts: {runouts}");
}

fn empty_tallies(players: &[HandRange]) -> Vec<HashMap<CardPair, Tally>> {
    players
        .iter()
        .map(|player| {
            player
                .card_pairs()
                .keys()
                .map(|pair| (*pair, Tally::default()))
                .collect()
        })
        .collect()
}

/// Folds one runout into the tallies. The walk emits one runout per board and the rows
/// are that board's own, so there is nothing to weight them by here.
fn accumulate(tallies: &mut [HashMap<CardPair, Tally>], runout: &Runout) {
    for player in runout.players() {
        let tally = tallies[player.player_index()]
            .entry(player.hole_cards())
            .or_default();

        tally.weight = player.weight();
        tally.share += player.share();
        tally.total += player.total();
    }
}

/// Prints both figures the walk exists to produce, which are not the same average.
///
/// A holding's own equity is `share / total` with its range weight left out: how often the
/// holding wins is a property of the cards, not of how often the range chooses to play
/// them. The range's aggregate equity is the weight-scaled ratio
/// `sum(weight * share) / sum(weight * total)`, because there the weight is exactly the
/// question — a holding played half the time contributes half as much to what the range as
/// a whole is worth. Scaling the per-holding figure by the weight as well, and dividing by
/// an unweighted count, reports a holding at weight 0.5 as half as strong as the identical
/// holding at weight 1.0, which is the defect this rewrite fixes.
fn report(players: &[HandRange], tallies: &[HashMap<CardPair, Tally>]) {
    for (index, player) in players.iter().enumerate() {
        // A `HashMap` iterates in an order of its own that differs between processes, so
        // the aggregate is summed over a fixed one instead — otherwise the last printed
        // digit of a sum over a thousand holdings is not reproducible even against this
        // same program.
        let mut holdings: Vec<(CardPair, Tally)> = tallies[index]
            .iter()
            .map(|(pair, tally)| (*pair, *tally))
            .collect();

        holdings.sort_by_key(|(pair, _)| pair.to_string());

        let mut rows: Vec<(CardPair, f64, f64)> = holdings
            .iter()
            .filter(|(_, tally)| tally.total > 0.0)
            .map(|(pair, tally)| (*pair, tally.weight, tally.share / tally.total))
            .collect();

        // Sorted on the equity as it will be printed, not on the raw `f64`. Two rows that
        // print the same six decimals can still differ by an ULP when the walk was summed
        // in a different order, and ordering on the raw value puts them either way round
        // while the tie-break below — which only fires on exact equality — never engages.
        // That is what made this program's row order disagree with the other's.
        rows.sort_by(|left, right| {
            printed(right.2)
                .total_cmp(&printed(left.2))
                .then_with(|| left.0.to_string().cmp(&right.0.to_string()))
        });

        let share: f64 = holdings
            .iter()
            .map(|(_, tally)| tally.weight * tally.share)
            .sum();
        let total: f64 = holdings
            .iter()
            .map(|(_, tally)| tally.weight * tally.total)
            .sum();

        println!();
        println!(
            "player[{index}]: {player} — aggregate equity {:.6}%",
            share / total * 100.0
        );

        for (pair, weight, equity) in rows {
            println!(
                "  {pair}  weight {weight:.3}  equity {:.6}%",
                equity * 100.0
            );
        }
    }
}

/// The equity as `report` prints it: a percentage rounded to six decimal places.
fn printed(equity: f64) -> f64 {
    (equity * 100.0 * 1e6).round()
}
