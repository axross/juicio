import '@/core/theme/unistyles';
import '@/core/i18n';

import { render, screen } from '@testing-library/react-native';

import { RankIcon } from '@/shared/ui/playing-card/icons/rank-icon';
import { SuitednessIcon } from '@/shared/ui/playing-card/icons/suitedness-icon';

import { RankPairChip } from './rank-pair-chip';

// the same seam `../equity-breakdown-rank-pairs/
// equity-breakdown-rank-pairs.test.tsx` already mocks, for the same reason
// (this RNTL version exposes no query for a rendered `react-native-svg`
// `<Path>`'s own `d`).
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

describe('<RankPairChip />', () => {
  it('draws a pocket pair chip with two RankIcons and no SuitednessIcon', async () => {
    await render(<RankPairChip pairKey="AA" testID="chip" />);

    expect(mockedRankIcon).toHaveBeenCalledTimes(2);
    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedSuitednessIcon).not.toHaveBeenCalled();
  });

  it('draws a suited chip with a trailing suited SuitednessIcon', async () => {
    await render(<RankPairChip pairKey="AKs" testID="chip" />);

    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: 'A' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: 'K' }));
    expect(mockedSuitednessIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suitedness: 'suited' }),
    );
  });

  it('draws an offsuit chip with a trailing offsuit SuitednessIcon', async () => {
    await render(<RankPairChip pairKey="72o" testID="chip" />);

    expect(mockedRankIcon.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ rank: '7' }));
    expect(mockedRankIcon.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rank: '2' }));
    expect(mockedSuitednessIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suitedness: 'offsuit' }),
    );
  });

  it('gives a pocket pair chip one combined accessible label naming its rank twice', async () => {
    await render(<RankPairChip pairKey="AA" testID="chip" />);

    const chip = screen.getByTestId('chip');
    expect(chip.props.accessible).toBe(true);
    expect(chip.props.accessibilityLabel).toBe('ace ace pocket pair');
  });

  it('gives a suited chip one combined accessible label naming both ranks', async () => {
    await render(<RankPairChip pairKey="AKs" testID="chip" />);

    expect(screen.getByTestId('chip').props.accessibilityLabel).toBe('ace king suited');
  });

  it('gives an offsuit chip one combined accessible label naming both ranks', async () => {
    await render(<RankPairChip pairKey="72o" testID="chip" />);

    expect(screen.getByTestId('chip').props.accessibilityLabel).toBe('seven deuce offsuit');
  });
});
