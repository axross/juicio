import type { TFunction } from 'i18next';

import type { Card } from '@/shared/model/card';

/**
 * a card's spoken name — "ace of spades", 「スペードのエース」 — for an
 * accessibility label. lives here, in `ui/`, rather than `../model/card.ts`:
 * that module is pure, with no React and no i18n (see
 * docs/conventions/directory-structure.md), and the composition has to be
 * i18n's own — `src/core/i18n/resources/en.ts`'s `handRanges.card` doc
 * comment explains why rank and suit are two named interpolations
 * (`{{rank}}`, `{{suit}}`) into a per-language `nameTemplate`, not one
 * fixed word order: English reads rank before suit ("ace of spades"),
 * Japanese reads suit before rank (「スペードのエース」), so the template —
 * owned by the language, not this function — decides the order. `t` is
 * the caller's `useTranslation('handRanges')` result, not a hook here, so
 * this stays a plain function every accessibility-label call site can use
 * without a second render pass.
 */
export function cardSpokenName(card: Card, t: TFunction<'handRanges'>): string {
  return t('card.nameTemplate', {
    rank: t(`card.rankName.${card.rank}`),
    suit: t(`card.suitName.${card.suit}`),
  });
}
