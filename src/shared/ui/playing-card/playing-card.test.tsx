import { render, screen } from '@testing-library/react-native';

// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `src/shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run
// before anything themed renders.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — this component's
// accessibility label is composed through `t()`
// (`../card-spoken-name.ts`), and `jest.setup.ts`'s dummy instance has no
// `handRanges` resources to resolve it against.
import '@/core/i18n';

import { lightTheme } from '@/core/theme/tokens';
import type { Card } from '@/shared/model/card';

import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';
import { PlayingCard } from './playing-card';

// this component imports `react-native-reanimated` directly
// (`animateEntrance`'s shared values), which reaches into
// `react-native-worklets`' native module on import — same reason
// `../bottom-sheet/bottom-sheet.test.tsx` needs this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// `RankIcon`/`SuitIcon` render to `react-native-svg` host components this
// project's test renderer has no query for by element type (RNTL 14 here
// exposes no `UNSAFE_getByType`-style query, and the raw host JSON packs a
// fill colour into a processed integer, not the hex string this component
// passes). mocking the seam PlayingCard actually owns — which colour it
// hands each icon — keeps this test independent of react-native-svg's
// rendering, per react-component-development's testability guidance on
// choosing a mocking seam so the component's real logic still runs.
jest.mock('./icons/rank-icon', () => ({ RankIcon: jest.fn(() => null) }));
jest.mock('./icons/suit-icon', () => ({ SuitIcon: jest.fn(() => null) }));

const mockedRankIcon = jest.mocked(RankIcon);
const mockedSuitIcon = jest.mocked(SuitIcon);

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TEN_CLUBS: Card = { rank: 'T', suit: 'c' };

// `react-native-unistyles/mocks` strips every `variants` block from a
// `StyleSheet.create` result and no-ops `useVariants` (its own
// `stripVariants`) — a real limitation of this project's test
// environment, not this component: the `selected` variant's background
// and border fill is unobservable from a component test, the same way
// `SegmentedTabs`'s selected-pill fill already is
// (`src/shared/ui/segmented-tabs/segmented-tabs.test.tsx` asserts
// `accessibilityState` instead, never a colour). the rank/suit colours
// below are plain component-body values rather than a stylesheet variant,
// so they stay observable through the mocked icons instead.

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

  it('gives an unselected card the neutral rank colour and its own suit colour', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />);

    // read the props object directly off the mock's last call, rather
    // than asserting the full argument list `toHaveBeenLastCalledWith`
    // would — React's calling convention for a function component (how
    // many arguments, what a trailing one holds) isn't this component's
    // contract to pin down.
    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ rank: 'A', color: lightTheme.colors.text.neutral.low }),
    );
    expect(mockedSuitIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ suit: 'h', color: lightTheme.suits.h }),
    );
  });

  it("draws the selected variant's rank and suit glyphs in the grid's own selected label colour", async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} selected testID="card" />);

    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.accent.low }),
    );
    const suitProps = mockedSuitIcon.mock.lastCall?.[0];
    expect(suitProps).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.accent.low }),
    );
    // selected overrides the suit's own colour — hearts' usual ruby never
    // reaches the icon once the card is marked selected.
    expect(suitProps?.color).not.toBe(lightTheme.suits.h);
  });

  it('renders the holeCardsPreview size at its own constants, unscaled', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="holeCardsPreview" scale={1} testID="card" />);

    const root = screen.getByTestId('card');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 40, height: 62, borderRadius: 6 })]),
    );
  });

  it('defaults an unselected card to the low-contrast rank tone', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />);

    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.neutral.low }),
    );
  });

  it("draws the high rank tone the hole-cards preview passes, without touching the suit's own colour", async () => {
    await render(
      <PlayingCard
        card={ACE_HEARTS}
        size="holeCardsPreview"
        scale={1}
        rankTone="high"
        testID="card"
      />,
    );

    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.neutral.high }),
    );
    expect(mockedSuitIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.suits.h }),
    );
  });

  it('ignores rankTone once the card is selected, keeping the selected rank colour', async () => {
    await render(
      <PlayingCard
        card={ACE_HEARTS}
        size="holeCardsPreview"
        scale={1}
        rankTone="high"
        selected
        testID="card"
      />,
    );

    expect(mockedRankIcon.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ color: lightTheme.colors.text.accent.low }),
    );
  });

  it('reads its plain spoken name and carries no disabled state when not unavailable', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />);

    const root = screen.getByTestId('card');
    expect(root.props.accessibilityLabel).toBe('ace of hearts');
    expect(root.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('names itself unavailable and carries a disabled accessibility state once unavailable', async () => {
    await render(<PlayingCard card={ACE_HEARTS} size="fan" scale={1} unavailable testID="card" />);

    const root = screen.getByTestId('card');
    // per docs/conventions/design-system.md's non-functional requirement,
    // this must not depend on colour or the slash alone — the label and
    // the accessibility state are what's asserted here, deliberately
    // never a resolved colour (react-native-unistyles/mocks strips every
    // `variants` block, so the dim opacity isn't observable from a test —
    // see docs/conventions/testing.md).
    expect(root.props.accessibilityLabel).toBe('ace of hearts, unavailable');
    expect(root.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('draws the diagonal slash only while unavailable', async () => {
    const { rerender } = await render(
      <PlayingCard card={ACE_HEARTS} size="fan" scale={1} testID="card" />,
    );

    expect(screen.queryByTestId('unavailable-slash')).toBeNull();

    await rerender(
      <PlayingCard card={ACE_HEARTS} size="fan" scale={1} unavailable testID="card" />,
    );

    expect(screen.getByTestId('unavailable-slash')).toBeTruthy();
  });
});
