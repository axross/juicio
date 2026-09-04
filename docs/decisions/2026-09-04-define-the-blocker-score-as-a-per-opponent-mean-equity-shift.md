---
status: accepted
---

# Define the Blocker Score as a Per-Opponent Mean-Equity Shift

The maintainer wanted a number per card pair, per opponent, saying how much
holding that pair weakens the opponent's range through card removal. On
2026-09-04 the session ran experiments against the `espada-internal` crate
to settle what that number should be, before any change built it.

Two candidate definitions were computed for every one of a hero's card pairs
on a heads-up board (K♠7♠2♣, hero holding 284 live card pairs, an opponent
with a 154-card-pair range): a **threshold share** — the fraction of the
opponent's card pairs at or above an equity cutoff τ that the hero pair
blocks, tried at τ = 0.60, τ = 0.75, and the opponent's own 75th percentile
— and a **mean-equity shift** Δ — the opponent's mean equity over its live
card pairs, minus its mean over the card pairs the hero pair does not block.
The threshold share moved with τ in a way with no principled resolution (one
pair read 0.092, 0.056, or 0.000 depending on the cutoff alone); it could
not separate two pairs blocking the same count of strong holdings (A♠K♥ and
A♥K♦ tied at a 0.370 share at τ = 0.75, while Δ told them apart, +5.75
against +4.54, because the spade ace also removes the opponent's strongest
A♠-holdings); it could not go negative even where removing weak holdings
measurably strengthens the remaining range (J♥T♦ scored Δ = −2.15); and it
counted holdings blocked rather than weighing them (7♥7♣ blocked only three
holdings, but the three strongest, scoring Δ = +0.80). Across all 284 hero
pairs, Spearman rank correlation between Δ and the τ = 0.75 share was 0.72,
between Δ and the top-quartile share 0.82, and between Δ and the hero pair's
own equity 0.74 — the two orderings mostly agreed, diverging exactly where
the four cases above show why Δ was chosen.

Run three-way on the same board, against a second opponent with a wide, weak
range, 56 of the hero's 284 pairs scored on opposite signs against the two
opponents (A♣K♣: +4.23 against one, −0.02 against the other), and the two
per-opponent orderings correlated at only 0.52. Preflop, `AA,KK` against
`QQ+,AKs` walked all 2,598,960 boards: every AA pair scored +11.86 pp
against the opponent and every KK pair −6.39 pp — the signs a player
expects, since AA removes the opponent's own AA and two of its AKs, while KK
removes only holdings the opponent's AA already beat.

The maintainer chose the mean-equity shift, scored per opponent, as the
blocker score's definition. See `specs/equity-analysis.md`'s The Blocker
Score section for the resulting definition and range.

Alternatives considered:

- **Threshold share of strong holdings blocked.** Rejected on the evidence
  above: a cutoff the product's continuous equity gradient has no principled
  value for, unable to separate pairs that block equally many strong
  holdings, and unable to express an unblocking effect at all.
- **One score per card pair, averaged across opponents.** Rejected: the
  three-way run found 56 of the hero's 284 pairs with opposite-signed scores
  against its two opponents, so an average would hide exactly the split a
  per-opponent score exists to show, and it is derived from the per-opponent
  values anyway, so it saves no computation.
- **A strength-neutral variant of the score.** Deferred rather than ruled
  out: the 0.74 correlation between Δ and a hero pair's own equity means Δ
  carries hand strength with it, which is inherent to blocking — a strong
  holding blocks strong holdings — and the maintainer chose not to define a
  variant that factors that out until a display design asks whether one is
  wanted.

Because the chosen score carries hand strength inside it, a high score
across two card pairs of very different underlying strength is not evidence
those two pairs block equally "purely" — a reader comparing scores across
card pairs should expect that correlation rather than read it as noise.
Nothing here forecloses defining a strength-neutral variant later.
