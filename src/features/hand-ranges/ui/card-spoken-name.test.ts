// registers this project's real i18next resources — see
// `./cards-pane.test.tsx`'s own comment on why this side-effect import has
// to run before a real (non-fallback) translation is available under Jest.
import '@/core/i18n';

import i18next from 'i18next';

import { RANKS, SUITS, type Card } from '../model/card';
import { cardSpokenName } from './card-spoken-name';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };

// eslint-disable-next-line import/no-named-as-default-member -- mirrors `@/core/i18n`'s own documented `i18next.use(...)` plugin-API usage; `getFixedT` is the same kind of call on the same default export.
const fixedT = (language: 'en' | 'ja') => i18next.getFixedT(language, 'handRanges');

describe('cardSpokenName()', () => {
  it('reads rank before suit in English — "ace of spades"', () => {
    expect(cardSpokenName(ACE_SPADES, fixedT('en'))).toBe('ace of spades');
  });

  it('reads suit before rank in Japanese — 「スペードのエース」', () => {
    expect(cardSpokenName(ACE_SPADES, fixedT('ja'))).toBe('スペードのエース');
  });

  it('names every one of the 13 ranks in English, never falling back to the raw key', () => {
    const t = fixedT('en');
    for (const rank of RANKS) {
      const name = cardSpokenName({ rank, suit: 's' }, t);
      expect(name).not.toContain('rankName');
      expect(name.startsWith('of spades')).toBe(false);
    }
  });

  it('names every one of the 4 suits in English, never falling back to the raw key', () => {
    const t = fixedT('en');
    for (const suit of SUITS) {
      const name = cardSpokenName({ rank: 'A', suit }, t);
      expect(name).not.toContain('suitName');
      expect(name.startsWith('ace of ')).toBe(true);
    }
  });
});
