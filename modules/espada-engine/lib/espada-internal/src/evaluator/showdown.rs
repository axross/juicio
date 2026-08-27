use super::MadeHand;
use crate::card::Card;
use crate::hand_range::CardPair;
use fxhash::FxBuildHasher;
use std::collections::HashSet;

#[derive(Debug)]
pub struct Showdown {
    board: [Card; 5],
    players: Vec<ShowdownPlayer>,
    probability: f32,
}

impl Showdown {
    pub fn new(players: Vec<CardPair>, board: [Card; 5], probability: f32) -> Option<Showdown> {
        debug_assert!(board.len() == 5);

        let mut showdown_players = vec![];
        let mut strongest_index = u16::MAX;
        let mut winner_indexes =
            HashSet::with_capacity_and_hasher(players.len(), FxBuildHasher::default());

        for (i, player) in players.into_iter().enumerate() {
            if board.contains(&player[0]) || board.contains(&player[1]) {
                return None;
            }

            // no two players can hold the same physical card. scanning the players
            // already accepted costs less than a set at the sizes this is called with.
            if showdown_players.iter().any(|accepted: &ShowdownPlayer| {
                accepted.hole_cards[0] == player[0]
                    || accepted.hole_cards[0] == player[1]
                    || accepted.hole_cards[1] == player[0]
                    || accepted.hole_cards[1] == player[1]
            }) {
                return None;
            }

            let made_hand: MadeHand = [
                player[0], player[1], board[0], board[1], board[2], board[3], board[4],
            ]
            .into();
            let power_index = made_hand.power_index();

            let showdown_player = ShowdownPlayer {
                hole_cards: player,
                board: [board[0], board[1], board[2], board[3], board[4]],
                hand: made_hand,
                win: false,
            };

            if power_index <= strongest_index {
                if power_index < strongest_index {
                    strongest_index = power_index;
                    winner_indexes.clear();
                }

                winner_indexes.insert(i);
            }

            showdown_players.push(showdown_player);
        }

        for (i, player) in showdown_players.iter_mut().enumerate() {
            if winner_indexes.contains(&i) {
                player.win = true;
            }
        }

        Some(Showdown {
            players: showdown_players,
            board,
            probability,
        })
    }

    pub fn board(&self) -> &[Card; 5] {
        &self.board
    }

    pub fn players(&self) -> &Vec<ShowdownPlayer> {
        &self.players
    }

    pub fn probability(&self) -> f32 {
        self.probability
    }

    pub fn winner_len(&self) -> u8 {
        let mut len = 0;

        for player in &self.players {
            if player.win {
                len += 1;
            }
        }

        len
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ShowdownPlayer {
    hole_cards: CardPair,
    board: [Card; 5],
    hand: MadeHand,
    win: bool,
}

impl ShowdownPlayer {
    pub fn hole_cards(&self) -> CardPair {
        self.hole_cards
    }

    pub fn board(&self) -> [Card; 5] {
        self.board
    }

    pub fn cards(&self) -> [Card; 7] {
        [
            self.board[0],
            self.board[1],
            self.board[2],
            self.board[3],
            self.board[4],
            self.hole_cards[0],
            self.hole_cards[1],
        ]
    }

    pub fn hand(&self) -> MadeHand {
        self.hand
    }

    pub fn is_winner(&self) -> bool {
        self.win
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod new {
        use super::*;
        use crate::card::{Rank, Suit};
        use std::str::FromStr;

        fn board() -> [Card; 5] {
            [
                Card::new(Rank::Queen, Suit::Spade),
                Card::new(Rank::Eight, Suit::Diamond),
                Card::new(Rank::Deuce, Suit::Heart),
                Card::new(Rank::Ace, Suit::Diamond),
                Card::new(Rank::Seven, Suit::Club),
            ]
        }

        fn showdown(hole_cards: &[&str]) -> Option<Showdown> {
            Showdown::new(
                hole_cards
                    .iter()
                    .map(|pair| CardPair::from_str(pair).unwrap())
                    .collect(),
                board(),
                1.0,
            )
        }

        #[test]
        fn it_returns_none_when_two_players_share_a_card() {
            // one row per position the shared card takes in the two pairs, which a pair
            // orders by card rather than by the order it was written in.
            for (first, second) in [
                ("AsKs", "AsQd"),
                ("KsQd", "AsKs"),
                ("AsKs", "KsQd"),
                ("AsKs", "AhKs"),
            ] {
                assert!(showdown(&[first, second]).is_none(), "{first} {second}");
            }
        }

        #[test]
        fn it_returns_none_when_players_who_are_not_neighbours_share_a_card() {
            // every player already accepted is compared against, not only the one dealt
            // immediately before. a collision between the first and the third is what
            // tells those two readings apart, and no two-player row can.
            for hole_cards in [["AsKs", "9s9h", "AsQd"], ["AsKs", "9s9h", "KsQd"]] {
                assert!(showdown(&hole_cards).is_none(), "{hole_cards:?}");
            }

            // the same three seats with the third player's collision removed, so the
            // rows above cannot pass by rejecting every three-player deal.
            assert!(showdown(&["AsKs", "9s9h", "JcTc"]).is_some());
        }

        #[test]
        fn it_returns_none_when_a_player_holds_a_board_card() {
            for (first, second) in [("QsKd", "9s9c"), ("Kd2h", "9s9c"), ("KsKd", "Qs9d")] {
                assert!(showdown(&[first, second]).is_none(), "{first} {second}");
            }
        }

        #[test]
        fn it_returns_some_when_every_card_is_distinct() {
            let showdown = showdown(&["AsKs", "9s9h"]).unwrap();

            assert_eq!(showdown.winner_len(), 1);
            assert!(showdown.players()[0].is_winner());
            assert!(!showdown.players()[1].is_winner());
        }

        #[test]
        fn it_returns_some_when_two_players_hold_different_cards_of_the_same_rank() {
            let showdown = showdown(&["AsKs", "AhKh"]).unwrap();

            assert_eq!(showdown.winner_len(), 2);
            assert!(showdown.players()[0].is_winner());
            assert!(showdown.players()[1].is_winner());
        }
    }
}
