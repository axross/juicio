// The reference this file checks `EquityEvaluator` against is matchup-major: it fixes one
// holding per player and scores that matchup directly, which is the shape the board-major
// sweep replaces. Two independent routes to the same number are the point — the sweep's
// inclusion–exclusion is not something a reader can check by inspection.

use espada::card::{Card, Suit};
use espada::evaluator::{EquityEvaluator, EquityEvaluatorError, MadeHand, MadeHandType, Runout};
use espada::hand_range::{CardPair, HandRange};
use std::collections::HashMap;
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

/// A range built holding by holding, so it can carry a weight the parser cannot spell.
fn weighted(entries: &[(&str, f32)]) -> HandRange {
    entries
        .iter()
        .map(|(text, weight)| (CardPair::from_str(text).unwrap(), *weight))
        .collect()
}

fn close(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-12 * left.abs().max(right.abs()).max(1.0)
}

fn live_holdings(range: &HandRange, board: &[Card]) -> Vec<(CardPair, f64)> {
    range
        .card_pairs()
        .iter()
        .filter(|(pair, _)| !board.contains(&pair[0]) && !board.contains(&pair[1]))
        .map(|(pair, weight)| (*pair, *weight as f64))
        .collect()
}

/// The four suits, in the order the permutation maps below index them.
const SUITS: [Suit; 4] = [Suit::Spade, Suit::Heart, Suit::Diamond, Suit::Club];

/// All 24 permutations of the four suits in lexicographic order, each a map from suit
/// index to suit index. This is `S_4` whole; the evaluator's own group is a subgroup of
/// it, and `same_orbit` cuts this list down to the one it needs.
const SUIT_PERMUTATIONS: [[usize; 4]; 24] = [
    [0, 1, 2, 3],
    [0, 1, 3, 2],
    [0, 2, 1, 3],
    [0, 2, 3, 1],
    [0, 3, 1, 2],
    [0, 3, 2, 1],
    [1, 0, 2, 3],
    [1, 0, 3, 2],
    [1, 2, 0, 3],
    [1, 2, 3, 0],
    [1, 3, 0, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [2, 0, 3, 1],
    [2, 1, 0, 3],
    [2, 1, 3, 0],
    [2, 3, 0, 1],
    [2, 3, 1, 0],
    [3, 0, 1, 2],
    [3, 0, 2, 1],
    [3, 1, 0, 2],
    [3, 1, 2, 0],
    [3, 2, 0, 1],
    [3, 2, 1, 0],
];

/// The cards with every suit sent through `map`, sorted, so two card sets compare equal
/// exactly when they hold the same cards.
fn relabelled(cards: &[Card], map: &[usize; 4]) -> Vec<Card> {
    let mut out: Vec<Card> = cards
        .iter()
        .map(|card| {
            let suit = SUITS.iter().position(|suit| suit == card.suit()).unwrap();

            Card::new(*card.rank(), SUITS[map[suit]])
        })
        .collect();

    out.sort_unstable();
    out
}

/// Whether two completed boards sit in the same orbit of the evaluator's suit group.
///
/// That group is the intersection of the known board's stabilizer with every range's, so
/// this reads it off the board alone and is exact only where each range is suit-symmetric.
/// Its one caller passes pocket pairs, which are. Orbits partition the board space, so two
/// boards emitted next to each other belong to one orbit exactly when some element of the
/// group carries the first to the second.
fn same_orbit(known: &[Card], left: &[Card; 5], right: &[Card; 5]) -> bool {
    let identity = [0, 1, 2, 3];
    let fixed = relabelled(known, &identity);
    let want = relabelled(right, &identity);

    SUIT_PERMUTATIONS
        .iter()
        .filter(|map| relabelled(known, map) == fixed)
        .any(|map| relabelled(left, map) == want)
}

type Reference = Vec<HashMap<CardPair, [f64; 4]>>;

/// `[win, tie, share, total]` per player per holding, by direct enumeration of every
/// pairwise-disjoint tuple of holdings on one complete board.
fn reference(board: &[Card; 5], players: &[HandRange]) -> Reference {
    let live: Vec<Vec<(CardPair, f64)>> = players
        .iter()
        .map(|range| live_holdings(range, board))
        .collect();
    let mut totals: Reference = live
        .iter()
        .map(|holdings| holdings.iter().map(|(pair, _)| (*pair, [0.0; 4])).collect())
        .collect();
    let mut chosen: Vec<(CardPair, f64, u16)> = Vec::new();

    enumerate(0, &mut chosen, &live, board, &mut totals);

    totals
}

fn enumerate(
    depth: usize,
    chosen: &mut Vec<(CardPair, f64, u16)>,
    live: &[Vec<(CardPair, f64)>],
    board: &[Card; 5],
    totals: &mut Reference,
) {
    if depth == live.len() {
        let best = chosen.iter().map(|(_, _, power)| *power).min().unwrap();
        let winners = chosen.iter().filter(|(_, _, power)| *power == best).count();

        for (seat, (pair, _, power)) in chosen.iter().enumerate() {
            let opponents: f64 = chosen
                .iter()
                .enumerate()
                .filter(|(other, _)| *other != seat)
                .map(|(_, (_, weight, _))| *weight)
                .product();
            let row = totals[seat].get_mut(pair).unwrap();

            row[3] += opponents;

            if *power == best {
                row[2] += opponents / winners as f64;

                if winners == 1 {
                    row[0] += opponents;
                } else {
                    row[1] += opponents;
                }
            }
        }

        return;
    }

    for (pair, weight) in &live[depth] {
        if chosen.iter().any(|(taken, _, _)| {
            taken[0] == pair[0] || taken[1] == pair[0] || taken[0] == pair[1] || taken[1] == pair[1]
        }) {
            continue;
        }

        let hand: MadeHand = [
            pair[0], pair[1], board[0], board[1], board[2], board[3], board[4],
        ]
        .into();

        chosen.push((*pair, *weight, hand.power_index()));
        enumerate(depth + 1, chosen, live, board, totals);
        chosen.pop();
    }
}

fn assert_matches_reference(runout: &Runout, players: &[HandRange]) {
    let expected = reference(runout.board(), players);
    let mut seen = 0;

    for row in runout.players() {
        let want = expected[row.player_index()]
            .get(&row.hole_cards())
            .unwrap_or_else(|| panic!("{} is not a live holding", row.hole_cards()));

        assert!(
            close(row.win(), want[0])
                && close(row.tie(), want[1])
                && close(row.share(), want[2])
                && close(row.total(), want[3]),
            "{} on {:?}: got {:?}, want {want:?}",
            row.hole_cards(),
            runout.board(),
            [row.win(), row.tie(), row.share(), row.total()],
        );

        seen += 1;
    }

    assert_eq!(
        seen,
        expected
            .iter()
            .map(|holdings| holdings.len())
            .sum::<usize>(),
        "every live holding of every player is emitted"
    );
}

#[test]
fn it_matches_the_reference_on_a_river() {
    let players = ranges(&["JJ+", "A2s+"]);
    let board = cards("Qs 8d 2h 7c 4d");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    assert_eq!(evaluator.len(), 1);

    let mut walk = evaluator.into_iter();
    let runout = walk.next().unwrap();

    assert_matches_reference(&runout, &players);
    assert!(walk.next().is_none());
}

#[test]
fn it_matches_the_reference_on_a_turn() {
    let players = ranges(&["QQ+", "AKs,A5s"]);
    let board = cards("Qs 8d 2h 7c");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    assert_eq!(evaluator.len(), 48);

    for runout in &evaluator {
        assert_matches_reference(&runout, &players);
    }
}

#[test]
fn it_matches_the_reference_on_a_flop() {
    let players = ranges(&["JJ,A5s", "AhKh,7d7s,5c4c"]);
    let board = cards("Qs 8d 2h");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    assert_eq!(evaluator.len(), 1176);

    for runout in &evaluator {
        assert_matches_reference(&runout, &players);
    }
}

#[test]
fn it_matches_the_reference_on_a_flop_with_three_players() {
    // three ace-kings of different suits and two sevens split by suit, so the walk meets
    // both a two-way and a three-way split rather than only unique winners.
    let players = ranges(&["AhKh,7d7s", "AdKd,7c7h", "AcKc,5c4c"]);
    let board = cards("Qs 8d 2h");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut ties = 0;
    let mut three_way = 0;

    for runout in &evaluator {
        assert_matches_reference(&runout, &players);

        // with weight-1 ranges every accumulator is an exact integer, so a hero whose
        // splits are all two-way lands exactly on `win + tie / 2`; landing strictly below
        // it is a three-way split in the mix, which nothing else can produce.
        for row in runout.players() {
            if row.tie() == 0.0 {
                continue;
            }

            ties += 1;

            if row.share() < row.win() + row.tie() / 2.0 {
                three_way += 1;
            }
        }
    }

    assert!(ties > 0, "no split pot was walked");
    assert!(three_way > 0, "no three-way split was walked");
}

#[test]
fn it_matches_the_reference_on_a_flop_with_weighted_ranges() {
    let players = ranges(&["JJ:0.5,A5s:0.25", "AhKh:0.75,7d7s,5c4c:0.5"]);
    let board = cards("Qs 8d 2h");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut ties = 0;

    for runout in &evaluator {
        assert_matches_reference(&runout, &players);

        ties += runout
            .players()
            .iter()
            .filter(|row| row.tie() > 0.0)
            .count();
    }

    assert!(ties > 0, "no split pot was walked");
}

#[test]
fn it_matches_the_reference_on_a_monotone_flop_where_canonicalization_engages() {
    let players = ranges(&["JJ", "AKo"]);
    let board = cards("Qs 8s 2s");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    // the walk is every completion even where the orbits collapsed the evaluation.
    assert_eq!(evaluator.len(), 1176);

    let mut walked = 0;

    for runout in &evaluator {
        assert_matches_reference(&runout, &players);

        walked += 1;
    }

    assert_eq!(walked, 1176);
}

#[test]
fn it_matches_the_reference_on_a_monotone_flop_with_three_players() {
    // Every other three-player comparison here uses ranges that name their suits, so the
    // group is trivial and no row is ever relabelled; every case with a non-trivial group
    // is heads-up. Relabelling crosses the player axis in exactly one place — the scored
    // outcome is read at `outcomes[index][player]` while the emission walks the order that
    // player's own images sort in — and only a three-player board with a group reaches it.
    // The ranges overlap and weight the shared holdings differently per player, so a row
    // read from the wrong player's column cannot match the reference.
    let players = ranges(&["JJ:0.5,TT:0.25", "JJ:0.75,99:0.5", "TT:0.6,99:0.9"]);
    let board = cards("Qs 8s 2s");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    assert_eq!(evaluator.len(), 1176);

    // a slice rather than the whole walk: the reference enumerates every tuple of
    // holdings on every board, which is cubic here. The slice begins at walk index 0, so
    // it ends mid-orbit rather than starting there; the part that *starts* mid-orbit is
    // the next part of this same walk, and the test below walks it.
    let slice = evaluator.partition(24, 0, 1);
    let mut ties = 0;

    assert!(slice.len() > 40, "{} boards", slice.len());

    for runout in &slice {
        assert_matches_reference(&runout, &players);

        ties += runout
            .players()
            .iter()
            .filter(|row| row.tie() > 0.0)
            .count();
    }

    assert!(ties > 0, "no split pot was walked");
}

#[test]
fn it_matches_the_reference_on_a_mid_orbit_partition_with_three_players() {
    // The corner the test above leaves open. A part that begins at walk index 0 begins at
    // the head of an orbit, where the emission's `within` offset is zero and the first row
    // out is the representative's own — so the one place relabelling crosses the player
    // axis is not exercised until the walk has already stepped. A part that *starts*
    // mid-orbit carries a non-identity group element onto its very first emitted row, at
    // three players, which is the combination nothing else here reaches.
    let players = ranges(&["JJ:0.5,TT:0.25", "JJ:0.75,99:0.5", "TT:0.6,99:0.9"]);
    let board = cards("Qs 8s 2s");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    // 1,176 boards cut 24 ways puts this part's first board at walk index 49. That the
    // index sits inside an orbit rather than at the head of one is asserted below rather
    // than assumed: the board emitted immediately before it — the last of the part the
    // test above walks — is a suit relabelling of it, and only two boards of one orbit
    // can be that.
    let previous = evaluator.partition(24, 0, 1).into_iter().last().unwrap();
    let part = evaluator.partition(24, 1, 2);
    let mut walked = 0;
    let mut ties = 0;

    for runout in &part {
        if walked == 0 {
            assert!(
                same_orbit(&board, previous.board(), runout.board()),
                "{:?} and {:?} are in different orbits, so this part starts at an orbit head",
                previous.board(),
                runout.board()
            );
        }

        assert_matches_reference(&runout, &players);

        ties += runout
            .players()
            .iter()
            .filter(|row| row.tie() > 0.0)
            .count();
        walked += 1;
    }

    assert_eq!(walked, part.len());
    assert!(walked > 40, "{walked} boards");
    assert!(ties > 0, "no split pot was walked");
}

#[test]
fn it_matches_the_reference_on_ranges_too_light_for_an_absolute_floor() {
    // The cancellation floor is a fraction of the magnitudes that cancelled rather than a
    // fixed weight, and this is the input that tells the two apart. The two ranges share
    // exactly one holding, AhKh, at 1e-7. When the hero holds it, the opponent's whole
    // weight at the hero's own power index is that same holding — which card removal on
    // the hero's two cards then subtracts twice, once for each card. Only the "the
    // opponent holds exactly this holding" add-back brings the tier back to zero; drop it
    // and the tier comes out at -1e-7. A fixed floor of 1e-6 clamps that to zero and calls
    // it rounding. The floor here is 1e-9 of the 2e-7 that cancelled, so the same residue
    // is half a billion times too large to be rounding and `Outcome::new` says so.
    let light = |texts: [&str; 2]| -> HandRange {
        texts
            .iter()
            .map(|text| (CardPair::from_str(text).unwrap(), 1e-7_f32))
            .collect()
    };
    let players = vec![light(["AhKh", "QdJd"]), light(["AhKh", "9c8c"])];
    let board = cards("Qs 8d 2h");
    let mut shared = 0;

    for runout in &EquityEvaluator::postflop(&board, &players).unwrap() {
        assert_matches_reference(&runout, &players);

        // AhKh is live for both players on every board that leaves it live, so the row
        // the floor is about is actually walked rather than removed by the board.
        shared += runout
            .players()
            .iter()
            .filter(|row| row.hole_cards() == CardPair::from_str("AhKh").unwrap())
            .count();
    }

    assert!(shared > 0, "the shared holding was never live");
}

/// Every one of the 1,326 hole-card combinations, each given `weight` of its position in
/// a fixed enumeration — the widest input the sweep can be given, and so the largest
/// magnitudes its inclusion–exclusion cancels.
fn every_holding(weight: impl Fn(usize) -> f32) -> HandRange {
    let mut cards = vec![];

    for rank in "23456789TJQKA".chars() {
        for suit in "shdc".chars() {
            cards.push(Card::from_str(&format!("{rank}{suit}")).unwrap());
        }
    }

    let mut pairs: Vec<(CardPair, f32)> = vec![];

    for (index, left) in cards.iter().enumerate() {
        for right in &cards[index + 1..] {
            let position = pairs.len();

            pairs.push((CardPair::new(*left, *right), weight(position)));
        }
    }

    pairs.into_iter().collect()
}

#[test]
fn it_holds_the_cancellation_floor_on_the_widest_ranges() {
    // The other end of the scale from the test above, and the other way the floor can be
    // sized wrong: too tight, so ordinary rounding on a wide input trips it. Three
    // full-width ranges preflop are the widest input the sweep accepts — the board and
    // the hero's own cards leave each opponent 990 holdings — and every row here runs the
    // floor's debug assertions, which `cargo test` builds in.
    //
    // The weights have to be fractional for any of that to bite. At weight 1 every
    // accumulator, product and dot product in the sweep is an exact integer far below
    // 2^53, so nothing rounds and no floor is too tight to survive: the same walk passes
    // with `CANCELLATION` set to zero. Cycling the hundredths 0.91 through 0.99 — none of
    // them representable in binary, and none of their running sums either — keeps the
    // full width, and so the magnitudes, while making every sum and product round.
    let full = every_holding(|index| (91 + index % 9) as f32 / 100.0);

    assert_eq!(full.card_pairs().len(), 1326);

    let players = vec![full.clone(), full.clone(), full];
    let evaluator = EquityEvaluator::preflop(&players).unwrap();

    // full width makes the reference intractable, so this asserts the floor and the tuple
    // invariants rather than the values. A slice keeps the walk to seconds.
    //
    // The floor this input actually needs was measured by tightening `CANCELLATION` until
    // the `Outcome::new` debug assertion fires: it holds at 1.8e-16 and trips at 1.5e-16,
    // so the shipped 1e-9 clears the largest input the sweep accepts by nearly seven
    // orders of magnitude.
    let slice = evaluator.partition(180_000, 0, 1);
    let mut heaviest = 0.0_f64;

    assert!(slice.len() > 5, "{} boards", slice.len());

    for runout in &slice {
        for row in runout.players() {
            assert!(row.win() >= 0.0 && row.tie() >= 0.0 && row.total() >= 0.0);
            assert!(row.win() <= row.share());
            assert!(row.share() <= row.win() + row.tie());
            assert!(row.win() + row.tie() <= row.total());

            heaviest = heaviest.max(row.total());
        }
    }

    // the magnitudes really are the large ones, rather than a slice that degenerated to
    // something the floor was never going to be troubled by. this weighting reaches
    // 809_262.1 — the weight-1 width scaled by 0.95², the mean of the nine hundredths —
    // and that fractional part is the rounding the floor has to tolerate.
    assert!(
        heaviest > 809_000.0,
        "{heaviest} is not the widest-range scale"
    );
}

#[test]
fn it_matches_the_reference_on_a_reduced_preflop_walk() {
    // suit-naming ranges leave the suit group trivial, so this walks real preflop board
    // classes rather than a canonicalized stand-in; a partition keeps it to a slice.
    let players = ranges(&["AsKs", "QhJd"]);
    let evaluator = EquityEvaluator::preflop(&players).unwrap();

    assert_eq!(evaluator.len(), 2_598_960);

    let slice = evaluator.partition(4000, 0, 1);

    assert!(slice.len() > 500);

    for runout in &slice {
        assert_matches_reference(&runout, &players);
    }
}

#[test]
fn it_matches_the_reference_on_a_reduced_preflop_walk_with_three_players() {
    let players = ranges(&["AsKs", "QhJd", "9c8c"]);
    let evaluator = EquityEvaluator::preflop(&players).unwrap();
    let slice = evaluator.partition(8000, 0, 1);

    // this is the only three-player preflop comparison against the reference, so an empty
    // part would turn it into a test that passes by walking nothing.
    assert!(slice.len() > 100, "{} boards", slice.len());

    for runout in &slice {
        assert_matches_reference(&runout, &players);
    }
}

/// A player's aggregate equity over the walk:
/// `sum(weight * share) / sum(weight * total)`. The hero's own weight enters here and
/// nowhere else — `share / total` is already an equity.
fn aggregate(evaluator: &EquityEvaluator, players: usize) -> Vec<f64> {
    let mut share = vec![0.0; players];
    let mut total = vec![0.0; players];

    for runout in evaluator {
        for row in runout.players() {
            let scale = row.weight();

            share[row.player_index()] += scale * row.share();
            total[row.player_index()] += scale * row.total();
        }
    }

    share
        .into_iter()
        .zip(total)
        .map(|(share, total)| share / total)
        .collect()
}

fn reference_aggregate(known: &[Card], players: &[HandRange]) -> Vec<f64> {
    let mut share = vec![0.0; players.len()];
    let mut total = vec![0.0; players.len()];
    let deck: Vec<Card> = HandRange::from_str("22+,32o+,32s+")
        .unwrap()
        .card_pairs()
        .keys()
        .flat_map(|pair| [pair[0], pair[1]])
        .collect::<std::collections::HashSet<Card>>()
        .into_iter()
        .filter(|card| !known.contains(card))
        .collect();
    let take = 5 - known.len();
    let mut combination: Vec<usize> = (0..take).collect();

    loop {
        let mut board = [known[0]; 5];

        board[..known.len()].copy_from_slice(known);

        for (slot, position) in combination.iter().enumerate() {
            board[known.len() + slot] = deck[*position];
        }

        for (seat, holdings) in reference(&board, players).into_iter().enumerate() {
            for (pair, row) in &holdings {
                // the reference applies the hero's own weight here, by hand, exactly where
                // the walk's aggregate applies `weight()`.
                let weight = players[seat].card_pairs()[pair] as f64;

                share[seat] += weight * row[2];
                total[seat] += weight * row[3];
            }
        }

        let mut slot = take;
        let mut advanced = false;

        while slot > 0 {
            slot -= 1;

            if combination[slot] + 1 < deck.len() - (take - 1 - slot) {
                combination[slot] += 1;

                for next in slot + 1..take {
                    combination[next] = combination[next - 1] + 1;
                }

                advanced = true;

                break;
            }
        }

        if !advanced {
            break;
        }
    }

    share
        .into_iter()
        .zip(total)
        .map(|(share, total)| share / total)
        .collect()
}

#[test]
fn it_aggregates_to_the_reference_equity_over_a_whole_turn_walk() {
    let players = ranges(&["JJ,A5s", "AhKh,7d7s,5c4c"]);
    let board = cards("Qs 8d 2h 7c");
    let walked = aggregate(
        &EquityEvaluator::postflop(&board, &players).unwrap(),
        players.len(),
    );
    let expected = reference_aggregate(&board, &players);

    for (left, right) in walked.iter().zip(expected.iter()) {
        assert!(close(*left, *right), "{left} against {right}");
    }
}

#[test]
fn it_aggregates_to_the_reference_equity_over_a_whole_flop_walk() {
    let players = ranges(&["JJ", "AhKh,5c4c"]);
    let board = cards("Qs 8d 2h");
    let walked = aggregate(
        &EquityEvaluator::postflop(&board, &players).unwrap(),
        players.len(),
    );
    let expected = reference_aggregate(&board, &players);

    for (left, right) in walked.iter().zip(expected.iter()) {
        assert!(close(*left, *right), "{left} against {right}");
    }
}

#[test]
fn it_aggregates_to_the_reference_equity_with_three_players() {
    let players = ranges(&["AhKh,7d7s", "AdKd,7c7h", "AcKc,5c4c"]);
    let board = cards("Qs 8d 2h 7c");
    let walked = aggregate(
        &EquityEvaluator::postflop(&board, &players).unwrap(),
        players.len(),
    );
    let expected = reference_aggregate(&board, &players);

    for (left, right) in walked.iter().zip(expected.iter()) {
        assert!(close(*left, *right), "{left} against {right}");
    }
}

#[test]
fn it_aggregates_to_the_reference_equity_under_canonicalization() {
    let players = ranges(&["JJ", "AKo"]);
    let board = cards("Qs 8s 2s");
    let walked = aggregate(
        &EquityEvaluator::postflop(&board, &players).unwrap(),
        players.len(),
    );
    let expected = reference_aggregate(&board, &players);

    for (left, right) in walked.iter().zip(expected.iter()) {
        assert!(close(*left, *right), "{left} against {right}");
    }
}

#[test]
fn it_carries_each_holding_s_own_range_weight() {
    // A monotone flop and ranges that name no suit, so the group has six elements and
    // most of these boards are emitted by relabelling another board's rows rather than by
    // being scored. That is the case worth asserting: a relabelled row carries the
    // *image* holding's hole cards beside the *preimage* holding's weight and made hand,
    // which is right only because the group stabilizes every range — the image and the
    // preimage are the same weight — and because a global suit permutation preserves a
    // made hand. Both couplings are checked here; a rainbow board exercises neither.
    let players = ranges(&["JJ:0.5,A5s:0.25", "TT:0.75,KQs:0.5"]);
    let board = cards("Qs 8s 2s");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut lightest = f64::INFINITY;
    let mut heaviest = 0.0_f64;

    for runout in &evaluator {
        for row in runout.players() {
            let want = players[row.player_index()].card_pairs()[&row.hole_cards()] as f64;

            assert_eq!(
                row.weight(),
                want,
                "{} of player {} on {:?}",
                row.hole_cards(),
                row.player_index(),
                runout.board(),
            );

            let hole = row.hole_cards();
            let complete = runout.board();
            let hand: MadeHand = [
                hole[0],
                hole[1],
                complete[0],
                complete[1],
                complete[2],
                complete[3],
                complete[4],
            ]
            .into();

            assert_eq!(
                row.hand().power_index(),
                hand.power_index(),
                "{hole} of player {} on {complete:?}",
                row.player_index(),
            );

            lightest = lightest.min(row.weight());
            heaviest = heaviest.max(row.weight());
        }
    }

    // the ranges above weight their holdings differently, so the equality asserted per row
    // is a real check rather than one every constant would pass.
    assert!(lightest < heaviest, "{lightest} against {heaviest}");
}

#[test]
fn it_leaves_a_holding_s_equity_untouched_by_its_own_range_weight() {
    // halving one player's range scales nothing that player's own equity is made of: the
    // weights it reports count the *opponents'* combinations. this is the distinction #42
    // records as a defect.
    let board = cards("Qs 8d 2h");
    let heavy = ranges(&["JJ:0.8,A5s:0.4", "AhKh,5c4c"]);
    let light = vec![
        heavy[0]
            .card_pairs()
            .iter()
            .map(|(pair, weight)| (*pair, weight / 2.0))
            .collect::<HandRange>(),
        heavy[1].clone(),
    ];
    let heavy_walk = EquityEvaluator::postflop(&board, &heavy).unwrap();
    let light_walk = EquityEvaluator::postflop(&board, &light).unwrap();
    let mut rows = 0;

    for (left, right) in (&heavy_walk).into_iter().zip(&light_walk) {
        assert_eq!(left.board(), right.board());
        assert_eq!(left.players().len(), right.players().len());

        for (heavy_row, light_row) in left.players().iter().zip(right.players()) {
            assert_eq!(heavy_row.hole_cards(), light_row.hole_cards());

            if heavy_row.player_index() != 0 {
                continue;
            }

            assert_eq!(light_row.weight(), heavy_row.weight() / 2.0);
            assert_eq!(heavy_row.win(), light_row.win());
            assert_eq!(heavy_row.tie(), light_row.tie());
            assert_eq!(heavy_row.share(), light_row.share());
            assert_eq!(heavy_row.total(), light_row.total());

            rows += 1;
        }
    }

    assert!(rows > 0, "no row of the halved player was walked");
    assert_eq!(
        aggregate(&heavy_walk, heavy.len()),
        aggregate(&light_walk, light.len()),
    );
}

#[test]
fn it_weights_the_aggregate_by_each_holding_s_own_weight() {
    // the reference applies the quarter weight by hand at its own aggregation step, so the
    // two routes agree only if `weight()` is the holding's range weight and the walk's
    // `share`/`total` carry none of it.
    let board = cards("Qs 8d 2h");
    let quartered = ranges(&["JJ,A5s:0.25", "AhKh,5c4c"]);
    let whole = ranges(&["JJ,A5s", "AhKh,5c4c"]);
    let walked = aggregate(
        &EquityEvaluator::postflop(&board, &quartered).unwrap(),
        quartered.len(),
    );
    let expected = reference_aggregate(&board, &quartered);

    for (left, right) in walked.iter().zip(expected.iter()) {
        assert!(close(*left, *right), "{left} against {right}");
    }

    // and the weight moves the answer, so agreeing above is not agreeing on a figure the
    // weight could have been dropped from.
    let unweighted = aggregate(
        &EquityEvaluator::postflop(&board, &whole).unwrap(),
        whole.len(),
    );

    assert!(
        !close(walked[0], unweighted[0]),
        "{} against {}",
        walked[0],
        unweighted[0],
    );
}

#[test]
fn it_keeps_the_four_weights_consistent_with_each_other() {
    // The four invariants below hold by construction: `Outcome::new` floors each part at
    // zero, builds `share` out of those floored parts, and floors `total` at `win + tie`.
    // Asserted on their own they restate the constructor and pass through any defect in
    // the sweep that feeds it. So each row is checked against the brute-force reference
    // first — that is what fails when a term goes missing — and the invariants then say
    // the assembled tuple is still coherent on rows that sit near the cancellation.
    //
    // The ranges overlap, which is what puts a row near it: the sweep's "the opponent
    // holds exactly this holding" add-back is non-zero on every shared holding, so losing
    // it is a real cancellation rather than a subtraction of zero. Both player counts run,
    // because heads-up and three-way assemble the tuple through different algebra.
    for texts in [
        &["JJ,A5s,AhKh", "AhKh,JJ,5c4c"][..],
        &["JJ,A5s", "AhKh,JJ", "JJ,5c4c"][..],
    ] {
        let players = ranges(texts);
        let board = cards("Qs 8d 2h 7c");
        let mut ties = 0;

        for runout in &EquityEvaluator::postflop(&board, &players).unwrap() {
            assert_matches_reference(&runout, &players);

            for row in runout.players() {
                assert!(row.win() >= 0.0 && row.tie() >= 0.0 && row.total() >= 0.0);
                assert!(row.win() <= row.share());
                assert!(row.share() <= row.win() + row.tie());
                assert!(row.win() + row.tie() <= row.total());

                if row.tie() > 0.0 {
                    ties += 1;
                }
            }
        }

        // a tuple whose split terms are all zero satisfies the invariants trivially.
        assert!(ties > 0, "no split pot was walked for {texts:?}");
    }
}

#[test]
fn it_gives_the_whole_pot_to_a_holding_nothing_can_reach() {
    let players = ranges(&["AsKs", "2c2d,3c3d"]);
    let board = cards("Qs Js Ts 4h 9d");
    let runout = EquityEvaluator::postflop(&board, &players)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let hero = runout
        .players()
        .iter()
        .find(|row| row.player_index() == 0)
        .unwrap();

    assert_eq!(hero.hand().hand_type(), MadeHandType::StraightFlush);
    assert_eq!(hero.tie(), 0.0);
    assert_eq!(hero.win(), hero.total());
    assert_eq!(hero.share(), hero.total());
    assert!(hero.total() > 0.0);
}

#[test]
fn it_emits_a_holding_no_opponent_combination_survives() {
    let players = ranges(&["AsKs", "AsKs"]);
    let board = cards("Qs 8d 2h 7c 4d");
    let runout = EquityEvaluator::postflop(&board, &players)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();

    assert_eq!(runout.players().len(), 2);

    for row in runout.players() {
        assert_eq!(row.total(), 0.0);
        assert_eq!(row.win(), 0.0);
        assert_eq!(row.tie(), 0.0);
        assert_eq!(row.share(), 0.0);
    }
}

#[test]
fn it_emits_a_runout_no_player_survives() {
    // `players()` is documented as possibly empty, which is not something a caller would
    // guess from a walk whose row count is otherwise stable. Two one-holding ranges are
    // the smallest input that reaches it: the completion has to deal a spade ace or king
    // *and* a heart ace or king, which 4 of the 1,176 do.
    let players = ranges(&["AsKs", "AhKh"]);
    let board = cards("Qc 8d 2c");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut empty = 0;

    assert_eq!(evaluator.len(), 1176);

    for runout in &evaluator {
        if runout.players().is_empty() {
            empty += 1;
        }
    }

    assert_eq!(empty, 4);
}

#[test]
fn it_splits_a_pot_two_ways() {
    let players = ranges(&["AhKh", "AdKd"]);
    let board = cards("As Ks Qh 7c 2d");
    let runout = EquityEvaluator::postflop(&board, &players)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let hero = &runout.players()[0];

    assert_eq!(hero.win(), 0.0);
    assert_eq!(hero.tie(), 1.0);
    assert_eq!(hero.share(), 0.5);
    assert_eq!(hero.total(), 1.0);
}

#[test]
fn it_splits_a_pot_three_ways() {
    let players = ranges(&["AhKh", "AdKd", "AcKc"]);
    let board = cards("As Ks Qh 7c 2d");
    let runout = EquityEvaluator::postflop(&board, &players)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let hero = &runout.players()[0];

    assert_eq!(hero.win(), 0.0);
    assert_eq!(hero.tie(), 1.0);
    assert!(close(hero.share(), 1.0 / 3.0));
    assert_eq!(hero.total(), 1.0);
}

#[test]
fn it_distinguishes_a_two_way_split_from_a_three_way_one() {
    // both runouts give the hero the same share; only `tie` says how many ways the pot
    // went, which is why it is carried rather than recovered from `share - win`.
    let board = cards("As Ks Qh 7c 2d");
    let two_way = ranges(&["AhKh", "AdKd", "3c3d:0.5"]);
    let three_way = ranges(&["AhKh", "AdKd", "AcKc:0.75"]);

    let split = |players: &[HandRange]| {
        let runout = EquityEvaluator::postflop(&board, players)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let hero = runout.players()[0];

        (hero.win(), hero.tie(), hero.share())
    };

    let (two_win, two_tie, two_share) = split(&two_way);
    let (three_win, three_tie, three_share) = split(&three_way);

    assert_eq!(two_win, three_win);
    assert_eq!(two_share, three_share);
    assert_ne!(two_tie, three_tie);
    assert_eq!(two_tie, 0.5);
    assert_eq!(three_tie, 0.75);
}

#[test]
fn it_names_the_wheel_and_the_steel_wheel() {
    let wheel_board = cards("3d 4c 5h 9s Kd");
    let wheel = EquityEvaluator::postflop(&wheel_board, &ranges(&["As2c", "KsQs"]))
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let hero = wheel.players()[0];

    assert_eq!(hero.hole_cards(), CardPair::from_str("As2c").unwrap());
    assert_eq!(hero.hand().hand_type(), MadeHandType::Straight);
    assert_eq!(hero.hand().power_index(), 1609);

    let steel_board = cards("3s 4s 5s 9d Kc");
    let steel = EquityEvaluator::postflop(&steel_board, &ranges(&["As2s", "KhQh"]))
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let hero = steel.players()[0];

    assert_eq!(hero.hole_cards(), CardPair::from_str("As2s").unwrap());
    assert_eq!(hero.hand().hand_type(), MadeHandType::StraightFlush);
    assert_eq!(hero.hand().power_index(), 10);
    assert_eq!(hero.win(), hero.total());
}

#[test]
fn it_reports_the_number_of_runouts_it_yields() {
    let players = ranges(&["JJ", "AKo"]);

    for board in ["Qs 8d 2h", "Qs 8d 2h 7c", "Qs 8d 2h 7c 4d"] {
        let board = cards(board);
        let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
        let promised = evaluator.len();

        assert_eq!(evaluator.into_iter().count(), promised);

        let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
        let part = evaluator.partition(7, 2, 5);
        let promised = part.len();

        assert_eq!(part.into_iter().count(), promised);
    }
}

#[test]
fn it_counts_down_as_it_walks() {
    let players = ranges(&["JJ", "AKo"]);
    let board = cards("Qs 8d 2h 7c");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut remaining = evaluator.len();
    let mut walk = evaluator.into_iter();

    assert_eq!(walk.len(), remaining);

    while walk.next().is_some() {
        remaining -= 1;

        assert_eq!(walk.len(), remaining);
    }

    assert_eq!(remaining, 0);
}

#[test]
fn it_partitions_the_walk_into_disjoint_parts_covering_the_whole() {
    let players = ranges(&["JJ", "AKo"]);

    // The rainbow boards leave the group trivial, so `Shared::locate` answers from the
    // walk index alone and never consults the orbit offsets. The two spade boards give
    // the group six elements, which is what makes a partition boundary land in the middle
    // of an orbit — the one thing the emission's `within` offset exists to get right.
    for board in [
        "Qs 8d 2h",
        "Qs 8d 2h 7c",
        "Qs 8d 2h 7c 4d",
        "Qs 8s 2s",
        "Qs 8s 2s 7s",
    ] {
        let board = cards(board);
        let whole: Vec<[Card; 5]> = EquityEvaluator::postflop(&board, &players)
            .unwrap()
            .into_iter()
            .map(|runout| *runout.board())
            .collect();
        let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
        let divisor = 5;
        let mut parts = vec![];
        let mut lengths = 0;

        for index in 0..divisor {
            let part = evaluator.partition(divisor, index, index + 1);

            lengths += part.len();
            parts.push(
                part.into_iter()
                    .map(|runout| *runout.board())
                    .collect::<Vec<_>>(),
            );
        }

        assert_eq!(lengths, whole.len());

        let mut union: Vec<[Card; 5]> = parts.concat();

        assert_eq!(union.len(), whole.len());

        let mut sorted = whole.clone();

        union.sort_unstable();
        sorted.sort_unstable();

        assert_eq!(union, sorted);
    }
}

#[test]
fn it_partitions_and_iterates_in_ordinary_method_position() {
    // the standing proof of the call shape. `EquityEvaluator` must not implement
    // `Iterator`: that trait supplies a `partition(self, f)` of its own, which method
    // resolution finds a step earlier than an inherent `partition(&self, ..)` and which
    // would make the call below fail to compile.
    let players = ranges(&["JJ", "AKo"]);
    let board = cards("Qs 8d 2h");
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let part = evaluator.partition(4, 0, 1);
    let mut walked = 0;

    for runout in &evaluator {
        assert_eq!(runout.board()[..3], board[..]);

        walked += 1;
    }

    // the `for` loop borrowed the evaluator, so it is still here to be asked.
    assert_eq!(walked, evaluator.len());
    assert!(!part.is_empty());
    assert!(part.len() < evaluator.len());

    let mut parted = 0;

    for runout in &part {
        assert_eq!(runout.board()[..3], board[..]);

        parted += 1;
    }

    assert_eq!(parted, part.len());
}

#[test]
fn it_aggregates_the_same_across_a_partition_as_across_the_whole() {
    let players = ranges(&["JJ", "AhKh,5c4c"]);
    let board = cards("Qs 8d 2h");
    let whole = aggregate(
        &EquityEvaluator::postflop(&board, &players).unwrap(),
        players.len(),
    );
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut share = vec![0.0; players.len()];
    let mut total = vec![0.0; players.len()];

    for index in 0..4 {
        for runout in &evaluator.partition(4, index, index + 1) {
            for row in runout.players() {
                let scale = row.weight();

                share[row.player_index()] += scale * row.share();
                total[row.player_index()] += scale * row.total();
            }
        }
    }

    for (seat, expected) in whole.iter().enumerate() {
        assert!(close(share[seat] / total[seat], *expected));
    }
}

#[test]
fn it_rejects_a_board_it_cannot_complete() {
    let players = ranges(&["JJ", "AKo"]);

    for board in ["As", "As Ks", "As Ks Qs Js Ts 9s"] {
        let board = cards(board);

        assert_eq!(
            EquityEvaluator::postflop(&board, &players).unwrap_err(),
            EquityEvaluatorError::InvalidBoardSize(board.len()),
        );
    }
}

#[test]
fn it_rejects_a_board_holding_the_same_card_twice() {
    let players = ranges(&["JJ", "AKo"]);
    let board = cards("As Ks As");

    assert_eq!(
        EquityEvaluator::postflop(&board, &players).unwrap_err(),
        EquityEvaluatorError::DuplicateBoardCard(Card::from_str("As").unwrap()),
    );
}

#[test]
fn it_rejects_a_player_count_its_algebra_does_not_cover() {
    let board = cards("Qs 8d 2h");

    for texts in [
        vec![],
        vec!["JJ"],
        vec!["JJ", "AKo", "22", "33"],
        vec!["JJ", "AKo", "22", "33", "44"],
    ] {
        let players = ranges(&texts);

        assert_eq!(
            EquityEvaluator::postflop(&board, &players).unwrap_err(),
            EquityEvaluatorError::UnsupportedPlayerCount(players.len()),
        );
        assert_eq!(
            EquityEvaluator::preflop(&players).unwrap_err(),
            EquityEvaluatorError::UnsupportedPlayerCount(players.len()),
        );
    }
}

#[test]
fn it_rejects_a_range_the_board_leaves_nothing_of() {
    let players = ranges(&["JJ", "AsKs,AsKh"]);
    let board = cards("As Ks Kh");

    assert_eq!(
        EquityEvaluator::postflop(&board, &players).unwrap_err(),
        EquityEvaluatorError::NoLiveHolding(1),
    );

    let empty = vec![HandRange::empty(), HandRange::from_str("JJ").unwrap()];

    assert_eq!(
        EquityEvaluator::preflop(&empty).unwrap_err(),
        EquityEvaluatorError::NoLiveHolding(0),
    );
}

#[test]
fn it_rejects_a_range_weight_it_cannot_use() {
    // `HandRange` implements `FromIterator<(CardPair, f32)>`, so a caller can build a
    // range the parser never could — a `NaN` arrives from something as ordinary as
    // normalising counts by a zero total. It is the dangerous one, because it compares
    // unequal to itself: it used to falsify the suit-stabilizer's invariance predicate for
    // the identity permutation and leave the group empty, which panicked inside the
    // constructor in a debug build and, in a release build, returned `Ok` and panicked
    // later from the middle of the walk.
    let board = cards("Qs 8d 2h");
    let offender = CardPair::from_str("AhKh").unwrap();

    for weight in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, -1.0, -1e-9] {
        let hero = weighted(&[("AhKh", weight), ("QdJd", 1.0)]);
        let players = vec![hero, HandRange::from_str("9c8c,7d7s").unwrap()];

        assert_eq!(
            EquityEvaluator::postflop(&board, &players).unwrap_err(),
            EquityEvaluatorError::InvalidRangeWeight(0, offender),
            "postflop accepted a weight of {weight}",
        );
        assert_eq!(
            EquityEvaluator::preflop(&players).unwrap_err(),
            EquityEvaluatorError::InvalidRangeWeight(0, offender),
            "preflop accepted a weight of {weight}",
        );
    }

    // the whole range is checked, not only what survives card removal: the stabilizer
    // reads every pair whether the board leaves it live or not.
    let players = vec![
        HandRange::from_str("JJ").unwrap(),
        // `QsJs` is dead — the board holds `Qs` — and `AhKh` keeps the range non-empty,
        // so a check reading only the live holdings would let this one through.
        weighted(&[("QsJs", f32::NAN), ("AhKh", 1.0)]),
    ];

    assert_eq!(
        EquityEvaluator::postflop(&board, &players).unwrap_err(),
        EquityEvaluatorError::InvalidRangeWeight(1, CardPair::from_str("QsJs").unwrap()),
    );
}

#[test]
fn it_walks_every_weight_it_accepted_without_panicking() {
    // the other half of the contract the rejection above states: a weight the constructor
    // took is one the sweep can carry to the end of the walk. zero is the boundary the
    // non-negative test admits, and the other two sit six orders either side of one, so
    // the accumulators are exercised well away from the magnitude the tests usually use.
    let board = cards("Qs 8s 2s");
    let players = vec![
        weighted(&[("AhKh", 0.0), ("QdJd", 1.0e6), ("7c7d", 1.0e-6)]),
        HandRange::from_str("JJ").unwrap(),
    ];
    let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();
    let mut walked = 0;

    for runout in &evaluator {
        walked += 1;

        for row in runout.players() {
            assert!(row.total().is_finite());
        }
    }

    assert_eq!(walked, evaluator.len());
}

#[test]
fn it_describes_why_it_rejected_an_input() {
    let error = EquityEvaluatorError::InvalidBoardSize(2);

    assert!(error.to_string().contains('2'));

    let error = EquityEvaluatorError::UnsupportedPlayerCount(4);

    assert!(error.to_string().contains('4'));

    let error = EquityEvaluatorError::InvalidRangeWeight(1, CardPair::from_str("AhKh").unwrap());

    assert!(error.to_string().contains('1'));
    assert!(error.to_string().contains("AhKh"));
}

/// Per-holding `(share, total)` summed over the whole walk, keyed by `(player, holding)`.
///
/// The ranges these are taken over weight every holding at 1, so each accumulator is a
/// sum of integers and halves and stays exact in `f64` — which is why the orbit
/// assertions below can demand equality outright rather than a tolerance.
fn walk_equities(evaluator: &EquityEvaluator) -> HashMap<(usize, CardPair), (f64, f64)> {
    let mut totals: HashMap<(usize, CardPair), (f64, f64)> = HashMap::new();

    for runout in evaluator {
        for row in runout.players() {
            let slot = totals
                .entry((row.player_index(), row.hole_cards()))
                .or_insert((0.0, 0.0));

            slot.0 += row.share();
            slot.1 += row.total();
        }
    }

    totals
}

fn equity_of(
    equities: &HashMap<(usize, CardPair), (f64, f64)>,
    player: usize,
    holding: &str,
) -> (f64, f64) {
    equities[&(player, CardPair::from_str(holding).unwrap())]
}

#[test]
fn it_reports_one_equity_across_a_two_tone_flop_s_orbit() {
    // `d` and `c` are interchangeable on `Qs8s2h` and neither range names a suit, so
    // `AdKd` and `AcKc` are one situation relabelled and have to report one equity.
    // Nothing about the aggregate can see this: the aggregate is invariant under exactly
    // the group that makes the two the same, which is how the first implementation of
    // this walk shipped them 0.2 points apart through a green suite.
    let players = ranges(&["AKs", "AKs"]);
    let board = cards("Qs 8s 2h");
    let equities = walk_equities(&EquityEvaluator::postflop(&board, &players).unwrap());

    for player in 0..players.len() {
        assert_eq!(
            equity_of(&equities, player, "AdKd"),
            equity_of(&equities, player, "AcKc"),
            "player {player} splits the orbit of AdKd and AcKc",
        );

        // and the assertion above is not one every holding would pass: the board's own
        // suits are fixed by the group, so a spade or a heart holding sits outside that
        // orbit and reports its own figure.
        assert_ne!(
            equity_of(&equities, player, "AsKs"),
            equity_of(&equities, player, "AdKd"),
        );
        assert_ne!(
            equity_of(&equities, player, "AhKh"),
            equity_of(&equities, player, "AdKd"),
        );
    }
}

#[test]
fn it_reports_one_equity_across_a_monotone_flop_s_orbit() {
    // three interchangeable suits on `Qs8s2s`, so all three offsuit-to-the-board holdings
    // are one orbit.
    let players = ranges(&["AKs", "AKs"]);
    let board = cards("Qs 8s 2s");
    let equities = walk_equities(&EquityEvaluator::postflop(&board, &players).unwrap());

    for player in 0..players.len() {
        let reference = equity_of(&equities, player, "AdKd");

        for holding in ["AhKh", "AcKc"] {
            assert_eq!(
                equity_of(&equities, player, holding),
                reference,
                "player {player} splits the orbit at {holding}",
            );
        }

        assert_ne!(equity_of(&equities, player, "AsKs"), reference);
    }
}

#[test]
fn it_matches_the_reference_with_ranges_that_overlap() {
    // Every other reference comparison here uses pairwise-disjoint ranges, which drives
    // the sweep's "the opponent holds exactly this holding" add-back to zero on every
    // row — so the term is asserted against a value it would also take if it were missing
    // altogether. Both players holding the same range makes it non-zero everywhere.
    let players = ranges(&["22+,A2s+", "22+,A2s+"]);
    let shared = players[0]
        .card_pairs()
        .keys()
        .filter(|pair| players[1].card_pairs().contains_key(*pair))
        .count();

    assert!(shared > 0, "the ranges do not overlap");

    for board in ["Qs 8d 2h 7c 4d", "Qs 8d 2h 7c"] {
        let board = cards(board);

        for runout in &EquityEvaluator::postflop(&board, &players).unwrap() {
            assert_matches_reference(&runout, &players);
        }
    }
}

#[test]
fn it_matches_the_reference_where_two_opponents_share_a_holding() {
    // The three-player form subtracts the opponent pairs that clash on one card with a
    // dot product, which subtracts the pairs that are the *same* holding twice and adds
    // them back once. Two opponents holding the same combos is what makes that add-back
    // non-zero; player 0 holding one of them too exercises the hero's own add-back on the
    // same rows.
    let players = ranges(&["AhKh,AcKc", "AcKc,AdKd", "AcKc,AdKd"]);
    let board = cards("Qs 8d 2h");
    let mut ties = 0;

    for runout in &EquityEvaluator::postflop(&board, &players).unwrap() {
        assert_matches_reference(&runout, &players);

        ties += runout
            .players()
            .iter()
            .filter(|row| row.tie() > 0.0)
            .count();
    }

    // a non-zero `tie` somewhere is what says the walk reached rows where more than one
    // opponent combination was live at all, rather than everything cancelling to zero.
    assert!(ties > 0, "no split pot was walked");
}

#[test]
fn it_orders_the_rows_by_player_and_then_by_holding() {
    // the contract `Runout::players` states, and the one place it is not free: a board
    // reached by relabelling another board's rows gets its holdings in the order the
    // *original* board's were, unless the relabelling is undone in the ordering too.
    let players = ranges(&["JJ+", "A2s+,AKo"]);
    let board = cards("Qs 8s 2s");
    let mut boards = 0;

    for runout in &EquityEvaluator::postflop(&board, &players).unwrap() {
        let mut previous: Option<(usize, CardPair)> = None;

        for row in runout.players() {
            let here = (row.player_index(), row.hole_cards());

            if let Some(before) = previous {
                assert!(
                    before.0 < here.0
                        || (before.0 == here.0
                            && (before.1[0], before.1[1]) < (here.1[0], here.1[1])),
                    "{before:?} came before {here:?} on {:?}",
                    runout.board(),
                );
            }

            previous = Some(here);
        }

        // and the board's own cards read in ascending order too, whether it was scored
        // directly or relabelled from the board that was.
        assert!(
            runout.board()[3] < runout.board()[4],
            "{:?} is not in order",
            runout.board(),
        );

        boards += 1;
    }

    // this flop's group has six elements, so the great majority of these boards were
    // relabelled from another board's rows rather than scored in their own right.
    assert_eq!(boards, 1176);
}

#[test]
fn it_yields_one_runout_per_board_where_canonicalization_engages() {
    let players = ranges(&["JJ+", "AQs+"]);
    let evaluator = EquityEvaluator::preflop(&players).unwrap();

    assert_eq!(evaluator.len(), 2_598_960);

    let slice = evaluator.partition(2_000, 0, 1);
    let boards: std::collections::HashSet<[Card; 5]> =
        (&slice).into_iter().map(|runout| *runout.board()).collect();

    assert!(slice.len() > 1_000);
    assert_eq!(boards.len(), slice.len(), "a board was emitted twice");
}
