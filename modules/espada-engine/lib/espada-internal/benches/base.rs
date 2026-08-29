// the cells here are the ones the plan behind `EquityEvaluator` sets a budget against:
// a river, a turn, and the must-pass flop — three players holding `22+,A2s+,AJo+` each on
// `Qs8d2h` — plus a slice of the three-player suit-symmetric preflop walk.
//
// each evaluator is built outside the timed closure, so what is measured is the walk
// rather than the class list the constructor derives. the preflop constructor's own cost
// is a one-off of a different order and is not what a throughput regression would show up
// in.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use espada::card::{Card, Rank, Suit};
use espada::evaluator::EquityEvaluator;
use espada::hand_range::HandRange;
use std::fmt::Display;
use std::str::FromStr;

// the whole three-player suit-symmetric preflop walk takes tens of seconds per iteration,
// which no default-configured criterion benchmark can absorb. what is timed is one part in
// `PREFLOP_PARTS` of it, and the figure is a slice figure: multiplying it back up is an
// estimate of the whole walk, never a measurement of it.
//
// a part is a slice of the *board* space, so it costs a share of both halves of the work —
// the seven-card sweeps, which suit isomorphism collapses, and the row emission, which it
// does not. scaling it up is an estimate of the whole walk for that reason and not because
// the parts are interchangeable.
const PREFLOP_PARTS: u32 = 128;

const MEDIUM: &str = "22+,A2s+,AJo+";

/// `Qs8d2h7c4d`, assembled from ranks and suits rather than parsed. the three postflop
/// cells below take its first three, four, and five cards, so one board serves all of
/// them — and building the cards directly leaves this fixture with no failure to carry.
fn board() -> [Card; 5] {
    [
        Card::new(Rank::Queen, Suit::Spade),
        Card::new(Rank::Eight, Suit::Diamond),
        Card::new(Rank::Deuce, Suit::Heart),
        Card::new(Rank::Seven, Suit::Club),
        Card::new(Rank::Four, Suit::Diamond),
    ]
}

/// the value or a panic: every input to a fixture here is a literal in this file, so a
/// failure is a broken benchmark rather than a condition to recover from, and there is
/// nothing to measure without one. what such a failure owes its reader is which fixture
/// broke and what broke it. that is the half `.unwrap()` leaves out, which is why a
/// bench that has no caller to hand an error back to still does not reach for it.
fn fixture<T, E: Display>(name: &str, result: Result<T, E>) -> T {
    match result {
        Ok(value) => value,
        Err(error) => panic!("benchmark fixture {name}: {error}"),
    }
}

fn ranges(count: usize) -> Vec<HandRange> {
    vec![fixture(MEDIUM, HandRange::from_str(MEDIUM)); count]
}

/// one realistic consumer pass: fold every row's weighted share and total into a running
/// aggregate, which is what a caller drawing a range-advantage chart does per runout.
fn walk(evaluator: &EquityEvaluator) -> f64 {
    let mut share = 0.0;
    let mut total = 0.0;

    for runout in evaluator {
        for player in runout.players() {
            share += player.weight() * player.share();
            total += player.weight() * player.total();
        }
    }

    share / total
}

fn criterion_benchmark(c: &mut Criterion) {
    let players = ranges(3);
    let board = board();

    let river = fixture("river", EquityEvaluator::postflop(&board, &players));
    let turn = fixture("turn", EquityEvaluator::postflop(&board[..4], &players));
    let flop = fixture("flop", EquityEvaluator::postflop(&board[..3], &players));
    let preflop =
        fixture("preflop", EquityEvaluator::preflop(&players)).partition(PREFLOP_PARTS, 0, 1);

    c.bench_function("river/3p-medium", |b| b.iter(|| black_box(walk(&river))));
    c.bench_function("turn/3p-medium", |b| b.iter(|| black_box(walk(&turn))));
    c.bench_function("flop/3p-medium", |b| b.iter(|| black_box(walk(&flop))));
    c.bench_function(&format!("preflop/3p-symmetric-1-of-{PREFLOP_PARTS}"), |b| {
        b.iter(|| black_box(walk(&preflop)))
    });
}

criterion_group! {
    name = base;
    config = Criterion::default();
    targets = criterion_benchmark
}

criterion_main!(base);
