import { render, screen } from '@testing-library/react-native';

// registers this project's real themes against the mocked
// `StyleSheet.configure` — see
// `src/shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — this component's own
// accessibility label is now composed through `t()` (`./card-spoken-name.ts`),
// and `jest.setup.ts`'s own dummy instance has no `handRanges` resources to
// resolve it against.
import '@/core/i18n';

import { lightTheme } from '@/core/theme/tokens';

import type { Card } from '../model/card';
import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';
import { PlayingCard } from './playing-card';

// `RankIcon`/`SuitIcon` render to `react-native-svg` host components this
// project's test renderer has no query for by element type (RNTL 14 here
// exposes no `UNSAFE_getByType`-style query, and the raw host JSON packs a
// fill colour into a processed integer, not the hex string this component
// passes). mocking the seam PlayingCard actually owns — which colour it
// hands each icon — keeps this test independent of react-native-svg's own
// rendering, per react-component-development's testability guidance on
// choosing a mocking seam so the component's real logic still runs.
jest.mock('./icons/rank-icon', () => ({ RankIcon: jest.fn(() => null) }));
jest.mock('./icons/suit-icon', () => ({ SuitIcon: jest.fn(() => null) }));

const mockedRankIcon = jest.mocked(RankIcon);
const mockedSuitIcon = jest.mocked(SuitIcon);

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TEN_CLUBS: Card = { rank: 'T', suit: 'c' };

// `react-native-unistyles/mocks` strips every `variants` block from a
// `StyleSheet.create` result and no-ops `useVariants` (see its own
// `stripVariants`) — a real limitation of this project's test
// environment, not this component: the `taken` variant's background
// fill is unobservable from a component test the same way
// `SegmentedTabs`'s own selected-pill fill already is
// (`src/shared/ui/segmented-tabs/segmented-tabs.test.tsx` asserts
// `accessibilityState` instead, never a colour). the rank/suit colours
// below are plain component-body values rather than a stylesheet
// variant, so they stay observable through the mocked icons instead.

beforeEach(() => {
  mockedRankIcon.mockClear();
  mockedSuitIcon.mockClear();
});

describe('<PlayingCard />', () => {
  it('renders the fan size at the card-fan-geometry constants, unscaled', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />);

    const root = screen.getByTestId('card');
    expect(root.props.accessibilityLabel).toBe('ace of hearts');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 40, height: 62, borderRadius: 6 })]),
    );
  });

  it('renders the preview size at its own, larger constants', async () => {
    await render(<PlayingCard card={TEN_CLUBS} size="preview" scale={1} testID="card" />);

    const root = screen.getByTestId('card');
    expect(root.props.accessibilityLabel).toBe('ten of clubs');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 48, height: 75, borderRadius: 8 })]),
    );
  });

  it('scales every dimension by the scale prop', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={2} testID="card" />);

    const root = screen.getByTestId('card');
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 80, height: 124, borderRadius: 12 }),
      ]),
    );
  });

  it('gives an untaken card the neutral rank colour and its own suit colour', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />);

    // read the props object directly off the mock's last call, rather
    // than asserting the full argument list `toHaveBeenLastCalledWith`
    // would — React's own calling convention for a function component
    // (how many arguments, what a trailing one holds) is not this
    // component's contract to pin down.
    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ rank: 'A', color: lightTheme.colors.text.neutral.low }),
    );
    expect(mockedSuitIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suit: 'h', color: lightTheme.suits.h }),
    );
  });

  it("draws the taken variant's rank and suit glyphs in the grid's own selected label colour", async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} taken testID="card" />);

    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.accent.low }),
    );
    const suitProps = mockedSuitIcon.mock.lastCall?.[0];
    expect(suitProps).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.accent.low }),
    );
    // taken overrides the suit's own colour — hearts' usual ruby never
    // reaches the icon once the card is marked taken.
    expect(suitProps?.color).not.toBe(lightTheme.suits.h);
  });
});
