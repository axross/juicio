// this file is an integration test rather than an inline `#[cfg(test)]` module on
// purpose. an inline test compiles inside the crate, so it reaches a private
// submodule's items directly and cannot observe a type that is `pub` but missing from
// its module's `pub use` list. linking espada as an external crate is the only
// viewpoint from which that gap is visible, which is what let three such types ship
// unnoticed. every public type is named here so removing a re-export fails the build.

use espada::card::{Card, ParseCardError, Rank, RankRange, Suit, SuitRange};
use espada::evaluator::{
    EquityEvaluator, EquityEvaluatorError, EquityEvaluatorIterator, MadeHand, MadeHandType, Runout,
    RunoutPlayer,
};
use espada::hand_range::{
    CardPair, HandRange, HandRangeToken, HandRangeTokenKind, ParseCardPairError,
    ParseHandRangeError, RankPair,
};
use std::error::Error;
use std::str::FromStr;

fn describe(error: &ParseCardError) -> String {
    error.to_string()
}

fn ranks_of(range: RankRange) -> Vec<Rank> {
    range.into_iter().collect()
}

fn suits_of(range: SuitRange) -> Vec<Suit> {
    range.into_iter().collect()
}

#[test]
fn card_types_are_nameable_from_outside_the_crate() {
    let card: Card = Card::new(Rank::Ace, Suit::Spade);

    assert_eq!(card.rank(), &Rank::Ace);
    assert_eq!(card.suit(), &Suit::Spade);
    assert_eq!(ranks_of(RankRange::all()).len(), 13);
    assert_eq!(suits_of(SuitRange::all()).len(), 4);

    let error: ParseCardError = Card::from_str("Xx").unwrap_err();

    assert!(describe(&error).contains("Xx"));
}

fn category_of(hand: MadeHand) -> MadeHandType {
    hand.hand_type()
}

fn best_of(players: &[RunoutPlayer]) -> &RunoutPlayer {
    players
        .iter()
        .min_by_key(|player| player.hand().power_index())
        .unwrap()
}

fn iterator_of(evaluator: &EquityEvaluator) -> EquityEvaluatorIterator {
    evaluator.into_iter()
}

#[test]
fn evaluator_types_are_nameable_from_outside_the_crate() {
    let royal_flush: MadeHand = [
        Card::new(Rank::Ace, Suit::Spade),
        Card::new(Rank::King, Suit::Spade),
        Card::new(Rank::Queen, Suit::Spade),
        Card::new(Rank::Jack, Suit::Spade),
        Card::new(Rank::Ten, Suit::Spade),
        Card::new(Rank::Deuce, Suit::Heart),
        Card::new(Rank::Trey, Suit::Diamond),
    ]
    .into();

    assert_eq!(royal_flush.power_index(), 1);

    // the `match` is the point: a caller can only write one once the enum is nameable.
    let named = match category_of(royal_flush) {
        MadeHandType::StraightFlush => "straight flush",
        MadeHandType::Quads => "quads",
        MadeHandType::FullHouse => "full house",
        MadeHandType::Flush => "flush",
        MadeHandType::Straight => "straight",
        MadeHandType::Trips => "trips",
        MadeHandType::TwoPair => "two pair",
        MadeHandType::Pair => "pair",
        MadeHandType::HighCard => "high card",
    };

    assert_eq!(named, "straight flush");

    let board = [
        Card::new(Rank::Queen, Suit::Club),
        Card::new(Rank::Eight, Suit::Diamond),
        Card::new(Rank::Deuce, Suit::Club),
        Card::new(Rank::Seven, Suit::Heart),
        Card::new(Rank::Four, Suit::Diamond),
    ];
    let players = vec![
        HandRange::from_str("AsKs").unwrap(),
        HandRange::from_str("JhJd").unwrap(),
    ];
    let evaluator: EquityEvaluator = EquityEvaluator::postflop(&board, &players).unwrap();

    assert_eq!(evaluator.len(), 1);
    assert!(!evaluator.is_empty());
    assert_eq!(
        evaluator.partition(2, 0, 1).len() + evaluator.partition(2, 1, 2).len(),
        evaluator.len(),
    );

    let mut iterator: EquityEvaluatorIterator = iterator_of(&evaluator);
    let runout: Runout = iterator.next().unwrap();

    assert!(iterator.next().is_none());
    assert_eq!(runout.board(), &board);

    let best: &RunoutPlayer = best_of(runout.players());

    assert_eq!(best.player_index(), 1);
    assert_eq!(best.hole_cards(), CardPair::from_str("JhJd").unwrap());
    assert_eq!(category_of(best.hand()), MadeHandType::Pair);
    assert_eq!(best.weight(), 1.0);
    assert_eq!(best.win(), best.total());
    assert_eq!(best.share(), best.total());
    assert_eq!(best.tie(), 0.0);

    // a rejected input is only actionable from outside the crate once the caller can name
    // the error type and match its variants.
    let error: EquityEvaluatorError = EquityEvaluator::postflop(&board[..2], &players).unwrap_err();
    let reason = match error.clone() {
        EquityEvaluatorError::InvalidBoardSize(len) => format!("board of {len}"),
        EquityEvaluatorError::DuplicateBoardCard(card) => format!("duplicate {card}"),
        EquityEvaluatorError::UnsupportedPlayerCount(len) => format!("{len} players"),
        EquityEvaluatorError::NoLiveHolding(index) => format!("player {index} empty"),
        EquityEvaluatorError::InvalidRangeWeight(index, pair) => {
            format!("player {index} weights {pair}")
        }
        EquityEvaluatorError::InvalidHolding(pair) => format!("invalid holding {pair}"),
    };

    assert_eq!(reason, "board of 2");

    let as_error: &dyn Error = &error;

    assert!(as_error.to_string().contains("3, 4, or 5"));
}

fn expand(pair: RankPair) -> Vec<CardPair> {
    pair.into_iter().collect()
}

fn token_of(kind: HandRangeTokenKind, probability: f32) -> HandRangeToken {
    HandRangeToken::new(kind, probability)
}

#[test]
fn hand_range_types_are_nameable_from_outside_the_crate() {
    let range: HandRange = HandRange::from_str("JJ+").unwrap();

    assert_eq!(range.card_pairs().len(), 24);
    assert_eq!(range.rank_pairs().len(), 4);

    let pair: CardPair = CardPair::from_str("AsKh").unwrap();

    assert_eq!(
        pair,
        CardPair::new(
            Card::new(Rank::Ace, Suit::Spade),
            Card::new(Rank::King, Suit::Heart),
        ),
    );
    assert_eq!(expand(RankPair::Pocket(Rank::Ace)).len(), 6);

    // matching the variants is what the missing re-export made impossible.
    let error: ParseCardPairError = CardPair::from_str("As").unwrap_err();
    let reason = match error {
        ParseCardPairError::InvalidLength(length) => format!("length {length}"),
        ParseCardPairError::InvalidCardStr(value) => format!("card {value}"),
    };

    assert_eq!(reason, "length 2");

    let token: HandRangeToken = token_of(
        HandRangeTokenKind::SingleRankPair(RankPair::Pocket(Rank::Ace)),
        1.0,
    );

    assert_eq!(token.to_string(), "AA");

    // a rejected range is only actionable from outside the crate once the caller can
    // name the error type and match its variants.
    let empty_error: ParseHandRangeError = HandRange::from_str("").unwrap_err();
    let invalid_error: ParseHandRangeError = HandRange::from_str("JJ+,garbage").unwrap_err();
    let rejection = match invalid_error.clone() {
        ParseHandRangeError::Empty => "empty".to_string(),
        ParseHandRangeError::InvalidToken(token) => format!("token {token}"),
    };

    assert_eq!(empty_error, ParseHandRangeError::Empty);
    assert_eq!(rejection, "token garbage");

    let as_error: &dyn Error = &invalid_error;

    assert!(as_error.to_string().contains("garbage"));
}
