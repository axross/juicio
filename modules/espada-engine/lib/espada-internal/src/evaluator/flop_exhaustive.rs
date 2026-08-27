use super::showdown::Showdown;
use crate::card::{Card, RankRange, SuitRange};
use crate::hand_range::{CardPair, HandRange};
use fxhash::FxBuildHasher;
use std::collections::HashSet;

pub struct FlopExhaustiveEvaluator {
    board: [Option<Card>; 5],
    players: Vec<HandRange>,
    turn_from: u8,
    river_from: u8,
    turn_to: u8,
    river_to: u8,
}

impl FlopExhaustiveEvaluator {
    // `&Vec<HandRange>` rather than `&[HandRange]`: this is the published signature of a
    // 0.x public API, and narrowing it is a deliberate breaking change, not a lint fix.
    #[allow(clippy::ptr_arg)]
    pub fn new(board: &[Option<Card>; 5], players: &Vec<HandRange>) -> Self {
        Self {
            board: *board,
            players: players.clone(),
            turn_from: 0,
            river_from: 1,
            turn_to: 48,
            river_to: 49,
        }
    }

    pub fn scope(&mut self, turn_from: u8, river_from: u8, turn_to: u8, river_to: u8) {
        debug_assert!(turn_from <= turn_to);
        debug_assert!(turn_from < river_from);
        debug_assert!(turn_to < river_to);

        self.turn_from = turn_from;
        self.river_from = river_from;
        self.turn_to = turn_to;
        self.river_to = river_to;
    }
}

impl IntoIterator for FlopExhaustiveEvaluator {
    type Item = Showdown;
    type IntoIter = FlopExhaustiveEvaluatorIterator;

    fn into_iter(self) -> Self::IntoIter {
        FlopExhaustiveEvaluatorIterator::new(&self)
    }
}

pub struct FlopExhaustiveEvaluatorIterator {
    turn_to: u8,
    river_to: u8,
    player_entries: Vec<Vec<(CardPair, f32)>>,
    current_deck: [Card; 49],
    current_board: [Option<Card>; 5],
    current_used_cards: HashSet<Card, FxBuildHasher>,
    current_turn_index: u8,
    current_river_index: u8,
    current_player_indexes: Vec<usize>,
}

impl FlopExhaustiveEvaluatorIterator {
    fn new(evaluator: &FlopExhaustiveEvaluator) -> Self {
        let mut player_entries = vec![vec![]; evaluator.players.len()];

        for (player_index, player) in evaluator.players.iter().enumerate() {
            for (card_pair, probability) in player.card_pairs() {
                player_entries[player_index].push((*card_pair, *probability));
            }
        }

        let mut current_deck = Vec::with_capacity(52);

        for rank in RankRange::all() {
            for suit in SuitRange::all() {
                let card = Card::new(rank, suit);

                if evaluator
                    .board
                    .iter()
                    .filter(|c| c.is_some())
                    .all(|c| (*c).unwrap() != card)
                {
                    current_deck.push(card);
                }
            }
        }

        Self {
            turn_to: evaluator.turn_to,
            river_to: evaluator.river_to,
            player_entries,
            current_deck: current_deck.try_into().unwrap(),
            current_board: evaluator.board,
            current_used_cards: HashSet::with_capacity_and_hasher(
                2 + evaluator.players.len() * 2,
                FxBuildHasher::default(),
            ),
            current_turn_index: evaluator.turn_from,
            current_river_index: evaluator.river_from,
            current_player_indexes: vec![0; evaluator.players.len()],
        }
    }
}

impl Iterator for FlopExhaustiveEvaluatorIterator {
    type Item = Showdown;

    fn next(&mut self) -> Option<Showdown> {
        loop {
            if self.current_turn_index >= self.turn_to && self.current_river_index >= self.river_to
            {
                return None;
            }

            let turn = self.current_deck[self.current_turn_index as usize];
            let river = self.current_deck[self.current_river_index as usize];

            self.current_board[3] = Some(turn);
            self.current_board[4] = Some(river);

            // every card of the completed board, the flop included: the flop is excluded
            // from the deck rather than from this set, so a player holding one of its
            // cards would otherwise reach `Showdown::new` unpruned.
            for card in self.current_board.iter().flatten() {
                self.current_used_cards.insert(*card);
            }

            let mut player_card_pairs = vec![];
            let mut probability: f32 = 1.0;

            // the first player dealt a card already on the completed board or in an
            // earlier player's hand, if there is one.
            let mut collided_at = None;

            for (player_index, player_entry) in self.player_entries.iter().enumerate() {
                let entry = player_entry[self.current_player_indexes[player_index]];

                if self.current_used_cards.contains(&entry.0[0])
                    || self.current_used_cards.contains(&entry.0[1])
                {
                    collided_at = Some(player_index);

                    break;
                }

                // a player's own cards block the players dealt after them, so a combination
                // dealing one physical card twice is never materialized.
                self.current_used_cards.insert(entry.0[0]);
                self.current_used_cards.insert(entry.0[1]);

                player_card_pairs.push(entry.0);
                probability *= entry.1;
            }

            let mut showdown = None;

            if collided_at.is_none() {
                showdown = Showdown::new(
                    player_card_pairs,
                    [
                        self.current_board[0].unwrap(),
                        self.current_board[1].unwrap(),
                        self.current_board[2].unwrap(),
                        self.current_board[3].unwrap(),
                        self.current_board[4].unwrap(),
                    ],
                    probability,
                );
            }

            // every combination that repeats the indexes up to the colliding player deals
            // that player the same blocked card, so the walk steps the odometer there
            // rather than at its rightmost player and skips the whole run at once.
            let odometer_len = match collided_at {
                Some(player_index) => player_index + 1,
                None => self.current_player_indexes.len(),
            };

            let mut player_index_to_increment = None;

            for ri in (0..odometer_len).rev() {
                if self.current_player_indexes[ri] + 1 < self.player_entries[ri].len() {
                    player_index_to_increment = Some(ri);

                    break;
                }
            }

            self.current_board[3] = None;
            self.current_board[4] = None;

            self.current_used_cards.clear();

            if let Some(player_index_to_increment) = player_index_to_increment {
                self.current_player_indexes[player_index_to_increment] += 1;

                for i in (player_index_to_increment + 1)..self.current_player_indexes.len() {
                    self.current_player_indexes[i] = 0;
                }
            } else if self.current_river_index < 48 {
                self.current_river_index += 1;
                self.current_player_indexes.fill(0);
            } else {
                self.current_turn_index += 1;
                self.current_river_index = self.current_turn_index + 1;
                self.current_player_indexes.fill(0);
            }

            // a rejected combination advances the cursor and is retried in place. Retrying
            // it by recursing here would make the stack depth the length of the run of
            // consecutive rejections, which a cross-player collision makes unbounded.
            if showdown.is_some() {
                return showdown;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod iterator {
        use super::*;
        use crate::card::{Rank, Suit};
        use insta::*;
        use std::str::FromStr;

        struct Walk {
            card_pairs: usize,
            visited: HashSet<CardPair>,
            expected: HashSet<CardPair>,
        }

        /// Walks one board completion and reports which of the first player's card pairs
        /// the iterator actually reached, against the ones a complete walk must reach —
        /// its range minus whatever the five board cards and the second player's holding
        /// block.
        ///
        /// The comparison is over the card pairs rather than over a showdown count on
        /// purpose. A cursor that stops early still yields plenty of showdowns, which is
        /// how a 276-card-pair range came to be walked only twenty entries deep — twelve
        /// of which reach a showdown on the board below — with nothing reporting it.
        fn walk(expression: &str) -> Walk {
            let range = HandRange::from_str(expression).unwrap();
            let board = [
                Some(Card::new(Rank::Queen, Suit::Spade)),
                Some(Card::new(Rank::Eight, Suit::Diamond)),
                Some(Card::new(Rank::Deuce, Suit::Heart)),
                None,
                None,
            ];
            let opponent = HandRange::from_str("7c6c").unwrap();
            let opponent_cards = *opponent
                .card_pairs()
                .keys()
                .next()
                .expect("the opponent holds one card pair");
            let players = vec![range.clone(), opponent];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            // A single turn and river, so one board fixes the expected set.
            evaluator.scope(0, 1, 0, 2);

            let mut visited = HashSet::new();
            let mut completed_board = None;

            for showdown in evaluator {
                completed_board = Some(*showdown.board());
                visited.insert(showdown.players()[0].hole_cards());
            }

            let completed_board = completed_board.expect("the walk yields at least one showdown");

            Walk {
                card_pairs: range.card_pairs().len(),
                visited,
                expected: range
                    .card_pairs()
                    .keys()
                    .filter(|card_pair| {
                        let is_dealt = |card| {
                            completed_board.contains(&card)
                                || opponent_cards[0] == card
                                || opponent_cards[1] == card
                        };

                        !is_dealt(card_pair[0]) && !is_dealt(card_pair[1])
                    })
                    .copied()
                    .collect(),
            }
        }

        #[test]
        fn it_walks_every_card_pair_of_a_range_wider_than_255() {
            let walk = walk("55+,A2s+,K7s+,Q9s+,J9s+,T9s,A8o+,KTo+,QJo");

            assert_eq!(walk.card_pairs, 276);
            assert_eq!(walk.expected.len(), 181);
            assert_eq!(walk.visited, walk.expected);
        }

        #[test]
        fn it_walks_every_card_pair_of_a_range_of_exactly_256() {
            let walk =
                walk("22+,A2s+,K2s+,Q2s+,J2s+,AhKd,AhQd,AhJd,AhTd,Ah9d,Ah8d,Ah7d,Ah6d,Ah5d,Ah4d");

            assert_eq!(walk.card_pairs, 256);
            assert_eq!(walk.expected.len(), 176);
            assert_eq!(walk.visited, walk.expected);
        }

        #[test]
        fn it_walks_every_card_pair_of_ranges_narrower_than_256() {
            for (expression, card_pairs, expected) in [
                ("JJ+", 24, 16),
                ("22+,A2s+,AJo+", 162, 95),
                ("22+,A2s+,K9s+,QTs+,JTs,ATo+,KQo", 214, 135),
            ] {
                let walk = walk(expression);

                assert_eq!(walk.card_pairs, card_pairs, "{expression}");
                assert_eq!(walk.expected.len(), expected, "{expression}");
                assert_eq!(walk.visited, walk.expected, "{expression}");
            }
        }

        #[test]
        fn it_never_yields_a_showdown_dealing_one_card_twice() {
            let board = [
                Some(Card::new(Rank::Queen, Suit::Spade)),
                Some(Card::new(Rank::Eight, Suit::Diamond)),
                Some(Card::new(Rank::Deuce, Suit::Heart)),
                None,
                None,
            ];
            // asymmetric on purpose: two players given the same range split the pot
            // evenly whether or not the impossible deals are yielded, so a symmetric
            // matchup reports the right equity while dealing one card to both of them.
            let players = vec![
                HandRange::from_str("AA").unwrap(),
                HandRange::from_str("A2s+").unwrap(),
            ];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            evaluator.scope(0, 1, 2, 25);

            let mut yielded = 0;

            for showdown in evaluator {
                let mut dealt: HashSet<Card> = showdown.board().iter().copied().collect();

                for player in showdown.players() {
                    dealt.insert(player.hole_cards()[0]);
                    dealt.insert(player.hole_cards()[1]);
                }

                assert_eq!(dealt.len(), 9, "{showdown:?}");

                yielded += 1;
            }

            // an exact count rather than a non-empty one: a prune that dropped a
            // combination it should have kept still yields plenty.
            assert_eq!(yielded, 3690);
        }

        /// A third player makes the runs of consecutive rejected combinations far longer
        /// than any two-player matchup produces — two players holding the same pair block
        /// each other on all but one deal, and the third player's whole range is walked
        /// inside each blocked one. A walk that retried a rejection by recursing into
        /// itself would recurse once per rejection and take the process down with it,
        /// which is why this matchup is walked here rather than trusted to the two-player
        /// tests above.
        #[test]
        fn it_walks_a_three_player_matchup_whose_rejections_come_in_long_runs() {
            let board = [
                Some(Card::new(Rank::Queen, Suit::Spade)),
                Some(Card::new(Rank::Eight, Suit::Diamond)),
                Some(Card::new(Rank::Deuce, Suit::Heart)),
                None,
                None,
            ];
            let players = vec![
                HandRange::from_str("AA").unwrap(),
                HandRange::from_str("AA").unwrap(),
                HandRange::from_str("22+").unwrap(),
            ];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            evaluator.scope(0, 1, 4, 6);

            let mut yielded = 0;

            for showdown in evaluator {
                let mut dealt: HashSet<Card> = showdown.board().iter().copied().collect();

                for player in showdown.players() {
                    dealt.insert(player.hole_cards()[0]);
                    dealt.insert(player.hole_cards()[1]);
                }

                assert_eq!(dealt.len(), 11, "{showdown:?}");

                yielded += 1;
            }

            assert_eq!(yielded, 348);
        }

        /// Every combination of these ranges deals one card twice, so the walk yields
        /// nothing at all — which is the correct answer, and a `scope` narrow enough
        /// produces it for ordinary ranges too. What is worth pinning is that the walk
        /// *returns* it: this is the shape that a retry-by-recursing iterator took the
        /// whole process down on, rather than reporting an empty walk.
        #[test]
        fn it_returns_none_where_no_combination_can_be_dealt() {
            let board = [
                Some(Card::new(Rank::Queen, Suit::Spade)),
                Some(Card::new(Rank::Eight, Suit::Diamond)),
                Some(Card::new(Rank::Deuce, Suit::Heart)),
                None,
                None,
            ];

            for seats in [3, 4] {
                let players = vec![HandRange::from_str("AA").unwrap(); seats];
                let mut iterator = FlopExhaustiveEvaluator::new(&board, &players).into_iter();

                assert!(iterator.next().is_none(), "{seats} players");
                assert_eq!(iterator.count(), 0, "{seats} players");
            }
        }

        #[test]
        fn it_iterates_scoped_from_0_1_to_2_25() {
            let board = [
                Some(Card::new(Rank::Deuce, Suit::Heart)),
                Some(Card::new(Rank::Deuce, Suit::Diamond)),
                Some(Card::new(Rank::Deuce, Suit::Club)),
                None,
                None,
            ];
            let players = vec![
                HandRange::from_str("4s3h:1").unwrap(),
                HandRange::from_str("4d3c:1").unwrap(),
            ];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            evaluator.scope(0, 1, 2, 25);

            let result: Vec<Showdown> = evaluator.into_iter().collect();

            assert_eq!(result.len(), (48 - 4) + (47 - 4) + 22);
            assert_debug_snapshot!(result);
        }

        #[test]
        fn it_iterates_scoped_from_10_43_to_14_18() {
            let board = [
                Some(Card::new(Rank::Jack, Suit::Heart)),
                Some(Card::new(Rank::Nine, Suit::Diamond)),
                Some(Card::new(Rank::Trey, Suit::Club)),
                None,
                None,
            ];
            let players = vec![
                HandRange::from_str("As4h:1").unwrap(),
                HandRange::from_str("Td8c:1").unwrap(),
            ];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            evaluator.scope(10, 43, 14, 18);

            let result: Vec<Showdown> = evaluator.into_iter().collect();

            assert_eq!(result.len(), 5 + (37 - 3) + (36 - 3) + (35 - 3) + 3);
            assert_debug_snapshot!(result);
        }

        #[test]
        fn it_iterates_scoped_from_32_48_to_47_49() {
            let board = [
                Some(Card::new(Rank::King, Suit::Heart)),
                Some(Card::new(Rank::King, Suit::Diamond)),
                Some(Card::new(Rank::King, Suit::Club)),
                None,
                None,
            ];
            let players = vec![
                HandRange::from_str("As2s:1").unwrap(),
                HandRange::from_str("JdJc:1").unwrap(),
            ];

            let mut evaluator = FlopExhaustiveEvaluator::new(&board, &players);
            evaluator.scope(32, 48, 47, 49);

            let result: Vec<Showdown> = evaluator.into_iter().collect();

            assert_eq!(
                result.len(),
                1 + (15 - 1)
                    + (14 - 1)
                    + (13 - 1)
                    + (12 - 1)
                    + (11 - 1)
                    + (10 - 1)
                    + (9 - 1)
                    + (8 - 1)
                    + (7 - 1)
                    + (6 - 1)
                    + (5 - 1)
                    + 3
                    + 2
                    + 1
            );
            assert_debug_snapshot!(result);
        }
    }
}
