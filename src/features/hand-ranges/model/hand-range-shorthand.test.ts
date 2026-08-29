import { HAND_RANGE_SHORTHANDS } from './hand-range-shorthand';

function shorthandByLabel(label: string) {
  const shorthand = HAND_RANGE_SHORTHANDS.find((entry) => entry.label === label);
  if (!shorthand) {
    throw new Error(`no shorthand named ${label} — did the fixture label change?`);
  }
  return shorthand;
}

describe('HAND_RANGE_SHORTHANDS', () => {
  it('has exactly the three named shorthands the design draws', () => {
    expect(HAND_RANGE_SHORTHANDS.map((entry) => entry.label)).toEqual(['A*s', '55+', '98s-54s']);
  });

  describe('A*s', () => {
    it('expands to all 12 suited aces, AKs down to A2s', () => {
      const { rankPairs } = shorthandByLabel('A*s');
      expect(rankPairs).toEqual(
        new Set([
          'AKs',
          'AQs',
          'AJs',
          'ATs',
          'A9s',
          'A8s',
          'A7s',
          'A6s',
          'A5s',
          'A4s',
          'A3s',
          'A2s',
        ]),
      );
    });
  });

  describe('55+', () => {
    it('expands to all 10 pocket pairs from 55 up to AA', () => {
      const { rankPairs } = shorthandByLabel('55+');
      expect(rankPairs).toEqual(
        new Set(['55', '66', '77', '88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA']),
      );
    });
  });

  describe('98s-54s', () => {
    it('expands to exactly the 5 suited connectors from 98s down to 54s', () => {
      const { rankPairs } = shorthandByLabel('98s-54s');
      expect(rankPairs).toEqual(new Set(['98s', '87s', '76s', '65s', '54s']));
    });
  });
});
