// This file is an integration test rather than an inline `#[cfg(test)]` module on
// purpose. An inline test compiles inside the crate, so it reaches a private
// submodule's items directly and cannot observe a type that is `pub` but missing from
// its module's `pub use` list. Linking espada as an external crate is the only
// viewpoint from which that gap is visible, which is what let three such types ship
// unnoticed. Every public type is named here so removing a re-export fails the build.

use espada::card::{Card, ParseCardError, Rank, RankRange, Suit, SuitRange};
use espada::evaluator::{
    FlopExhaustiveEvaluator, FlopExhaustiveEvaluatorIterator, MadeHand, MadeHandType, Showdown,
    ShowdownPlayer,
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

fn winner_of(players: &[ShowdownPlayer]) -> Option<&ShowdownPlayer> {
    players.iter().find(|player| player.is_winner())
}

fn iterator_of(evaluator: FlopExhaustiveEvaluator) -> FlopExhaustiveEvaluatorIterator {
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

    // The `match` is the point: a caller can only write one once the enum is nameable.
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
    let showdown: Showdown = Showdown::new(
        vec![
            CardPair::from_str("AsKs").unwrap(),
            CardPair::from_str("JhJd").unwrap(),
        ],
        board,
        1.0,
    )
    .unwrap();

    assert_eq!(showdown.probability(), 1.0);
    assert_eq!(showdown.winner_len(), 1);
    assert_eq!(showdown.board(), &board);

    let winner: &ShowdownPlayer = winner_of(showdown.players()).unwrap();

    assert_eq!(winner.hole_cards(), CardPair::from_str("JhJd").unwrap());
    assert_eq!(category_of(winner.hand()), MadeHandType::Pair);
    assert_eq!(winner.cards().len(), 7);
    assert_eq!(winner.board(), board);

    let evaluator = FlopExhaustiveEvaluator::new(
        &[Some(board[0]), Some(board[1]), Some(board[2]), None, None],
        &vec![HandRange::from_str("AsKs").unwrap()],
    );
    let mut iterator: FlopExhaustiveEvaluatorIterator = iterator_of(evaluator);

    assert!(iterator.next().is_some());
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

    // Matching the variants is what the missing re-export made impossible.
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

    // A rejected range is only actionable from outside the crate once the caller can
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
