import '@/core/theme/unistyles';
import '@/core/i18n';

import { render, screen, within } from '@testing-library/react-native';

import type { HandRange } from '@/shared/model/hand-range';
import { RankIcon } from '@/shared/ui/playing-card/icons/rank-icon';
import { SuitednessIcon } from '@/shared/ui/playing-card/icons/suitedness-icon';

import { EquityBreakdownRankPairs } from './equity-breakdown-rank-pairs';

// this suite asserts each chip's own icon composition (two `RankIcon`s,
// plus a `SuitednessIcon` for `Suited`/`Offsuit` only) — the same seam
// `../../../shared/ui/playing-card/playing-card.test.tsx` mocks for the
// same reason (its own comment there): this RNTL version exposes no query
// for a rendered `react-native-svg` `<Path>`'s own `d`, so the icon
// components themselves are mocked and their own mock calls inspected
// instead of the SVG they'd otherwise draw.
jest.mock('@/shared/ui/playing-card/icons/rank-icon', () => ({
  RankIcon: jest.fn(() => null),
}));
jest.mock('@/shared/ui/playing-card/icons/suitedness-icon', () => ({
  SuitednessIcon: jest.fn(() => null),
}));

const mockedRankIcon = jest.mocked(RankIcon);
const mockedSuitednessIcon = jest.mocked(SuitednessIcon);

beforeEach(() => {
  mockedRankIcon.mockClear();
  mockedSuitednessIcon.mockClear();
});

// this component's own non-root children carry local, self-describing
// testIDs rather than ones built from the root's own testID
// (docs/conventions/component-contracts.md's "A Non-Root Child Gets Its
// Own Local testID") — every query below scopes through `root()` with
// `within()` rather than concatenating a prefix onto a child id.
function renderList(rankPairs: HandRange) {
  render(<EquityBreakdownRankPairs rankPairs={rankPairs} testID="rank-pairs" />);
  return within(screen.getByTestId('rank-pairs'));
}

describe('<EquityBreakdownRankPairs />', () => {
  it('renders one chip per Rank Pair, split across its own three groups', async () => {
    const root = await renderList(new Set(['AA', 'AKs', '72o']));

    expect(within(root.getByTestId('pocket-chips')).getAllByTestId(/^pocket-chip-/)).toHaveLength(
      1,
    );
    expect(within(root.getByTestId('suited-chips')).getAllByTestId(/^suited-chip-/)).toHaveLength(
      1,
    );
    expect(within(root.getByTestId('offsuit-chips')).getAllByTestId(/^offsuit-chip-/)).toHaveLength(
      1,
    );
  });

  it('renders no heading or chip row for a group with nothing in it', async () => {
    const root = await renderList(new Set(['AA']));

    expect(root.queryByTestId('suited')).toBeNull();
    expect(root.queryByTestId('offsuit')).toBeNull();
  });

  it('draws a pocket pair chip with two RankIcons and no SuitednessIcon', async () => {
    await renderList(new Set(['AA']));

    expect(mockedRankIcon).toHaveBeenCalledTimes(2);
    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedSuitednessIcon).not.toHaveBeenCalled();
  });

  it('draws a suited chip with a trailing suited SuitednessIcon', async () => {
    await renderList(new Set(['AKs']));

    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: 'K' }));
    expect(mockedSuitednessIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suitedness: 'suited' }),
    );
  });

  it('draws an offsuit chip with a trailing offsuit SuitednessIcon', async () => {
    await renderList(new Set(['72o']));

    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: '7' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: '2' }));
    expect(mockedSuitednessIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suitedness: 'offsuit' }),
    );
  });

  it('gives a pocket pair chip one combined accessible label naming its rank twice', async () => {
    const root = await renderList(new Set(['AA']));

    const chip = root.getByTestId('pocket-chip-AA');
    expect(chip.props.accessible).toBe(true);
    expect(chip.props.accessibilityLabel).toBe('ace ace pocket pair');
  });

  it('gives a suited chip one combined accessible label naming both ranks', async () => {
    const root = await renderList(new Set(['AKs']));

    expect(root.getByTestId('suited-chip-AKs').props.accessibilityLabel).toBe('ace king suited');
  });

  it('gives an offsuit chip one combined accessible label naming both ranks', async () => {
    const root = await renderList(new Set(['72o']));

    expect(root.getByTestId('offsuit-chip-72o').props.accessibilityLabel).toBe(
      'seven deuce offsuit',
    );
  });

  it("renders each group's own heading text, in the fixed pocket/suited/offsuit order", async () => {
    const root = await renderList(new Set(['AA', 'AKs', '72o']));

    expect(root.getByTestId('pocket-heading').props.children).toBe('Pocket pairs');
    expect(root.getByTestId('suited-heading').props.children).toBe('Suited');
    expect(root.getByTestId('offsuit-heading').props.children).toBe('Offsuit');
  });
});
