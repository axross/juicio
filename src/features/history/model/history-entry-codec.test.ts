import type { Card } from '@/shared/model/card';

import type { HistoryEntryPlayer } from './history-entry';
import {
  decodeHistoryEntryBoard,
  decodeHistoryEntryPlayers,
  encodeHistoryEntryBoard,
  encodeHistoryEntryPlayers,
} from './history-entry-codec';

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const KING_DIAMONDS: Card = { rank: 'K', suit: 'd' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };

describe('encodeHistoryEntryBoard() / decodeHistoryEntryBoard()', () => {
  it('round-trips an empty (preflop) board', () => {
    const encoded = encodeHistoryEntryBoard([]);

    expect(decodeHistoryEntryBoard(encoded)).toEqual([]);
  });

  it('round-trips a five-card board, preserving dealing order', () => {
    const board: readonly Card[] = [
      ACE_HEARTS,
      KING_DIAMONDS,
      TWO_CLUBS,
      { rank: 'Q', suit: 's' },
      { rank: 'J', suit: 'h' },
    ];

    const encoded = encodeHistoryEntryBoard(board);

    expect(decodeHistoryEntryBoard(encoded)).toEqual(board);
  });
});

describe('encodeHistoryEntryPlayers() / decodeHistoryEntryPlayers()', () => {
  it('round-trips a holeCards holding, normalised the same way cardPair() normalises it', () => {
    const players: readonly HistoryEntryPlayer[] = [
      {
        holding: {
          kind: 'holeCards',
          holeCards: { first: ACE_HEARTS, second: KING_DIAMONDS },
        },
        result: { win: 0.6, tie: 0.02, equity: 0.61 },
      },
    ];

    const encoded = encodeHistoryEntryPlayers(players);

    expect(decodeHistoryEntryPlayers(encoded)).toEqual(players);
  });

  it('round-trips a handRange holding', () => {
    const players: readonly HistoryEntryPlayer[] = [
      {
        holding: { kind: 'handRange', rankPairs: new Set(['AA', 'AKs', '72o']) },
        result: { win: 0.38, tie: 0.02, equity: 0.39 },
      },
    ];

    const encoded = encodeHistoryEntryPlayers(players);

    expect(decodeHistoryEntryPlayers(encoded)).toEqual(players);
  });

  it('round-trips several players, preserving seat order', () => {
    const players: readonly HistoryEntryPlayer[] = [
      {
        holding: { kind: 'handRange', rankPairs: new Set(['AA']) },
        result: { win: 0.5, tie: 0.02, equity: 0.51 },
      },
      {
        holding: { kind: 'holeCards', holeCards: { first: KING_DIAMONDS, second: TWO_CLUBS } },
        result: { win: 0.48, tie: 0.02, equity: 0.49 },
      },
    ];

    const encoded = encodeHistoryEntryPlayers(players);

    expect(decodeHistoryEntryPlayers(encoded)).toEqual(players);
  });

  it('round-trips an empty players array', () => {
    expect(decodeHistoryEntryPlayers(encodeHistoryEntryPlayers([]))).toEqual([]);
  });
});
