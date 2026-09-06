import '@/core/theme/unistyles';
import '@/core/i18n';

import { render, screen, within } from '@testing-library/react-native';

import { cardPair, cardPairNumber, CARD_PAIR_COUNT, type CardPair } from '@/shared/model/card-pair';
import { SUITS } from '@/shared/model/card';
import type { HandRange } from '@/shared/model/hand-range';

import { EquityBreakdownBlockerScore } from './equity-breakdown-blocker-score';

const AK_SUITED_COMBOS: readonly CardPair[] = SUITS.map((suit) =>
  cardPair({ rank: 'A', suit }, { rank: 'K', suit }),
);

/** builds the `equities`/`blockerScores` pair this component reads —
 * mirrors `../../model/blocker-score.test.ts`'s own `buildBuffers`, kept
 * here rather than imported since that one is private to its own suite.
 *
 * **`entries`' own `values` are display-scale, signed percentage points —
 * the same figures this suite's own assertions read back off the rendered
 * screen — divided by 100 here before seeding the raw buffer, the exact
 * inverse of `../../model/blocker-score.ts`'s `readBlockerScore`'s own
 * `* 100`**, so every test below stays written in display-scale terms
 * while the buffer this helper actually produces genuinely matches the
 * engine's own `blockerScores` contract, a fraction in `[-1, 1]`
 * (`readBlockerScore`'s own doc comment) — see that file's own matching
 * `buildBuffers` doc comment for why this one division keeps every seed and
 * its own displayed figure bit-exact inverses of one another. */
function buildBuffers(
  playerCount: number,
  entries: readonly { readonly pair: CardPair; readonly values: readonly number[] }[],
): { readonly equities: ArrayBuffer; readonly blockerScores: ArrayBuffer } {
  const opponentCount = playerCount - 1;
  const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  const blockerScores = new Float64Array(CARD_PAIR_COUNT * opponentCount).fill(NaN);
  for (const { pair, values } of entries) {
    const number = cardPairNumber(pair);
    equities[number] = 0.5;
    values.forEach((value, ordinal) => {
      blockerScores[number * opponentCount + ordinal] = value / 100;
    });
  }
  return { equities: equities.buffer, blockerScores: blockerScores.buffer };
}

const EMPTY_BUFFER = new ArrayBuffer(0);

function renderSection(props: {
  rankPairs: HandRange;
  equities: ArrayBuffer;
  blockerScores: ArrayBuffer;
  opponentNumbers: readonly number[];
}) {
  render(<EquityBreakdownBlockerScore {...props} testID="blocker-score" />);
  return within(screen.getByTestId('blocker-score'));
}

describe('<EquityBreakdownBlockerScore />', () => {
  it('renders one skeleton row per rank pair, with no digit, sign, or bar, before settlement', () => {
    const root = renderSection({
      rankPairs: new Set(['AA', 'AKs']),
      equities: EMPTY_BUFFER,
      blockerScores: EMPTY_BUFFER,
      opponentNumbers: [2],
    });

    expect(root.getByTestId('subcopy').props.children).toBe('Calculating…');
    expect(root.getByTestId('skeleton-AA')).toBeTruthy();
    expect(root.getByTestId('skeleton-AKs')).toBeTruthy();
    // a pre-settlement row is never split by combination — `row-AA-*`
    // never appears, only the one rank-pair-wide skeleton.
    expect(root.queryByTestId(/^row-/)).toBeNull();
  });

  it('collapses every live combination agreeing on the same figures into one rank-pair row', () => {
    const { equities, blockerScores } = buildBuffers(
      2,
      AK_SUITED_COMBOS.map((pair) => ({ pair, values: [1.2] })),
    );
    const root = renderSection({
      rankPairs: new Set(['AKs']),
      equities,
      blockerScores,
      opponentNumbers: [2],
    });

    expect(root.getByTestId('subcopy').props.children).toBe(
      "How much each live card pair shifts an opponent's mean equity by blocking their combos.",
    );
    const row = root.getByTestId('row-AKs-rankPair');
    expect(row.props.accessibilityLabel).toBe(
      'ace king suited, standing for 4 combos, Player 2: +1.2',
    );
    expect(within(row).getByText('+1.2').props.children).toBe('+1.2');
    expect(within(row).getByText('×4').props.children).toBe('×4');
  });

  it('pulls one deviating combination onto its own row, ordered ahead of the rank-pair row', () => {
    const ordered = [...AK_SUITED_COMBOS].sort((a, b) => cardPairNumber(a) - cardPairNumber(b));
    const [first, ...rest] = ordered;
    const { equities, blockerScores } = buildBuffers(2, [
      { pair: first, values: [1.3] },
      ...rest.map((pair) => ({ pair, values: [1.1] })),
    ]);
    const root = renderSection({
      rankPairs: new Set(['AKs']),
      equities,
      blockerScores,
      opponentNumbers: [2],
    });

    const cardPairRow = root.getByTestId(`row-AKs-${cardPairNumber(first)}`);
    const rankPairRow = root.getByTestId('row-AKs-rankPair');
    expect(within(cardPairRow).getByText('+1.3')).toBeTruthy();
    expect(within(rankPairRow).getByText('+1.1')).toBeTruthy();
    expect(within(rankPairRow).getByText('×3')).toBeTruthy();
    // the deviating combination's own row sits ahead of the rank-pair row
    // standing for the rest — this rank pair's own canonical order.
    const rowOrder = root.getAllByRole('none').map((node) => node.props.testID);
    expect(rowOrder.indexOf(cardPairRow.props.testID)).toBeLessThan(
      rowOrder.indexOf(rankPairRow.props.testID),
    );
  });

  it('names each opponent by column header, and carries a second figure at a three-seat table', () => {
    const { equities, blockerScores } = buildBuffers(
      3,
      AK_SUITED_COMBOS.map((pair) => ({ pair, values: [1.2, -0.5] })),
    );
    const root = renderSection({
      rankPairs: new Set(['AKs']),
      equities,
      blockerScores,
      opponentNumbers: [2, 3],
    });

    expect(root.getByText('Player 2')).toBeTruthy();
    expect(root.getByText('Player 3')).toBeTruthy();
    const row = root.getByTestId('row-AKs-rankPair');
    expect(row.props.accessibilityLabel).toBe(
      'ace king suited, standing for 4 combos, Player 2: +1.2, Player 3: -0.5',
    );
  });

  it('draws no heading or row for a group with nothing in it', () => {
    const root = renderSection({
      rankPairs: new Set(['AKs']),
      equities: EMPTY_BUFFER,
      blockerScores: EMPTY_BUFFER,
      opponentNumbers: [2],
    });

    expect(root.queryByTestId('heading-pocket')).toBeNull();
    expect(root.queryByTestId('heading-offsuit')).toBeNull();
    expect(root.getByTestId('heading-suited').props.children).toBe('Suited');
  });

  it('excludes a non-live card pair from the settled row it would otherwise have joined', () => {
    const ordered = [...AK_SUITED_COMBOS].sort((a, b) => cardPairNumber(a) - cardPairNumber(b));
    const [excluded, ...rest] = ordered;
    const { equities, blockerScores } = buildBuffers(
      2,
      rest.map((pair) => ({ pair, values: [1.2] })),
    );
    const root = renderSection({
      rankPairs: new Set(['AKs']),
      equities,
      blockerScores,
      opponentNumbers: [2],
    });

    expect(root.queryByTestId(`row-AKs-${cardPairNumber(excluded)}`)).toBeNull();
    expect(within(root.getByTestId('row-AKs-rankPair')).getByText('×3')).toBeTruthy();
  });
});
