import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Holding } from '@/features/hand-ranges/model/holding';

import type { Player } from '../../model/player';

import { PlayerRowContent } from './player-row-content';

// this component's own `HoleCardsPreview` import reaches
// `../../../../shared/ui/card-fan-geometry.ts`, which reaches
// `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx` for its own
// `SIDE_PADDING` constant — and that module reaches into
// `react-native-worklets`' native module on import, the same reason
// `../player-row/player-row.test.tsx`'s own matching comment gives.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const HAND_RANGE_PLAYER: Player = {
  id: 'player-1',
  number: 1,
  holding: { kind: 'handRange', rankPairs: new Set(['AA']) } as Holding,
};

describe('<PlayerRowContent />', () => {
  it('renders the label, subtitle, and result figure it is handed', async () => {
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron
        testID="content"
      />,
    );

    expect(screen.getByTestId('label').props.children).toBe('Player 1');
    expect(screen.getByTestId('subtitle').props.children).toBe('6 combos');
    expect(screen.getByTestId('result').props.children).toBe('0%');
  });

  it('renders the chevron only when showChevron is true, with the column always present', async () => {
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron={false}
        testID="content"
      />,
    );

    expect(screen.getByTestId('chevron-column').children).toHaveLength(0);
  });

  it('renders the preview as a Pressable only when onPreviewPress is given, and fires it on press', async () => {
    const onPreviewPress = jest.fn();
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron={false}
        onPreviewPress={onPreviewPress}
        testID="content"
      />,
    );

    await fireEvent.press(screen.getByTestId('preview'));

    expect(onPreviewPress).toHaveBeenCalledTimes(1);
  });

  it('renders the preview as inert when onPreviewPress is omitted', async () => {
    const onPreviewPress = jest.fn();
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron={false}
        testID="content"
      />,
    );

    // a plain `View` has no press handling at all — pressing it must not
    // somehow reach a handler this render never passed in.
    await fireEvent.press(screen.getByTestId('preview'));

    expect(onPreviewPress).not.toHaveBeenCalled();
  });

  it('fires onDetailPress when the detail region is pressed, and never onPreviewPress', async () => {
    const onPreviewPress = jest.fn();
    const onDetailPress = jest.fn();
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron
        onPreviewPress={onPreviewPress}
        onDetailPress={onDetailPress}
        testID="content"
      />,
    );

    await fireEvent.press(screen.getByTestId('detail'));

    expect(onDetailPress).toHaveBeenCalledTimes(1);
    expect(onPreviewPress).not.toHaveBeenCalled();
  });

  it('hides both the preview and the detail region from a screen reader', async () => {
    await render(
      <PlayerRowContent
        player={HAND_RANGE_PLAYER}
        label="Player 1"
        subtitle="6 combos"
        resultLabel="0%"
        showChevron
        onPreviewPress={jest.fn()}
        onDetailPress={jest.fn()}
        testID="content"
      />,
    );

    expect(screen.getByTestId('preview').props.accessible).toBe(false);
    expect(screen.getByTestId('detail').props.accessible).toBe(false);
  });
});
