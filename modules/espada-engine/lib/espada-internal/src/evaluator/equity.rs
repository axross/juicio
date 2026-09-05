// the board-major equity sweep. each board completion is walked once and every player's
// whole range is scored against it, which is what makes preflop reachable at all: the
// seven-card evaluation of one holding on one board serves every opponent holding on that
// same board, instead of being repeated once per matchup.

use super::made_hand::MadeHand;
use crate::card::{Card, Rank, RankRange, Suit, SuitRange};
use crate::hand_range::{CardPair, HandRange};
use std::cmp::Reverse;
use std::error::Error;
use std::fmt::{Debug, Display, Formatter};
use std::sync::Arc;

const DECK_LEN: usize = 52;
const PAIR_CODES: usize = DECK_LEN * DECK_LEN;
const MAX_PLAYERS: usize = 3;
const MAX_PLAYER_PAIRS: usize = 3;
const SUITS: [Suit; 4] = [Suit::Spade, Suit::Heart, Suit::Diamond, Suit::Club];
const IDENTITY: [u8; 4] = [0, 1, 2, 3];
// the suit group is `S_4`, so no stabilizer of it can hold more than 24 elements.
const MAX_GROUP: usize = 24;

// bit `rank * 4 + suit` of a 52-bit card set, so the cards of one suit form an evenly
// spaced plane and a suit permutation is four shifts over the whole set at once.
const SUIT_PLANE: u64 = 0x1_1111_1111_1111;

const GOLDEN_RATIO: f64 = 1.618_033_988_749_895;

/// an exhaustive board-major equity walk over two or three players' ranges.
///
/// the evaluator holds the configuration alone — the known board, the ranges, the suit
/// permutation group, and the class list — and hands out an [`EquityEvaluatorIterator`]
/// when it is iterated. iterate a shared reference, as in `for runout in &evaluator`, and
/// the evaluator survives the loop and can be walked again or partitioned further; iterate
/// it by value where an owned part is handed straight to a thread. each step of the walk
/// yields one [`Runout`], a complete five-card board carrying every player's live holdings
/// with the opponent-combination weights that holding wins, ties, shares, and is
/// consistent with.
///
/// the walk yields one runout per **board** — 2,598,960 of them preflop — and a caller
/// sums the rows as they come. suit isomorphism is spent underneath that on evaluation
/// alone: where a permutation of the suits leaves both the known board and every range
/// unchanged, one board of each orbit is scored and the orbit's remaining boards are
/// emitted from it with every holding relabelled by the same permutation. nothing about
/// it reaches this type's surface.
///
/// boards are visited in a golden-ratio order rather than in board order, so any prefix
/// of the walk is spread over the whole board space instead of being biased toward one
/// corner of it.
pub struct EquityEvaluator {
    shared: Arc<Shared>,
    begin: u32,
    end: u32,
}

impl EquityEvaluator {
    /// builds a walk over the completions of a board of 3, 4, or 5 known cards.
    pub fn postflop(
        board: &[Card],
        players: &[HandRange],
    ) -> Result<EquityEvaluator, EquityEvaluatorError> {
        validate_board(board)?;

        EquityEvaluator::build(board, players, true)
    }

    /// builds a walk over every five-card board, with no known board cards.
    pub fn preflop(players: &[HandRange]) -> Result<EquityEvaluator, EquityEvaluatorError> {
        EquityEvaluator::build(&[], players, true)
    }

    /// cuts this walk into `divisor` contiguous parts and keeps the parts `from..to`.
    ///
    /// the parts of one walk are disjoint and their union is that walk, so a caller can
    /// hand each part to a thread without the evaluator taking on threading itself.
    ///
    /// `divisor` must be positive and `from <= to <= divisor`. a call outside that is a
    /// caller bug, and debug builds assert it. release builds have no assertion to fail,
    /// so the arithmetic clamps rather than running off the walk: a `divisor` of 0 is read
    /// as 1, `from` is capped at `divisor`, and `to` is pulled into `from..=divisor`. what
    /// comes back is a valid — frequently empty — part of this walk rather than an
    /// out-of-range one, so a caller who ignores the contract loses runouts quietly
    /// instead of reading past the end.
    pub fn partition(&self, divisor: u32, from: u32, to: u32) -> EquityEvaluator {
        debug_assert!(divisor > 0);
        debug_assert!(from <= to);
        debug_assert!(to <= divisor);

        let divisor = divisor.max(1) as u64;
        let from = (from as u64).min(divisor);
        let to = (to as u64).clamp(from, divisor);
        let span = (self.end - self.begin) as u64;
        let begin = self.begin as u64 + span * from / divisor;
        let end = self.begin as u64 + span * to / divisor;

        EquityEvaluator {
            shared: Arc::clone(&self.shared),
            begin: begin as u32,
            end: end as u32,
        }
    }

    /// the number of [`Runout`]s iterating this evaluator yields.
    pub fn len(&self) -> usize {
        (self.end - self.begin) as usize
    }

    /// whether the walk is empty, which only a partition of width zero is.
    pub fn is_empty(&self) -> bool {
        self.begin == self.end
    }

    #[cfg(test)]
    fn without_canonicalization(
        board: &[Card],
        players: &[HandRange],
    ) -> Result<EquityEvaluator, EquityEvaluatorError> {
        EquityEvaluator::build(board, players, false)
    }

    // board validation lives in `validate_board`, called by `postflop` before this runs;
    // `preflop` reaches this with an always-empty board, which no scan for a duplicate
    // could ever flag.
    fn build(
        board: &[Card],
        players: &[HandRange],
        canonicalize: bool,
    ) -> Result<EquityEvaluator, EquityEvaluatorError> {
        if !(2..=MAX_PLAYERS).contains(&players.len()) {
            return Err(EquityEvaluatorError::UnsupportedPlayerCount(players.len()));
        }

        let cards = all_cards();
        let board_mask = mask_of(board);
        let mut entries = Vec::with_capacity(players.len());

        for (player_index, range) in players.iter().enumerate() {
            if let Some(pair) = unusable_weight(range) {
                return Err(EquityEvaluatorError::InvalidRangeWeight(player_index, pair));
            }

            let mut live: Vec<(u8, u8, f64)> = range
                .card_pairs()
                .iter()
                .map(|(pair, weight)| {
                    let left = card_index(&pair[0]) as u8;
                    let right = card_index(&pair[1]) as u8;

                    (left.min(right), left.max(right), *weight as f64)
                })
                .filter(|(a, b, _)| board_mask & (bit(*a) | bit(*b)) == 0)
                .collect();

            if live.is_empty() {
                return Err(EquityEvaluatorError::NoLiveHolding(player_index));
            }

            // the map behind `card_pairs` has no order of its own, and the emitted rows
            // are documented to follow the holding order, so fix one here.
            live.sort_unstable_by_key(|(a, b, _)| (*a, *b));

            entries.push(live);
        }

        let group = if canonicalize {
            stabilizer(board_mask, players)
        } else {
            vec![IDENTITY]
        };
        let relabel = relabellings(&cards, &group);
        let orders = holding_orders(&entries, &relabel);

        let deck: Vec<u8> = (0..DECK_LEN as u8)
            .filter(|c| board_mask & bit(*c) == 0)
            .collect();
        let take = 5 - board.len();
        let boards = binomial(deck.len(), take) as u32;
        let classes = if group.len() > 1 && take > 0 {
            Classes::Orbits(orbits(board_mask, &deck, take, &group))
        } else {
            Classes::Whole { deck, take }
        };
        let class_len = match &classes {
            Classes::Whole { .. } => boards,
            Classes::Orbits(list) => list.len() as u32,
        };
        let weyl = weyl_multiplier(class_len);
        let offsets = match &classes {
            Classes::Whole { .. } => vec![],
            Classes::Orbits(list) => walk_offsets(list, &group, class_len, weyl),
        };

        debug_assert!(offsets.is_empty() || offsets[class_len as usize] == boards);

        Ok(EquityEvaluator {
            shared: Arc::new(Shared {
                cards,
                known_board: board.to_vec(),
                known_board_mask: board_mask,
                players: players.len(),
                entries,
                classes,
                class_len,
                weyl,
                group,
                relabel,
                orders,
                offsets,
            }),
            begin: 0,
            end: boards,
        })
    }
}

impl Debug for EquityEvaluator {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        f.debug_struct("EquityEvaluator")
            .field("board", &self.shared.known_board)
            .field("players", &self.shared.players)
            .field("runouts", &self.len())
            .finish()
    }
}

impl IntoIterator for &EquityEvaluator {
    type Item = Runout;
    type IntoIter = EquityEvaluatorIterator;

    fn into_iter(self) -> EquityEvaluatorIterator {
        let (step, within) = self.shared.locate(self.begin);

        EquityEvaluatorIterator {
            shared: Arc::clone(&self.shared),
            cursor: self.begin,
            end: self.end,
            step,
            within,
            board: [self.shared.cards[0]; 5],
            board_mask: 0,
            cosets: Vec::with_capacity(MAX_GROUP),
            scored: false,
            scratch: Box::new(Scratch::new(self.shared.players)),
        }
    }
}

impl IntoIterator for EquityEvaluator {
    type Item = Runout;
    type IntoIter = EquityEvaluatorIterator;

    fn into_iter(self) -> EquityEvaluatorIterator {
        (&self).into_iter()
    }
}

/// the walk an [`EquityEvaluator`] hands out: one [`Runout`] per board, in the
/// golden-ratio order the evaluator documents.
///
/// it carries the walk position and the per-board scratch buffers, which is why it is a
/// separate type from the configuration it was built from. the evaluator is deliberately
/// not an [`Iterator`] itself: [`Iterator`] supplies a `partition` of its own that would
/// win method resolution over [`EquityEvaluator::partition`].
pub struct EquityEvaluatorIterator {
    shared: Arc<Shared>,
    cursor: u32,
    end: u32,
    // the walk position, split in two: which board class the sweep last scored, and how
    // far through that class's orbit the emission has got. a partition may begin part-way
    // through an orbit, so `within` is not always zero on the first step.
    step: u32,
    within: u32,
    board: [Card; 5],
    board_mask: u64,
    cosets: Vec<u8>,
    scored: bool,
    scratch: Box<Scratch>,
}

impl Iterator for EquityEvaluatorIterator {
    type Item = Runout;

    fn next(&mut self) -> Option<Runout> {
        if self.cursor >= self.end {
            return None;
        }

        if !self.scored {
            let class =
                (self.step as u64 * self.shared.weyl as u64 % self.shared.class_len as u64) as u32;

            self.board = self.shared.board_of(class);
            self.board_mask = mask_of(&self.board);
            self.shared.cosets(self.board_mask, &mut self.cosets);
            self.scratch.evaluate(&self.shared, &self.board);
            self.scored = true;
        }

        // one seven-card sweep per orbit, one runout per board: the orbit is spent on the
        // evaluation and not on the emission, so each of its boards is emitted in full
        // with every holding relabelled by the permutation that reaches it.
        let element = self.cosets[self.within as usize] as usize;
        let runout = Runout {
            board: self.shared.relabelled_board(&self.board, element),
            players: self.scratch.emit(&self.shared, self.board_mask, element),
        };

        self.cursor += 1;
        self.within += 1;

        if self.within as usize >= self.cosets.len() {
            self.within = 0;
            self.step += 1;
            self.scored = false;
        }

        Some(runout)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = (self.end - self.cursor) as usize;

        (remaining, Some(remaining))
    }
}

impl ExactSizeIterator for EquityEvaluatorIterator {}

impl Debug for EquityEvaluatorIterator {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        f.debug_struct("EquityEvaluatorIterator")
            .field("board", &self.shared.known_board)
            .field("players", &self.shared.players)
            .field("remaining", &self.len())
            .finish()
    }
}

/// one complete five-card board, with every player's live holdings scored against it.
#[derive(Debug, Clone)]
pub struct Runout {
    board: [Card; 5],
    players: Vec<RunoutPlayer>,
}

impl Runout {
    /// the five board cards. the known board cards come first, in the order they were
    /// given to the constructor.
    pub fn board(&self) -> &[Card; 5] {
        &self.board
    }

    /// one row per player per holding in that player's range that survives this board's
    /// card removal, ordered by player and then by holding.
    ///
    /// a holding sharing a card with the board is not a row at all, so the count varies
    /// from board to board, and it can reach zero: a completion that removes every
    /// holding of every player yields a [`Runout`] with no rows. two one-holding ranges
    /// `AsKs` and `AhKh` on `Qc8d2c` do it on 4 of that board's 1,176 completions — the
    /// ones dealing a spade ace or king alongside a heart ace or king. check the slice
    /// before indexing it.
    ///
    /// a holding the board *does* leave live is always a row, even where card removal
    /// leaves no opponent combination to play it against: that one carries
    /// `total() == 0.0` rather than being dropped.
    pub fn players(&self) -> &[RunoutPlayer] {
        &self.players
    }
}

/// one player's holding on a [`Runout`], with the opponent-combination weights it wins,
/// ties, shares, and is consistent with.
///
/// [`win`](Self::win), [`tie`](Self::tie), [`share`](Self::share), and
/// [`total`](Self::total) count *opponent* combinations and never carry this holding's own
/// range weight, so `share() / total()` is the holding's equity on this runout however the
/// range weights it. the holding's own weight is [`weight`](Self::weight), and it belongs
/// in an aggregate over the walk rather than in that ratio: a player's aggregate equity is
/// `sum(weight * share) / sum(weight * total)` over every runout. folding
/// `weight` into the per-holding ratio instead scales an equity by how often the range
/// plays the holding, which is not an equity at all.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RunoutPlayer {
    player_index: usize,
    hole_cards: CardPair,
    hand: MadeHand,
    weight: f64,
    win: f64,
    tie: f64,
    share: f64,
    total: f64,
}

impl RunoutPlayer {
    /// the index of the player this row belongs to, in constructor order.
    pub fn player_index(&self) -> usize {
        self.player_index
    }

    /// the two hole cards this row scores.
    pub fn hole_cards(&self) -> CardPair {
        self.hole_cards
    }

    /// the best five-card hand these hole cards make with this runout's board.
    pub fn hand(&self) -> MadeHand {
        self.hand
    }

    /// this holding's own weight in this player's [`HandRange`].
    ///
    /// it is a factor of the player's aggregate equity over the walk and no part of this
    /// row's own equity — see the type's documentation.
    pub fn weight(&self) -> f64 {
        self.weight
    }

    /// the opponent-combination weight this holding beats outright.
    pub fn win(&self) -> f64 {
        self.win
    }

    /// the opponent-combination weight this holding splits the pot with, at any
    /// multiplicity. a two-way split and a three-way split of twice the weight are
    /// different values of `tie` for the same `share`, which is why it is carried rather
    /// than left to be recovered from `share - win`.
    pub fn tie(&self) -> f64 {
        self.tie
    }

    /// the pot-share numerator: [`win`](Self::win) plus each split's fractional part, so a
    /// three-way split contributes one third of its weight.
    pub fn share(&self) -> f64 {
        self.share
    }

    /// the weight of every opponent combination consistent with this holding once the
    /// board's and this holding's own cards are removed.
    pub fn total(&self) -> f64 {
        self.total
    }
}

/// why an [`EquityEvaluator`] could not be built.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EquityEvaluatorError {
    /// a postflop board that does not hold 3, 4, or 5 cards.
    InvalidBoardSize(usize),
    /// the same card given twice on the board.
    DuplicateBoardCard(Card),
    /// a player count outside the two- and three-player algebra this evaluator implements.
    UnsupportedPlayerCount(usize),
    /// a player whose range holds nothing that survives the known board's card removal.
    NoLiveHolding(usize),
    /// a player whose range gives a holding a weight that is not a finite, non-negative
    /// number, carried with that player's index. the range parser cannot produce such a
    /// weight; a range collected from `(CardPair, f32)` pairs can.
    InvalidRangeWeight(usize, CardPair),
    /// a fixed two-card holding that is not usable as given: it names the same card twice,
    /// or a card the board already holds. `EquityEvaluator` has no notion of a single fixed
    /// holding outside a range — this is reported only by `pairwise_lead`.
    InvalidHolding(CardPair),
    /// a combo `pairwise_lead`'s one opponent weights with a number that is not finite and
    /// non-negative — the single-opponent analogue of `InvalidRangeWeight`, kept as its own
    /// variant because that one's message names an indexed player roster `pairwise_lead`
    /// doesn't have.
    InvalidOpponentWeight(CardPair),
}

impl Display for EquityEvaluatorError {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        match self {
            EquityEvaluatorError::InvalidBoardSize(len) => {
                write!(f, "a postflop board holds 3, 4, or 5 cards, not {len}.")
            }
            EquityEvaluatorError::DuplicateBoardCard(card) => {
                write!(f, "{card} appears twice on the board.")
            }
            EquityEvaluatorError::UnsupportedPlayerCount(len) => {
                write!(f, "this evaluator covers 2 or 3 players, not {len}.")
            }
            EquityEvaluatorError::NoLiveHolding(index) => write!(
                f,
                "player {index}'s range has no holding left once the board's cards are removed."
            ),
            EquityEvaluatorError::InvalidRangeWeight(index, pair) => write!(
                f,
                "player {index}'s range weights {pair} with a number that is not finite and non-negative."
            ),
            EquityEvaluatorError::InvalidHolding(pair) => write!(
                f,
                "{pair} is not a usable holding: it repeats a card, or repeats one already on the board."
            ),
            EquityEvaluatorError::InvalidOpponentWeight(pair) => write!(
                f,
                "the opponent's range weights {pair} with a number that is not finite and non-negative."
            ),
        }
    }
}

impl Error for EquityEvaluatorError {}

struct Shared {
    cards: [Card; DECK_LEN],
    known_board: Vec<Card>,
    known_board_mask: u64,
    players: usize,
    entries: Vec<Vec<(u8, u8, f64)>>,
    classes: Classes,
    class_len: u32,
    weyl: u32,
    // the common stabilizer, the identity first. `relabel[element]` sends a card index to
    // its image under `group[element]`, and `orders[element][player]` lists that player's
    // holdings in the order their images sort in — which is what lets a relabelled board
    // emit its rows in holding order without sorting anything per board.
    group: Vec<[u8; 4]>,
    relabel: Vec<[u8; DECK_LEN]>,
    orders: Vec<Vec<Vec<u32>>>,
    // running board count over the walk's class steps, so a walk index can be split back
    // into the class that carries it and the position within that class's orbit. empty
    // when nothing is collapsed and the two index spaces coincide.
    offsets: Vec<u32>,
}

impl Shared {
    fn board_of(&self, class: u32) -> [Card; 5] {
        let mut board = [self.cards[0]; 5];
        let known = self.known_board.len();

        board[..known].copy_from_slice(&self.known_board);

        match &self.classes {
            Classes::Whole { deck, take } => {
                let mut combination = [0usize; 5];

                unrank(class as u64, *take, &mut combination[..*take]);

                for (slot, position) in combination[..*take].iter().enumerate() {
                    board[known + slot] = self.cards[deck[*position] as usize];
                }
            }
            Classes::Orbits(list) => {
                let mut rest = list[class as usize] & !self.known_board_mask;
                let mut slot = known;

                while rest != 0 {
                    board[slot] = self.cards[rest.trailing_zeros() as usize];
                    slot += 1;
                    rest &= rest - 1;
                }
            }
        }

        board
    }

    fn cosets(&self, mask: u64, out: &mut Vec<u8>) {
        cosets_of(&self.group, mask, out);
    }

    /// where a walk index sits: the class step that carries it, and its position in that
    /// step's orbit.
    fn locate(&self, index: u32) -> (u32, u32) {
        match &self.classes {
            Classes::Whole { .. } => (index, 0),
            Classes::Orbits(_) => {
                let step = self.offsets.partition_point(|start| *start <= index) - 1;

                (step as u32, index - self.offsets[step])
            }
        }
    }

    /// the board `group[element]` sends this class's representative to.
    ///
    /// the known cards are left exactly as the constructor was given them: the group
    /// stabilizes their set, so relabelling permutes them among themselves and the board
    /// is the same five cards either way.
    fn relabelled_board(&self, representative: &[Card; 5], element: usize) -> [Card; 5] {
        let mut board = *representative;

        if element != 0 {
            let map = &self.relabel[element];
            let known = self.known_board.len();

            for card in board[known..].iter_mut() {
                *card = self.cards[map[card_index(card)] as usize];
            }

            board[known..].sort_unstable();
        }

        board
    }
}

enum Classes {
    Whole { deck: Vec<u8>, take: usize },
    Orbits(Vec<u64>),
}

#[derive(Clone, Copy)]
struct Holding {
    a: u8,
    b: u8,
    hand: MadeHand,
    present: u8,
    weights: [f64; MAX_PLAYERS],
}

#[derive(Clone, Copy, Default)]
struct Outcome {
    win: f64,
    tie: f64,
    share: f64,
    total: f64,
}

impl Outcome {
    /// the four weights from the split weight the hero shares two ways (`halves`) and
    /// three ways (`thirds`), each floored against cancellation at `CANCELLATION * scale`.
    ///
    /// they are one tuple rather than four numbers — `share` is built out of `win` and the
    /// split terms, and `total` bounds their sum — so each is derived from the *clamped*
    /// parts instead of being clamped on its own. clamping independently is what lets a
    /// cancellation leave them inconsistent: it would zero a barely-negative `tie` while
    /// `share` still carried that same negative contribution.
    ///
    /// the clamp is a floor against inclusion–exclusion cancellation. it is not a way of
    /// living with a sign error, and `nonnegative` asserts as much in a debug build so a
    /// term that is actually missing fails loudly instead of being rounded back into
    /// range — which is why `scale` has to be passed in rather than fixed here. every one
    /// of these weights scales with the product of the opponents' range widths and their
    /// range weights, so an absolute floor wide enough for a full-width preflop range is
    /// wide enough to swallow a whole dropped term on a narrow or lightly weighted one.
    /// `scale` is the caller's bound on the magnitudes that cancelled.
    fn new(win: f64, halves: f64, thirds: f64, total: f64, scale: f64) -> Outcome {
        let floor = -CANCELLATION * scale.abs();
        let win = nonnegative(win, floor);
        let halves = nonnegative(halves, floor);
        let thirds = nonnegative(thirds, floor);
        let tie = halves + thirds;

        // `total` is the same kind of quantity as the other three and bounds their sum,
        // so it is floored on the same scale. without this the `max` below would absorb a
        // dropped term in `total` silently, however loudly the other three fail.
        let total = nonnegative(total, floor);

        debug_assert!(
            total >= win + tie + floor,
            "total {total} is below win {win} plus tie {tie} by more than cancellation explains",
        );

        Outcome {
            win,
            tie,
            share: win + 0.5 * halves + thirds / 3.0,
            total: total.max(win + tie),
        }
    }
}

// the cancellation residue as a *fraction* of the magnitudes that cancelled, rather than
// an absolute weight. inclusion–exclusion sums at most a few thousand terms, so its
// relative residue is a few thousand times the f64 epsilon — around 1e-12 — and this
// leaves three orders of magnitude of headroom above that while still catching a term
// dropped whole, which is a residue of order 1 on the same scale.
const CANCELLATION: f64 = 1e-9;

fn nonnegative(weight: f64, floor: f64) -> f64 {
    debug_assert!(
        weight >= floor,
        "{weight} is below the cancellation floor {floor}",
    );

    weight.max(0.0)
}

// the accumulators the weakest-first sweep maintains over one index class: per player the
// total weight and the weight incident to each card, and per player pair the weight of the
// holdings both hold, likewise split by incident card. together they answer "how much
// opponent weight is disjoint from this hero holding" in constant time per player pair
// plus one pass over the 52 cards.
#[derive(Clone)]
struct Accum {
    weight: [f64; MAX_PLAYERS],
    incident: [[f64; DECK_LEN]; MAX_PLAYERS],
    shared_weight: [f64; MAX_PLAYER_PAIRS],
    shared_incident: [[f64; DECK_LEN]; MAX_PLAYER_PAIRS],
}

impl Accum {
    fn new() -> Accum {
        Accum {
            weight: [0.0; MAX_PLAYERS],
            incident: [[0.0; DECK_LEN]; MAX_PLAYERS],
            shared_weight: [0.0; MAX_PLAYER_PAIRS],
            shared_incident: [[0.0; DECK_LEN]; MAX_PLAYER_PAIRS],
        }
    }

    fn reset(&mut self) {
        self.weight = [0.0; MAX_PLAYERS];
        self.shared_weight = [0.0; MAX_PLAYER_PAIRS];

        for row in self.incident.iter_mut() {
            row.fill(0.0);
        }

        for row in self.shared_incident.iter_mut() {
            row.fill(0.0);
        }
    }

    fn add(&mut self, holding: &Holding, players: usize) {
        let (a, b) = (holding.a as usize, holding.b as usize);

        for player in 0..players {
            let weight = holding.weights[player];

            self.weight[player] += weight;
            self.incident[player][a] += weight;
            self.incident[player][b] += weight;
        }

        if players == 3 {
            for (left, right, slot) in PLAYER_PAIRS {
                let product = holding.weights[left] * holding.weights[right];

                self.shared_weight[slot] += product;
                self.shared_incident[slot][a] += product;
                self.shared_incident[slot][b] += product;
            }
        }
    }

    // the current level is a handful of holdings, so it is zeroed slot by slot rather than
    // by clearing arrays a level's worth of times per board.
    fn clear_slots(&mut self, holding: &Holding, players: usize) {
        let (a, b) = (holding.a as usize, holding.b as usize);

        for player in 0..players {
            self.incident[player][a] = 0.0;
            self.incident[player][b] = 0.0;
        }

        if players == 3 {
            for (_, _, slot) in PLAYER_PAIRS {
                self.shared_incident[slot][a] = 0.0;
                self.shared_incident[slot][b] = 0.0;
            }
        }
    }
}

const PLAYER_PAIRS: [(usize, usize, usize); MAX_PLAYER_PAIRS] = [(0, 1, 0), (0, 2, 1), (1, 2, 2)];

fn player_pair_slot(left: usize, right: usize) -> usize {
    match (left.min(right), left.max(right)) {
        (0, 1) => 0,
        (0, 2) => 1,
        _ => 2,
    }
}

struct Scratch {
    players: usize,
    generation: u32,
    slot: Vec<u32>,
    slot_generation: Vec<u32>,
    union: Vec<Holding>,
    order: Vec<u32>,
    incidence: Vec<Vec<u32>>,
    weaker: Accum,
    level: Accum,
    everything: Accum,
    vectors: [[f64; DECK_LEN]; 6],
    outcomes: Vec<[Outcome; MAX_PLAYERS]>,
}

impl Scratch {
    fn new(players: usize) -> Scratch {
        Scratch {
            players,
            generation: 0,
            slot: vec![0; PAIR_CODES],
            slot_generation: vec![0; PAIR_CODES],
            union: Vec::new(),
            order: Vec::new(),
            incidence: vec![Vec::new(); DECK_LEN],
            weaker: Accum::new(),
            level: Accum::new(),
            everything: Accum::new(),
            vectors: [[0.0; DECK_LEN]; 6],
            outcomes: Vec::new(),
        }
    }

    /// scores every live holding on one board, leaving the result in the scratch buffers
    /// for [`Scratch::emit`] to read once per board in that board's orbit.
    fn evaluate(&mut self, shared: &Shared, board: &[Card; 5]) {
        let board_mask = mask_of(board);

        self.collect(shared, board, board_mask);
        self.accumulate();
        self.resolve();
    }

    // one seven-card evaluation per distinct live holding, shared by every player holding
    // it. that sharing is why the all-players cost is below the player count.
    fn collect(&mut self, shared: &Shared, board: &[Card; 5], board_mask: u64) {
        self.generation += 1;
        self.union.clear();
        self.order.clear();

        for player in 0..shared.players {
            for (a, b, weight) in &shared.entries[player] {
                if board_mask & (bit(*a) | bit(*b)) != 0 {
                    continue;
                }

                let code = pair_code(*a, *b);
                let index = if self.slot_generation[code] == self.generation {
                    self.slot[code] as usize
                } else {
                    let hand: MadeHand = [
                        shared.cards[*a as usize],
                        shared.cards[*b as usize],
                        board[0],
                        board[1],
                        board[2],
                        board[3],
                        board[4],
                    ]
                    .into();

                    self.union.push(Holding {
                        a: *a,
                        b: *b,
                        hand,
                        present: 0,
                        weights: [0.0; MAX_PLAYERS],
                    });
                    self.slot[code] = (self.union.len() - 1) as u32;
                    self.slot_generation[code] = self.generation;

                    self.union.len() - 1
                };

                self.union[index].present |= 1 << player;
                self.union[index].weights[player] = *weight;
            }
        }

        let union = &self.union;

        self.order.extend(0..union.len() as u32);
        self.order
            .sort_unstable_by_key(|index| Reverse(union[*index as usize].hand.power_index()));
    }

    fn accumulate(&mut self) {
        for list in self.incidence.iter_mut() {
            list.clear();
        }

        self.weaker.reset();
        self.level.reset();
        self.everything.reset();

        for (index, holding) in self.union.iter().enumerate() {
            self.incidence[holding.a as usize].push(index as u32);
            self.incidence[holding.b as usize].push(index as u32);
            self.everything.add(holding, self.players);
        }

        self.outcomes.clear();
        self.outcomes
            .resize(self.union.len(), [Outcome::default(); MAX_PLAYERS]);
    }

    fn resolve(&mut self) {
        let mut start = 0;

        while start < self.order.len() {
            let power = self.union[self.order[start] as usize].hand.power_index();
            let mut end = start;

            while end < self.order.len()
                && self.union[self.order[end] as usize].hand.power_index() == power
            {
                end += 1;
            }

            for position in start..end {
                let holding = self.union[self.order[position] as usize];

                self.level.add(&holding, self.players);
            }

            for position in start..end {
                let index = self.order[position] as usize;

                if self.players == 2 {
                    self.resolve_heads_up(index);
                } else {
                    self.resolve_three_way(index, power);
                }
            }

            for position in start..end {
                let holding = self.union[self.order[position] as usize];

                self.weaker.add(&holding, self.players);
                self.level.clear_slots(&holding, self.players);
            }

            self.level.weight = [0.0; MAX_PLAYERS];
            self.level.shared_weight = [0.0; MAX_PLAYER_PAIRS];

            start = end;
        }
    }

    fn resolve_heads_up(&mut self, index: usize) {
        let holding = self.union[index];
        let (x, y) = (holding.a as usize, holding.b as usize);

        for hero in 0..2 {
            if holding.present & (1 << hero) == 0 {
                continue;
            }

            let opponent = 1 - hero;
            let own = holding.weights[opponent];
            let win = disjoint_weight(&self.weaker, opponent, x, y, 0.0);
            let tie = disjoint_weight(&self.level, opponent, x, y, own);
            let total = disjoint_weight(&self.everything, opponent, x, y, own);

            // every term above is a signed sum of quantities bounded by the opponent's
            // whole weight on this board, so that is what the cancellation floor scales
            // against.
            let scale = self.everything.weight[opponent];

            // one opponent, so every split is two ways.
            self.outcomes[index][hero] = Outcome::new(win, tie, 0.0, total, scale);
        }
    }

    fn resolve_three_way(&mut self, index: usize, power: u16) {
        let Scratch {
            union,
            incidence,
            weaker,
            level,
            everything,
            vectors,
            outcomes,
            ..
        } = self;
        let holding = union[index];
        let (x, y) = (holding.a as usize, holding.b as usize);

        for (hero, outcome) in outcomes[index].iter_mut().enumerate() {
            if holding.present & (1 << hero) == 0 {
                continue;
            }

            let mut opponents = [0usize; 2];
            let mut seen = 0;

            for player in 0..3 {
                if player != hero {
                    opponents[seen] = player;
                    seen += 1;
                }
            }

            let (left, right) = (opponents[0], opponents[1]);
            let slot = player_pair_slot(left, right);
            let (first, second) = vectors.split_at_mut(3);
            let tiers = Tiers {
                weaker,
                level,
                everything,
            };
            let holdings = Holdings { union, incidence };
            let hero_row = Hero {
                cards: [x, y],
                power,
            };

            opponent_vectors(first, tiers, holdings, left, hero_row);
            opponent_vectors(second, tiers, holdings, right, hero_row);

            let own_left = holding.weights[left];
            let own_right = holding.weights[right];

            let weaker_left = disjoint_weight(weaker, left, x, y, 0.0);
            let weaker_right = disjoint_weight(weaker, right, x, y, 0.0);
            let level_left = disjoint_weight(level, left, x, y, own_left);
            let level_right = disjoint_weight(level, right, x, y, own_right);
            let all_left = disjoint_weight(everything, left, x, y, own_left);
            let all_right = disjoint_weight(everything, right, x, y, own_right);

            let shared_weaker = weaker.shared_weight[slot]
                - weaker.shared_incident[slot][x]
                - weaker.shared_incident[slot][y];
            let shared_level = level.shared_weight[slot]
                - level.shared_incident[slot][x]
                - level.shared_incident[slot][y]
                + own_left * own_right;
            let shared_all = everything.shared_weight[slot]
                - everything.shared_incident[slot][x]
                - everything.shared_incident[slot][y]
                + own_left * own_right;

            // pairs sharing exactly one card are subtracted once by the dot product; the
            // pairs that are the same holding twice are subtracted twice, so they come
            // back once.
            let both_weaker =
                weaker_left * weaker_right - dot(&first[0], &second[0]) + shared_weaker;
            let both_level = level_left * level_right - dot(&first[1], &second[1]) + shared_level;
            // an equal-index class and a strictly-weaker one are disjoint, so no holding
            // can sit in both and there is nothing to add back on the mixed terms.
            let level_then_weaker = level_left * weaker_right - dot(&first[1], &second[0]);
            let weaker_then_level = weaker_left * level_right - dot(&first[0], &second[1]);
            let both_all = all_left * all_right - dot(&first[2], &second[2]) + shared_all;

            // each term above is a signed sum of products of one weight from each
            // opponent, so the product of their whole weights on this board bounds the
            // magnitudes that cancelled.
            let scale = everything.weight[left] * everything.weight[right];

            // the hero splits with exactly one opponent on the mixed terms and with both
            // on `both_level`, which is the whole of the difference between a two-way and
            // a three-way split.
            *outcome = Outcome::new(
                both_weaker,
                level_then_weaker + weaker_then_level,
                both_level,
                both_all,
                scale,
            );
        }
    }

    /// the rows of the board `group[element]` sends the scored board to.
    ///
    /// nothing is re-evaluated. a global suit permutation preserves both a hand's rank
    /// pattern and its flush-ness, so the relabelled holding makes the same hand on the
    /// relabelled board; and the group stabilizes every range, so the relabelled holding
    /// carries the same weight. only the hole cards move.
    fn emit(&self, shared: &Shared, board_mask: u64, element: usize) -> Vec<RunoutPlayer> {
        let mut rows = Vec::with_capacity(self.union.len() * shared.players);
        let map = &shared.relabel[element];

        for player in 0..shared.players {
            let entries = &shared.entries[player];

            // the identity emits the scored board itself, whose holdings are already in
            // holding order; the other cosets walk the order their images sort in.
            if element == 0 {
                for (a, b, weight) in entries {
                    if board_mask & (bit(*a) | bit(*b)) != 0 {
                        continue;
                    }

                    rows.push(self.row(shared, map, player, *a, *b, *weight));
                }
            } else {
                for position in &shared.orders[element][player] {
                    let (a, b, weight) = entries[*position as usize];

                    if board_mask & (bit(a) | bit(b)) != 0 {
                        continue;
                    }

                    rows.push(self.row(shared, map, player, a, b, weight));
                }
            }
        }

        rows
    }

    fn row(
        &self,
        shared: &Shared,
        map: &[u8; DECK_LEN],
        player: usize,
        a: u8,
        b: u8,
        weight: f64,
    ) -> RunoutPlayer {
        let index = self.slot[pair_code(a, b)] as usize;
        let outcome = self.outcomes[index][player];

        RunoutPlayer {
            player_index: player,
            hole_cards: CardPair::new(
                shared.cards[map[a as usize] as usize],
                shared.cards[map[b as usize] as usize],
            ),
            hand: self.union[index].hand,
            weight,
            win: outcome.win,
            tie: outcome.tie,
            share: outcome.share,
            total: outcome.total,
        }
    }
}

// inclusion-exclusion on the hero's two cards. a holding is exactly two cards, so the
// "contains both" term is the hero's own holding rather than a sum, which is what keeps the
// sweep linear in the range width.
//
// the result is raw. clamping it here would put a floor under each term separately, which
// both breaks the tuple `Outcome::new` assembles and hides a dropped term behind a value
// an assertion of `0.0` would still accept; `Outcome::new` clamps the tuple instead.
fn disjoint_weight(accum: &Accum, player: usize, x: usize, y: usize, own: f64) -> f64 {
    accum.weight[player] - accum.incident[player][x] - accum.incident[player][y] + own
}

// the three accumulators a resolve step reads together, in the order the per-card vectors
// below keep them: weight strictly weaker than the hero's hand, weight level with it, and
// the whole live weight.
#[derive(Clone, Copy)]
struct Tiers<'a> {
    weaker: &'a Accum,
    level: &'a Accum,
    everything: &'a Accum,
}

// the live holdings of one board, and the lists saying which of them hold a given card.
#[derive(Clone, Copy)]
struct Holdings<'a> {
    union: &'a [Holding],
    incidence: &'a [Vec<u32>],
}

// the hero row being resolved: its two cards, and the power index its hand made.
#[derive(Clone, Copy)]
struct Hero {
    cards: [usize; 2],
    power: u16,
}

// one opponent's weight per card, in the three tiers, with every holding that clashes with
// the hero's own two cards taken back out. the three rows are what the pairwise dot product
// in the three-player form subtracts.
fn opponent_vectors(
    destination: &mut [[f64; DECK_LEN]],
    tiers: Tiers,
    holdings: Holdings,
    opponent: usize,
    hero: Hero,
) {
    destination[0].copy_from_slice(&tiers.weaker.incident[opponent]);
    destination[1].copy_from_slice(&tiers.level.incident[opponent]);
    destination[2].copy_from_slice(&tiers.everything.incident[opponent]);

    for hero_card in hero.cards {
        for index in &holdings.incidence[hero_card] {
            let holding = &holdings.union[*index as usize];
            let weight = holding.weights[opponent];

            if weight == 0.0 {
                continue;
            }

            let other = if holding.a as usize == hero_card {
                holding.b as usize
            } else {
                holding.a as usize
            };
            let holding_power = holding.hand.power_index();

            destination[2][other] -= weight;

            if holding_power > hero.power {
                destination[0][other] -= weight;
            } else if holding_power == hero.power {
                destination[1][other] -= weight;
            }
        }
    }

    for row in destination.iter_mut() {
        row[hero.cards[0]] = 0.0;
        row[hero.cards[1]] = 0.0;
    }
}

fn dot(left: &[f64; DECK_LEN], right: &[f64; DECK_LEN]) -> f64 {
    let mut sum = 0.0;

    for card in 0..DECK_LEN {
        sum += left[card] * right[card];
    }

    sum
}

// index `rank * 4 + suit`, which is also the order `Card`'s own `Ord` puts them in, so a
// card index and its bit in a 52-bit card set are the same number.
fn all_cards() -> [Card; DECK_LEN] {
    let mut cards = [Card::new(Rank::Ace, Suit::Spade); DECK_LEN];
    let mut index = 0;

    for rank in RankRange::all() {
        for suit in SuitRange::all() {
            cards[index] = Card::new(rank, suit);
            index += 1;
        }
    }

    cards
}

fn card_index(card: &Card) -> usize {
    u8::from(card.rank()) as usize * 4 + u8::from(card.suit()) as usize
}

fn bit(card: u8) -> u64 {
    1 << card
}

fn pair_code(a: u8, b: u8) -> usize {
    a as usize * DECK_LEN + b as usize
}

fn mask_of(cards: &[Card]) -> u64 {
    cards
        .iter()
        .fold(0, |mask, card| mask | 1 << card_index(card))
}

fn permute_mask(mask: u64, permutation: &[u8; 4]) -> u64 {
    let mut permuted = 0;

    for (suit, image) in permutation.iter().enumerate() {
        permuted |= ((mask >> suit) & SUIT_PLANE) << image;
    }

    permuted
}

fn suit_permutations() -> Vec<[u8; 4]> {
    let mut permutations = vec![];

    for a in 0..4u8 {
        for b in 0..4u8 {
            for c in 0..4u8 {
                for d in 0..4u8 {
                    if a != b && a != c && a != d && b != c && b != d && c != d {
                        permutations.push([a, b, c, d]);
                    }
                }
            }
        }
    }

    permutations
}

// a postflop board must hold 3, 4, or 5 cards, none of them repeated. `postflop` runs this
// before calling `build`, so `build` itself no longer scans for a duplicate; `preflop`'s
// board is always empty, which needs neither check. `pairwise_lead` calls this directly
// too, so the two board-consuming entry points can never drift on what a valid board is.
pub(super) fn validate_board(board: &[Card]) -> Result<(), EquityEvaluatorError> {
    if !matches!(board.len(), 3..=5) {
        return Err(EquityEvaluatorError::InvalidBoardSize(board.len()));
    }

    for (position, card) in board.iter().enumerate() {
        if board[..position].contains(card) {
            return Err(EquityEvaluatorError::DuplicateBoardCard(*card));
        }
    }

    Ok(())
}

// the lowest-indexed holding a range weights with a number the sweep cannot use. the whole
// range is checked rather than the live holdings alone, because `stabilizer` reads every
// pair whether the board leaves it live or not. a `NaN` is the case that matters most: it
// compares unequal to itself, so an invariance predicate built on it is false even for the
// identity permutation, and it propagates through every accumulator it reaches.
//
// `pairwise_lead` reuses this rather than keeping its own copy, so the two range-consuming
// entry points can never diverge on which offender they report when a range has more than
// one.
pub(super) fn unusable_weight(range: &HandRange) -> Option<CardPair> {
    range
        .card_pairs()
        .iter()
        .filter(|(_, weight)| !weight.is_finite() || **weight < 0.0)
        .map(|(pair, _)| *pair)
        // the map behind `card_pairs` has no order of its own, so the reported holding is
        // pinned rather than left to depend on which offender iteration reached first.
        .min_by_key(|pair| (card_index(&pair[0]), card_index(&pair[1])))
}

// the group that acts is the *common* stabilizer of the known board and of every range.
// under one of its elements the whole game is relabelled at once, so a board's result
// carries over to the rest of its orbit with the holdings relabelled too — which is what
// the walk emits, rather than weighting a representative by its orbit size.
fn stabilizer(board_mask: u64, players: &[HandRange]) -> Vec<[u8; 4]> {
    // the identity belongs to the group by definition, so it is seeded rather than
    // filtered in. a predicate that can reject it makes the group empty and every step
    // downstream — which reads `group[0]` and expects at least one coset — unsound. it is
    // also the first coset representative of every orbit, so seeding it here is what makes
    // the board a class was scored on the first one the walk emits from it, rather than
    // relying on the order `suit_permutations` happens to generate.
    let mut group: Vec<[u8; 4]> = vec![IDENTITY];

    group.extend(
        suit_permutations()
            .into_iter()
            .filter(|permutation| *permutation != IDENTITY)
            .filter(|permutation| permute_mask(board_mask, permutation) == board_mask)
            .filter(|permutation| {
                players.iter().all(|range| {
                    let pairs = range.card_pairs();

                    pairs.iter().all(|(pair, weight)| {
                        let image = CardPair::new(
                            permute_card(&pair[0], permutation),
                            permute_card(&pair[1], permutation),
                        );

                        pairs.get(&image) == Some(weight)
                    })
                })
            }),
    );

    group
}

// the card-index image of every card under every group element, so relabelling a holding
// is two array lookups rather than a rank-and-suit round trip.
fn relabellings(cards: &[Card; DECK_LEN], group: &[[u8; 4]]) -> Vec<[u8; DECK_LEN]> {
    group
        .iter()
        .map(|permutation| {
            let mut map = [0u8; DECK_LEN];

            for (index, card) in cards.iter().enumerate() {
                map[index] = card_index(&permute_card(card, permutation)) as u8;
            }

            map
        })
        .collect()
}

// per group element and player, the holdings in the order their images sort in. a
// relabelled board emits its rows in holding order by walking this, instead of sorting a
// few hundred rows again on every one of the boards an orbit stands for.
fn holding_orders(
    entries: &[Vec<(u8, u8, f64)>],
    relabel: &[[u8; DECK_LEN]],
) -> Vec<Vec<Vec<u32>>> {
    relabel
        .iter()
        .enumerate()
        .map(|(element, map)| {
            entries
                .iter()
                .map(|player| {
                    // the identity never reads its own order — its holdings are already
                    // sorted — so it is left empty rather than built and never used.
                    if element == 0 {
                        return vec![];
                    }

                    let mut order: Vec<u32> = (0..player.len() as u32).collect();

                    order.sort_unstable_by_key(|position| {
                        let (a, b, _) = player[*position as usize];
                        let (a, b) = (map[a as usize], map[b as usize]);

                        (a.min(b), a.max(b))
                    });

                    order
                })
                .collect()
        })
        .collect()
}

// the group elements reaching each distinct board in one board's orbit: one representative
// of every coset of that board's own stabilizer, in group order.
fn cosets_of(group: &[[u8; 4]], mask: u64, out: &mut Vec<u8>) {
    debug_assert!(group.len() <= MAX_GROUP);

    let mut images = [0u64; MAX_GROUP];
    let mut seen = 0;

    out.clear();

    for (element, permutation) in group.iter().enumerate() {
        let image = permute_mask(mask, permutation);

        if images[..seen].contains(&image) {
            continue;
        }

        images[seen] = image;
        seen += 1;

        out.push(element as u8);
    }
}

// how many boards the walk has emitted before each class step, so a walk index can be cut
// back into a class and a position inside that class's orbit.
fn walk_offsets(list: &[u64], group: &[[u8; 4]], class_len: u32, weyl: u32) -> Vec<u32> {
    let mut offsets = Vec::with_capacity(class_len as usize + 1);
    let mut cosets = Vec::with_capacity(MAX_GROUP);
    let mut running = 0;

    for step in 0..class_len {
        let class = (step as u64 * weyl as u64 % class_len as u64) as u32;

        offsets.push(running);
        cosets_of(group, list[class as usize], &mut cosets);

        running += cosets.len() as u32;
    }

    offsets.push(running);

    offsets
}

fn permute_card(card: &Card, permutation: &[u8; 4]) -> Card {
    Card::new(
        *card.rank(),
        SUITS[permutation[u8::from(card.suit()) as usize] as usize],
    )
}

// one representative per suit-isomorphism orbit, found by keeping the boards that are
// already the least mask in their own orbit. testing that is cheaper than canonicalizing
// every board, because a board that is not least is usually shown so by the first
// permutation tried. the whole group is scanned, the identity included — which costs one
// comparison that can never fail and buys independence from the order the group is in.
fn orbits(board_mask: u64, deck: &[u8], take: usize, group: &[[u8; 4]]) -> Vec<u64> {
    let bits: Vec<u64> = deck.iter().map(|card| bit(*card)).collect();
    let mut list: Vec<u64> = vec![];
    let mut combination: Vec<usize> = (0..take).collect();

    loop {
        let mut mask = board_mask;

        for position in &combination {
            mask |= bits[*position];
        }

        if group
            .iter()
            .all(|permutation| permute_mask(mask, permutation) >= mask)
        {
            list.push(mask);
        }

        if !advance(&mut combination, deck.len()) {
            break;
        }
    }

    list
}

fn advance(combination: &mut [usize], len: usize) -> bool {
    let take = combination.len();
    let mut slot = take;

    while slot > 0 {
        slot -= 1;

        if combination[slot] + 1 < len - (take - 1 - slot) {
            combination[slot] += 1;

            for next in slot + 1..take {
                combination[next] = combination[next - 1] + 1;
            }

            return true;
        }
    }

    false
}

const BINOMIAL: [[u64; 6]; DECK_LEN + 1] = build_binomial();

const fn build_binomial() -> [[u64; 6]; DECK_LEN + 1] {
    let mut table = [[0u64; 6]; DECK_LEN + 1];
    let mut n = 0;

    while n <= DECK_LEN {
        table[n][0] = 1;

        let mut k = 1;

        while k < 6 {
            table[n][k] = if n == 0 {
                0
            } else {
                table[n - 1][k - 1] + table[n - 1][k]
            };
            k += 1;
        }

        n += 1;
    }

    table
}

fn binomial(n: usize, k: usize) -> u64 {
    if n > DECK_LEN || k > 5 {
        return 0;
    }

    BINOMIAL[n][k]
}

// the combinatorial number system: the `rank`-th combination of `take` deck positions, at a
// cost negligible beside the ~1,000 seven-card evaluations that board goes on to pay.
//
// `rank` must be below `binomial(deck, take)` for the deck being indexed. above it the
// search below walks off the end of the binomial table, where `binomial` answers 0 rather
// than panicking, and the loop never terminates — so an out-of-range rank is a hang and
// not a crash. the only caller outside this module's tests is `Shared::board_of`, which
// reaches it with a class index already bounded by the class count, so nothing today can
// produce one; the assertion is here to make a future caller fail loudly in a debug build
// instead of hanging.
fn unrank(mut rank: u64, take: usize, out: &mut [usize]) {
    for size in (1..=take).rev() {
        let mut position = size - 1;

        while binomial(position + 1, size) <= rank {
            debug_assert!(
                position + 1 < DECK_LEN,
                "unrank called with rank {rank}, which no deck of {DECK_LEN} cards reaches",
            );

            position += 1;
        }

        out[size - 1] = position;
        rank -= binomial(position, size);
    }
}

fn greatest_common_divisor(left: u32, right: u32) -> u32 {
    if right == 0 {
        left
    } else {
        greatest_common_divisor(right, left % right)
    }
}

// a golden-ratio Weyl step: successive multiples of it are spread as evenly over the class
// space as any sequence can be, so a prefix of the walk is representative of the whole
// rather than a contiguous slab of board order.
fn weyl_multiplier(classes: u32) -> u32 {
    if classes <= 2 {
        return 1;
    }

    let start = (classes as f64 / GOLDEN_RATIO).round() as i64;

    for step in 0..classes as i64 {
        for candidate in [start + step, start - step] {
            if candidate >= 1
                && candidate < classes as i64
                && greatest_common_divisor(candidate as u32, classes) == 1
            {
                return candidate as u32;
            }
        }
    }

    1
}

#[cfg(test)]
mod tests {
    use super::*;
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

    fn group_of(board: &str, texts: &[&str]) -> usize {
        stabilizer(mask_of(&cards(board)), &ranges(texts)).len()
    }

    mod visiting_order {
        use super::*;

        #[test]
        fn it_steps_the_preflop_class_space_by_the_nearest_coprime_to_the_golden_section() {
            assert_eq!(weyl_multiplier(2_598_960), 1_606_247);
        }

        #[test]
        fn it_steps_by_one_when_there_is_nothing_to_spread() {
            assert_eq!(weyl_multiplier(1), 1);
            assert_eq!(weyl_multiplier(2), 1);
        }

        #[test]
        fn it_visits_every_class_exactly_once() {
            for classes in 1..200u32 {
                let step = weyl_multiplier(classes);
                let mut seen = vec![false; classes as usize];

                for index in 0..classes {
                    let visited = (index as u64 * step as u64 % classes as u64) as usize;

                    assert!(!seen[visited], "class {visited} visited twice at {classes}");

                    seen[visited] = true;
                }

                assert!(seen.into_iter().all(|hit| hit));
            }
        }
    }

    mod stabilizer {
        use super::*;

        const SYMMETRIC: [&str; 2] = ["22+,A2s+,AJo+", "JJ+,AQs+"];

        #[test]
        fn it_is_trivial_on_a_rainbow_flop() {
            assert_eq!(group_of("Qs 8d 2h", &SYMMETRIC), 1);
        }

        #[test]
        fn it_has_two_elements_on_a_two_tone_flop() {
            assert_eq!(group_of("Qs 8s 2h", &SYMMETRIC), 2);
        }

        #[test]
        fn it_has_six_elements_on_a_monotone_flop() {
            assert_eq!(group_of("Qs 8s 2s", &SYMMETRIC), 6);
        }

        #[test]
        fn it_is_the_whole_suit_group_preflop_with_suit_symmetric_ranges() {
            assert_eq!(group_of("", &SYMMETRIC), 24);
        }

        #[test]
        fn it_collapses_when_a_range_names_a_suit() {
            assert_eq!(group_of("", &["AsKs", "QhJd"]), 1);
            assert_eq!(group_of("", &["AsKs", "QhQd"]), 2);
        }

        #[test]
        fn it_rejects_a_permutation_that_moves_weight_between_holdings() {
            assert_eq!(group_of("", &["AKs", "AKo:0.5,AKs"]), 24);
            assert_eq!(group_of("", &["AsKs:0.5,AhKh,AdKd,AcKc"]), 6);
        }

        #[test]
        fn it_always_holds_the_identity_at_the_front() {
            // the identity is seeded rather than filtered in, so a predicate no
            // permutation can satisfy narrows the group to the identity instead of
            // emptying it. a `NaN` weight is that predicate: it compares unequal to
            // itself, so the invariance test is false even for the identity. `build`
            // rejects such a range before it reaches here, and this is what makes that
            // rejection the only failure mode rather than an index panic on `group[0]`.
            let nan = || -> HandRange {
                [
                    (CardPair::from_str("AsKs").unwrap(), f32::NAN),
                    (CardPair::from_str("AhKh").unwrap(), 1.0),
                ]
                .into_iter()
                .collect()
            };

            for (board, players) in [
                ("Qs 8d 2h", ranges(&SYMMETRIC)),
                ("Qs 8s 2s", ranges(&SYMMETRIC)),
                ("", ranges(&SYMMETRIC)),
                ("", vec![nan(), nan()]),
            ] {
                let group = stabilizer(mask_of(&cards(board)), &players);

                assert_eq!(group[0], IDENTITY, "on {board:?}");
            }

            assert_eq!(group_of("", &["AsKs", "QhJd"]), 1);
        }
    }

    mod board_classes {
        use super::*;

        #[test]
        fn it_collapses_the_preflop_board_space_to_its_suit_isomorphism_classes() {
            let players = ranges(&["22+,A2s+,AJo+", "JJ+,AQs+"]);
            let evaluator = EquityEvaluator::preflop(&players).unwrap();

            // the collapse is on what is evaluated, never on what is emitted: the walk is
            // still every board, and the class count is a private figure.
            assert_eq!(evaluator.len(), 2_598_960);
            assert_eq!(evaluator.shared.class_len, 134_459);

            match &evaluator.shared.classes {
                Classes::Orbits(list) => assert_eq!(list.len(), 134_459),
                Classes::Whole { .. } => panic!("canonicalization did not engage"),
            }

            // and the orbits partition the board space: every board is reached from
            // exactly one class, so the walk emits each of them once.
            assert_eq!(
                *evaluator.shared.offsets.last().unwrap(),
                2_598_960,
                "the orbit sizes do not sum to the board space",
            );
        }

        #[test]
        fn it_leaves_the_board_space_whole_when_no_permutation_stabilizes_it() {
            let players = ranges(&["AsKs", "QhJd"]);
            let evaluator = EquityEvaluator::preflop(&players).unwrap();

            assert_eq!(evaluator.len(), 2_598_960);
            assert!(matches!(evaluator.shared.classes, Classes::Whole { .. }));
        }

        #[test]
        fn it_covers_every_completion_of_a_monotone_flop() {
            let players = ranges(&["22+,A2s+,AJo+", "JJ+,AQs+"]);
            let board = cards("Qs 8s 2s");
            let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

            assert!(evaluator.shared.class_len < 1176);
            assert_eq!(evaluator.len(), 1176);

            let walked: std::collections::HashSet<[Card; 5]> = (&evaluator)
                .into_iter()
                .map(|runout| *runout.board())
                .collect();

            assert_eq!(walked.len(), 1176, "a completion was emitted twice");
        }

        #[test]
        fn it_keeps_the_known_board_on_every_class_it_walks() {
            let players = ranges(&["22+,A2s+,AJo+", "JJ+,AQs+"]);
            let board = cards("Qs 8s 2s");
            let evaluator = EquityEvaluator::postflop(&board, &players).unwrap();

            for class in 0..evaluator.shared.class_len {
                let walked = evaluator.shared.board_of(class);

                assert_eq!(&walked[..3], &board[..]);
            }

            for runout in &evaluator {
                assert_eq!(&runout.board()[..3], &board[..]);
            }
        }
    }

    mod canonicalization {
        use super::*;
        use std::collections::HashMap;

        type Equities = HashMap<(usize, CardPair), (f64, f64)>;

        // per (player, holding), the share and total summed over the walk. an aggregate
        // alone is invariant under the group and stays right however the orbits are
        // spent, which is exactly why the first implementation's defect survived a green
        // suite; keying by holding is what makes the comparison sensitive to it.
        fn equities(evaluator: &EquityEvaluator) -> Equities {
            let mut totals: Equities = HashMap::new();

            for runout in evaluator {
                for player in runout.players() {
                    let slot = totals
                        .entry((player.player_index(), player.hole_cards()))
                        .or_insert((0.0, 0.0));

                    slot.0 += player.share();
                    slot.1 += player.total();
                }
            }

            totals
        }

        fn assert_agrees(folded: &Equities, whole: &Equities) {
            assert_eq!(folded.len(), whole.len(), "a holding went missing");
            assert!(!folded.is_empty());

            for (key, left) in folded {
                let right = whole.get(key).expect("holding is absent uncanonicalized");

                assert!(
                    (left.0 - right.0).abs() <= 1e-9 * left.1.max(1.0)
                        && (left.1 - right.1).abs() <= 1e-9 * left.1.max(1.0),
                    "{key:?}: {left:?} against {right:?}",
                );
            }
        }

        fn assert_flop_agrees(board: &str) {
            let players = ranges(&["JJ+", "A2s+"]);
            let board = cards(board);

            assert_agrees(
                &equities(&EquityEvaluator::postflop(&board, &players).unwrap()),
                &equities(&EquityEvaluator::without_canonicalization(&board, &players).unwrap()),
            );
        }

        #[test]
        fn it_gives_every_holding_the_same_equity_on_a_two_tone_flop() {
            assert_flop_agrees("Qs 8s 2h");
        }

        #[test]
        fn it_gives_every_holding_the_same_equity_on_a_monotone_flop() {
            assert_flop_agrees("Qs 8s 2s");
        }

        #[test]
        fn it_gives_every_holding_the_same_equity_on_a_reduced_preflop_walk() {
            // the whole preflop walk does not terminate inside `cargo test`, and the two
            // walks do not agree index for index — one steps classes and the other boards
            // — so the slice is checked board by board instead. each emitted runout is
            // compared against an evaluator built on that same five-card board, where
            // there is no completion left to collapse and no orbit can engage.
            let players = ranges(&["JJ+", "A2s+"]);
            let evaluator = EquityEvaluator::preflop(&players).unwrap();

            assert_eq!(evaluator.len(), 2_598_960);

            let mut boards = 0;

            for part in [0, 137, 4001, 59_999] {
                for runout in &evaluator.partition(60_000, part, part + 1) {
                    // a board that leaves a range with nothing has no evaluator of its
                    // own to build; the preflop walk emits no row for that player there
                    // either, so there is nothing to compare rather than a disagreement.
                    let Ok(alone) = EquityEvaluator::postflop(runout.board().as_slice(), &players)
                    else {
                        continue;
                    };
                    let direct = (&alone).into_iter().next().unwrap();

                    assert_eq!(direct.board(), runout.board());
                    assert_eq!(
                        runout.players(),
                        direct.players(),
                        "on {:?}",
                        runout.board()
                    );

                    boards += 1;
                }
            }

            assert!(boards > 100, "the slices walked only {boards} boards");
        }

        #[test]
        fn it_emits_the_same_boards_in_the_same_order_as_an_uncollapsed_walk() {
            // the two walks visit the board space in different orders — one steps classes,
            // the other steps boards — but they cover exactly the same set once.
            let players = ranges(&["JJ+", "A2s+"]);
            let board = cards("Qs 8s 2s");
            let folded: std::collections::HashSet<[Card; 5]> =
                (&EquityEvaluator::postflop(&board, &players).unwrap())
                    .into_iter()
                    .map(|runout| *runout.board())
                    .collect();
            let whole: std::collections::HashSet<[Card; 5]> =
                (&EquityEvaluator::without_canonicalization(&board, &players).unwrap())
                    .into_iter()
                    .map(|runout| *runout.board())
                    .collect();

            assert_eq!(folded.len(), 1176);
            assert_eq!(folded, whole);
        }
    }

    mod unranking {
        use super::*;

        #[test]
        fn it_maps_each_rank_to_a_distinct_combination() {
            for take in 1..=3usize {
                let len = 12;
                let mut seen = std::collections::HashSet::new();

                for rank in 0..binomial(len, take) {
                    let mut unranked = vec![0usize; take];

                    unrank(rank, take, &mut unranked);

                    assert!(unranked.windows(2).all(|pair| pair[0] < pair[1]));
                    assert!(unranked.iter().all(|position| *position < len));
                    assert!(
                        seen.insert(unranked),
                        "rank {rank} of {take}-subsets repeats"
                    );
                }

                assert_eq!(seen.len() as u64, binomial(len, take));
            }
        }

        #[test]
        fn it_enumerates_every_combination_through_the_odometer() {
            for take in 1..=3usize {
                let len = 12;
                let mut combination: Vec<usize> = (0..take).collect();
                let mut count = 0u64;

                loop {
                    assert!(combination.windows(2).all(|pair| pair[0] < pair[1]));

                    count += 1;

                    if !advance(&mut combination, len) {
                        break;
                    }
                }

                assert_eq!(count, binomial(len, take));
            }
        }

        #[test]
        fn it_counts_the_five_card_boards() {
            assert_eq!(binomial(52, 5), 2_598_960);
            assert_eq!(binomial(49, 2), 1176);
            assert_eq!(binomial(48, 1), 48);
            assert_eq!(binomial(47, 0), 1);
        }
    }
}
