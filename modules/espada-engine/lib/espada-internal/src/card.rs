// Private inner module re-exported at the crate boundary; renaming it would move every
// internal path without changing anything a user of the crate can see.
#[allow(clippy::module_inception)]
mod card;
mod rank;
mod rank_range;
mod suit;
mod suit_range;

pub use card::{Card, ParseCardError};
pub use rank::Rank;
pub use rank_range::RankRange;
pub use suit::Suit;
pub use suit_range::SuitRange;
