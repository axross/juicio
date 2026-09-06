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

  // proves docs/conventions/component-styling.md's "The Caller's Style
  // Lands on the JSX Root" is real for this component's own root `View`,
  // not merely type-level — this is what a second caller
  // (`../equity-breakdown-blocker-score/equity-breakdown-blocker-score.tsx`)
  // ends this component's own file-private exemption from that rule.
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(<RankPairChip pairKey="AA" testID="chip" style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('chip');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this component's own chip styling, which a caller
    // replacing rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('borderRadius');
  });

  // proves docs/conventions/component-contracts.md's "Propagate Rest Props
  // to the Root Child Element" is real for this component's own root
  // `View`, not merely type-level.
  it('propagates a prop this project names nothing for, straight through to its own root', async () => {
    await render(<RankPairChip pairKey="AA" testID="chip" accessibilityHint="a rank pair" />);

    expect(screen.getByTestId('chip').props.accessibilityHint).toBe('a rank pair');
  });

  // this component's own `RankPairChip` doc comment states the ordering
  // choice this proves: `accessible`/`accessibilityLabel` are load-bearing
  // wiring (the composed spoken name this component exists to build), so
  // they spread *after* the rest props rather than before, and a caller
  // passing either cannot silently override the computed one.
  it('keeps its own computed accessibilityLabel even if a rest prop tries to override it', async () => {
    await render(
      <RankPairChip pairKey="AA" testID="chip" accessibilityLabel="something else entirely" />,
    );

    expect(screen.getByTestId('chip').props.accessibilityLabel).toBe('ace ace pocket pair');
  });
});
