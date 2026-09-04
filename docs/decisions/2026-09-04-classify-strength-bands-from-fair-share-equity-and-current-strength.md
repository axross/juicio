---
status: accepted
---

# Classify Strength Bands From Fair-Share Equity and Current Strength

The Equity Breakdown sheet's four strength bands — `Trash`, `Marginal`,
`Value`, `Nuts` — named a position on a continuous equity gradient, with no
equity value at which a card pair actually changed band. That earlier
decision deferred the boundary question to whoever first needed to classify
a single card pair. The maintainer stated the breakdown's purpose as showing
two related things: equity, the share of the pot a card pair expects, and nut
advantage — a card pair that is genuinely ahead right now can bet larger and
is worth more than its equity alone says. Equity alone cannot express the
second, so this decision assigns each card pair to one band from two
measures instead of one.

The engine that supplies these numbers scores seven-card hands and accepts
two or three players today; classifying a card pair on the flop or turn needs
new five- and six-card scoring. Six-player support is planned, so the
classification rule must not assume at most three players.

## What was measured

A companion benchmark (tracked alongside issue #212, not part of this
project's own crates) ran the classification candidates against the engine
as it stands, single-threaded in a 4-core container, on two flops —
`Qs8d2h` (dry) and `JsTs4h` (wet) — against two ranges, `22+,A2s+,AJo+` and
`22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+`, each heads-up and
three-handed.

**Fixed equity thresholds break with the player count.** The same range on
`Qs8d2h`, with no change to any hand, has 21 of 147 card pairs under 25%
equity heads-up and 81 of 147 three-handed.

**Equity relative to the fair share corrects that dilution, but conflates a
draw with a made hand.** On the wet board heads-up, `K♠Q♠` (a flush draw
with two overcards, 63.41% equity) and `A♥T♥` (a made middle pair, 60.31%
equity) land in the same equity-relative band, though one is ahead on the
board today and the other is not.

**Current strength separates them.** `K♠Q♠` is ahead of 11.5% of the
opponent's live card pairs on the current board; `A♥T♥` is ahead of 71.4%;
`A♥J♦` of 85.5%; `J♥J♣`, a set, of 100%.

**Current strength is cheap next to the walk it rides alongside.** Computing
it exactly for one player against one opponent costs 190.78 microseconds to
976.83 microseconds across the six flop/turn/river fixtures the benchmark
timed, against a 35.455 ms to 257.527 ms flop walk on the same fixtures — well
under a millisecond against tens to hundreds of milliseconds. Classifying a
card pair, once its equity and current strength are already computed, costs
389.0 to 428.0 nanoseconds per scenario, negligible next to either figure.

Every player's per-card-pair result today crosses the native boundary as a
fixed 104-byte payload (three `f64` fields plus twenty `u32` fields),
regardless of the fixture. Carrying a band per card pair was measured under
three shapes for the equity-only classification pass: four band counts
alone (16 bytes), a 20-bin equity histogram unchanged from today's shape
(80 bytes), or a full per-pair list of a pair id and its equity (834 to 882
bytes across the six fixtures measured). Adding current strength as its own
per-player payload was measured under three further shapes: a 4×4
equity-band by current-strength-quartile matrix (64 bytes), a 20×20
histogram of the two axes (1,600 bytes), or a full per-pair list of a pair
id, its equity, and its current strength (1,390 to 1,470 bytes across the
same fixtures).

Three composite rules were evaluated on the four fixture scenarios above
(`D2`: dry, heads-up; `D3`: dry, three-handed; `W2`: wet, heads-up; `W3`: wet,
three-handed), each first-match-wins over the two measures `eq` (equity) and
`P` (current strength) against `fair = 1/N`:

- **R1**: `Nuts` if `P ≥ 0.85`; else `Value` if `P ≥ 0.50` and `eq ≥ fair`;
  else `Trash` if `eq < 0.6 × fair` and `P < 0.50`; else `Marginal`.
- **R2**: the same shape, with `P ≥ 0.90` for `Nuts` and `P ≥ 0.60` for
  `Value`.
- **R3**: R1's `Nuts` and `Trash` unchanged; `Value` gains a second,
  equity-only route in, `eq ≥ fair + 0.5 × (1 − fair)`.

Band counts (`Trash`, `Marginal`, `Value`, `Nuts`) on each scenario:

| Scenario | R1              | R2              | R3              |
| -------- | --------------- | --------------- | --------------- |
| D2       | 25, 62, 39, 21  | 25, 62, 45, 15  | 25, 62, 39, 21  |
| D3       | 70, 32, 36, 9   | 70, 44, 24, 9   | 70, 32, 36, 9   |
| W2       | 31, 107, 42, 42 | 31, 107, 60, 24 | 31, 107, 42, 42 |
| W3       | 53, 97, 54, 18  | 53, 112, 45, 12 | 53, 97, 54, 18  |

R3 classified no card pair differently from R1 on any of the four scenarios.
R2 moved several hands out of the band R1 gave them: `K♠K♥` heads-up on the
dry board out of `Nuts` into `Value` (equity 76.99%, `P` 0.884); `Q♠Q♥` and
`A♥J♦` heads-up on the wet board out of `Nuts` into `Value` (`Q♠Q♥` equity
72.12%, `P` 0.876; `A♥J♦` equity 67.84%, `P` 0.855); `A♠A♥` three-handed on
the wet board out of `Nuts` into `Value` (equity 64.67%, `P` 0.861); and
`J♥J♦` three-handed on the dry board out of `Value` into `Marginal` (equity
46.78%, `P` 0.562).

## The decision

Every live card pair is classified from two measures, both defined against
the current board and the opponents' live ranges:

- **Fair-share-relative equity** (`eq` against `fair = 1/N`): the card
  pair's own equity divided by the share it would hold if the pot were split
  evenly among the `N` players.
- **Current strength** (`P`): the card pair's chance of being ahead of every
  opponent's live range on the board as it stands, before any further card.
  Against one opponent, current strength is the pairwise lead: the fraction
  of that opponent's live card pairs the card pair beats, a tie counting one
  half. Against more than one opponent, current strength is the product of
  the pairwise leads against each opponent — an approximation that treats
  opponents as independent, ignoring the card-removal correlation between
  them.

Rule R1 classifies every live card pair, postflop: `Nuts` if `P ≥ 0.85`;
else `Value` if `P ≥ 0.50` and `eq ≥ fair`; else `Trash` if `eq < 0.6 × fair`
and `P < 0.50`; else `Marginal`.

Preflop, current strength is undefined — there is no board to be ahead on —
so the band comes from fair-share-relative equity alone: `Trash` below
`0.6 × fair`, `Marginal` below `fair`, `Value` below
`fair + 0.6 × (1 − fair)`, `Nuts` otherwise. A preflop band therefore carries
a narrower meaning than a postflop one: it says only where equity sits, not
whether the card pair is ahead of anything yet.

The per-card-pair equity, current strength, and resulting band cross from
the native engine to the app for every live card pair; the thresholds
themselves are not compiled into the engine, so tuning them needs no native
rebuild.

## Worked examples

Heads-up on `JsTs4h`:

| Hand   | Equity | `P`   | Band       | What it is on this board       |
| ------ | ------ | ----- | ---------- | ------------------------------ |
| `J♥J♣` | 88.35% | 1.000 | `Nuts`     | a set                          |
| `A♥J♦` | 67.84% | 0.855 | `Nuts`     | top pair, ahead of 85.5%       |
| `A♥T♥` | 60.31% | 0.714 | `Value`    | middle pair                    |
| `K♠Q♠` | 63.41% | 0.115 | `Marginal` | a flush draw with two overcards |
| `A♠K♠` | 66.85% | 0.374 | `Marginal` | a flush draw, high card now    |
| `8♣7♣` | 25.57% | 0.021 | `Trash`    | high card, a draw with little current lead |

`A♥J♦` lands in `Nuts` rather than `Value` under R1 — this is one of the
hands R2 would instead classify `Value` (see below); its high current
strength against a single opponent's range on this board is enough to clear
R1's 0.85 threshold.

Three-handed on `Qs8d2h`:

| Hand   | Equity | `P`   | Band       | What it is on this board |
| ------ | ------ | ----- | ---------- | ------------------------- |
| `Q♥Q♦` | 94.93% | 1.000 | `Nuts`     | a set                      |
| `A♥A♦` | 70.43% | 0.826 | `Value`    | an overpair                |
| `A♥Q♦` | 61.22% | 0.708 | `Value`    | top pair                   |
| `7♠7♦` | 29.68% | 0.373 | `Marginal` | a pocket pair between the board's 8 and 2 |
| `A♦2♦` | 22.68% | 0.140 | `Marginal` | bottom pair                |
| `A♣3♣` | 6.28%  | 0.000 | `Trash`    | high card                  |

`A♥A♦` three-handed on the dry board (above) is `Value`, at `P` 0.826,
below R1's 0.85 `Nuts` cutoff. Pocket aces three-handed on the *wet* board
is `Nuts` instead — `A♠A♥`'s `P` there is 0.861 — crossing R1's `Nuts`
cutoff on one board and not the other, because current strength is a
property of the specific board and opponent range, not of the hole cards
alone.

## Alternatives rejected

- **Fixed absolute equity thresholds.** Rejected: the same range on the same
  board has 21 of 147 card pairs under 25% equity heads-up and 81 of 147
  three-handed, with no change to any hand — a threshold tuned for one
  player count misclassifies at another.
- **Fair-share-relative equity alone, with no current-strength axis.**
  Rejected: it puts a draw and a made hand in the same band, as `K♠Q♠` and
  `A♥T♥` above show; the histogram would then be unable to distinguish a
  range that is only drawing to strength from one that already holds it.
- **The mean of the pairwise leads, rather than their product, as the
  multiway current-strength proxy.** Rejected: a mean does not fall as the
  player count rises, so a top pair stays close to `Nuts` even against five
  opponents, which does not match the nut-advantage intuition the breakdown
  exists to show — a hand that is a big favourite against one opponent is
  not automatically a big favourite against five.
- **The exact joint probability of being ahead of every opponent at once.**
  Rejected in favour of the product-of-pairwise-leads approximation on cost
  and complexity: the exact joint probability requires reasoning about
  correlated card removal across every opponent simultaneously, which the
  measured approach does not attempt.
- **The sort-and-sweep approximation of the pairwise lead**, which sorts an
  opponent's live pairs once and answers each query by binary search
  (O(log H) per query) rather than the exact pass's O(H) per query. It was
  faster: on the six flop/turn/river fixtures measured, it ran the naive
  pass's cost down by a factor of roughly 1.6x to 5.0x. Rejected for the
  shipped classification because it drops the naive pass's per-hand
  card-removal check, giving a systematic bias against the exact value of
  0.01461 to 0.01505 mean absolute error and 0.04006 to 0.04438 maximum
  absolute error across the six fixtures — a bias the exact pass's own
  cost, well under a millisecond per player, does not need to accept.
- **Classifying inside the engine against a fixed 20×4 (equity bin by band)
  or 4×4 (equity quartile by current-strength quartile) matrix.** Rejected:
  it would fix the thresholds at compile time, so tuning any of them would
  need a native rebuild rather than an app-side change.
- **Rule R2** (tighter cutoffs: `P ≥ 0.90` for `Nuts`, `P ≥ 0.60` for
  `Value`). Rejected: on the measured fixtures it moves `K♠K♥` heads-up on
  the dry board, `Q♠Q♥` and `A♥J♦` heads-up on the wet board, and `A♠A♥`
  three-handed on the wet board out of `Nuts` into `Value`, and `J♥J♦`
  three-handed on the dry board out of `Value` into `Marginal` — narrowing
  `Nuts` to sets and the very top overpairs read as less faithful to hand
  strength than R1 on these fixtures, since a hand this far ahead on the
  current board is exactly what the sheet's nut-advantage purpose means to
  surface.
- **Rule R3** (R1's `Nuts` and `Trash` branches unchanged, with a second,
  equity-only route into `Value`: `eq ≥ fair + 0.5 × (1 − fair)`). Rejected:
  benchmarked on all four fixture scenarios, it classified no card pair
  differently from R1 on any of them — 0 of 738 live card pairs across D2,
  D3, W2, and W3 — so it adds nothing R1 does not already give.
- **A variant of R1 with the `Nuts` cutoff lowered to `P ≥ 0.80`.** Offered
  during the session as a third alternative to R1 and R2, reasoned to bring
  overpairs such as three-handed `A♥A♦` on the dry board into `Nuts` at the
  cost of a wider `Nuts` band. Unlike R2 and R3, it was not one of the rules
  the benchmark measured against the four fixtures.

## Consequences

The engine needs new five- and six-card hand scoring to compute current
strength on the flop and turn; today it scores only complete seven-card
hands. A per-card-pair result — equity, current strength, and band — now
crosses the native boundary for every live card pair, rather than the
aggregate win/tie/equity figures the app already receives. The
classification thresholds live in the app rather than the engine, so tuning
them needs no native rebuild. The product-of-pairwise-leads approximation
treats opponents as independent; because current strength for `N` players is
the product of `N − 1` such factors, any bias in one factor compounds with
each added opponent, so the approximation's error grows with the player
count even though each individual pairwise-lead measurement carries the same
error regardless of how many opponents there are. The classification
described here is decided but not yet built; issue #212 carries its
implementation. How the histogram presents a band assigned per card pair,
rather than per equity position, is decided separately, in
`2026-09-04-colour-each-histogram-bar-by-its-majority-strength-band.md`.
