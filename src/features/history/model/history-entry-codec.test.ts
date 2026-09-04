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

// both decode functions return a `DecodeResult` (`history-entry-codec.ts`'s
// own doc comment) rather than throwing — this unwraps a round-trip test's
// own expected-successful decode, failing loudly (with the original decode
// failure as `cause`) if a fixture this suite expects to decode cleanly
// doesn't.
function decodeOk<T>(
  result:
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: unknown },
): T {
  if (!result.success) {
    throw new Error('expected a successful decode', { cause: result.error });
  }
  return result.data;
}

describe('encodeHistoryEntryBoard() / decodeHistoryEntryBoard()', () => {
  it('round-trips an empty (preflop) board', () => {
    const encoded = encodeHistoryEntryBoard([]);

    expect(decodeOk(decodeHistoryEntryBoard(encoded))).toEqual([]);
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

    expect(decodeOk(decodeHistoryEntryBoard(encoded))).toEqual(board);
  });

  it('fails on a stored value that is not an array of strings', () => {
    // a shape `storedBoardSchema` rejects (a number where a card key string
    // belongs) — the kind of drift an older bundle or a hand-edited row
    // could produce; `decodeHistoryEntryBoard` receives an already-JSON-parsed
    // value (`@/core/db/schema.ts`'s `historyEntries.board` column,
    // `{ mode: 'json' }`, runs `JSON.parse` itself), so this passes the
    // parsed shape directly rather than a JSON string.
    // `history-entries-store.test.ts` covers how `listHistoryEntries()`
    // isolates a row that fails this the same way.
    expect(decodeHistoryEntryBoard(['Ah', 2]).success).toBe(false);
  });

  it('fails on a stored value that is not an array at all', () => {
    expect(decodeHistoryEntryBoard('not an array').success).toBe(false);
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

    expect(decodeOk(decodeHistoryEntryPlayers(encoded))).toEqual(players);
  });

  it('round-trips a handRange holding', () => {
    const players: readonly HistoryEntryPlayer[] = [
      {
        holding: { kind: 'handRange', rankPairs: new Set(['AA', 'AKs', '72o']) },
        result: { win: 0.38, tie: 0.02, equity: 0.39 },
      },
    ];

    const encoded = encodeHistoryEntryPlayers(players);

    expect(decodeOk(decodeHistoryEntryPlayers(encoded))).toEqual(players);
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

    expect(decodeOk(decodeHistoryEntryPlayers(encoded))).toEqual(players);
  });

  it('round-trips an empty players array', () => {
    expect(decodeOk(decodeHistoryEntryPlayers(encodeHistoryEntryPlayers([])))).toEqual([]);
  });

  it('fails on a stored player missing its result', () => {
    const malformed = [{ holding: { kind: 'handRange', rankPairs: ['AA'] } }];

    expect(decodeHistoryEntryPlayers(malformed).success).toBe(false);
  });

  it("fails on a stored holding whose kind matches neither 'holeCards' nor 'handRange'", () => {
    const malformed = [
      { holding: { kind: 'somethingElse' }, result: { win: 0.5, tie: 0, equity: 0.5 } },
    ];

    expect(decodeHistoryEntryPlayers(malformed).success).toBe(false);
  });
});
