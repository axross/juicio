// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `playing-card.test.tsx`'s own matching
// comment.
import '@/core/theme/unistyles';
// this component composes `PlayingCard`, which imports `../card-spoken-name.ts`'s
// `useTranslation('handRanges')` — see `playing-card.test.tsx`'s own
// matching import.
import '@/core/i18n';

import { render, screen } from '@testing-library/react-native';

import type { CardPair } from '../../model/card-pair';
import { HoleCardsPreview } from './hole-cards-preview';

// `PlayingCard` imports `react-native-reanimated` directly
// (`animateEntrance`'s shared values) which reaches into
// `react-native-worklets`' native module on import — see
// `playing-card.test.tsx`'s own matching comment for why this mock is
// needed even though this component itself never touches Reanimated.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

const HOLE_CARDS: CardPair = {
  first: { rank: 'A', suit: 'h' },
  second: { rank: 'T', suit: 'h' },
};

describe('<HoleCardsPreview />', () => {
  it('renders exactly two card faces', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} testID="preview" />);

    expect(screen.getByTestId('first-card')).toBeTruthy();
    expect(screen.getByTestId('second-card')).toBeTruthy();
  });

  it('rotates the first card −4° and the second +4°', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} testID="preview" />);

    const first = screen.getByTestId('first-card');
    const second = screen.getByTestId('second-card');

    // `PlayingCard`'s own root `style` is an array of several style
    // objects (`playing-card.tsx`'s own render body) — the caller-supplied
    // one this component passes, carrying `transform`, is one entry in it,
    // not the array's own shape.
    expect(first.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ transform: [{ rotate: '-4deg' }] })]),
    );
    expect(second.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ transform: [{ rotate: '4deg' }] })]),
    );
  });

  it('scales each card face to size / 80 — 0.8 at the row’s own 64-wide column', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} testID="preview" />);

    const first = screen.getByTestId('first-card');
    // `PlayingCard`'s own root style carries `width`/`height`/`borderRadius`
    // scaled from `HOLE_CARDS_PREVIEW_CARD` (40×62, radius 6) by this
    // component's derived scale — see `playing-card.test.tsx` for that
    // component's own scaling contract. `borderRadius` (6 × 0.8) is
    // asserted with `expect.closeTo`, not a literal `4.8`: IEEE 754
    // floating-point multiplication resolves that product to
    // `4.800000000000001`, not the exact decimal.
    expect(first.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 32, height: 49.6, borderRadius: expect.closeTo(4.8, 5) }),
      ]),
    );
  });

  it('sizes the root to size wide and the design’s own aspect ratio tall', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} testID="preview" />);

    const root = screen.getByTestId('preview');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 64 })]),
    );
    const heightEntry = (root.props.style as { height?: number }[]).find(
      (entry) => typeof entry?.height === 'number',
    );
    expect(heightEntry?.height).toBeCloseTo(51.7112, 3);
  });

  it('hides both card faces from a screen reader, since the row already carries one label', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} testID="preview" />);

    expect(screen.getByTestId('first-card').props.accessible).toBe(false);
    expect(screen.getByTestId('second-card').props.accessible).toBe(false);
  });

  it('renders no testID on either card when the caller passes none, keeping the preview opaque to that query', async () => {
    await render(<HoleCardsPreview holeCards={HOLE_CARDS} size={64} />);

    expect(screen.queryByTestId('first-card')).toBeNull();
    expect(screen.queryByTestId('second-card')).toBeNull();
  });
});
