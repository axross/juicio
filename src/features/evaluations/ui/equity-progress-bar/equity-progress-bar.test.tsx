// registers this project's real themes against the mocked
// `StyleSheet.configure` — see docs/conventions/testing.md and
// `../toast/toast.test.tsx`'s own matching import.
import '@/core/theme/unistyles';

import { StyleSheet as RNStyleSheet } from 'react-native';

import { render, screen } from '@testing-library/react-native';

import { lightTheme } from '@/core/theme/tokens';

import { EquityProgressBar } from './equity-progress-bar';

describe('<EquityProgressBar />', () => {
  it('fills the track to the given progress fraction', async () => {
    await render(<EquityProgressBar progress={0.42} testID="bar" />);

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.width).toBe('42%');
  });

  it('clamps a progress fraction below 0 to an empty fill', async () => {
    await render(<EquityProgressBar progress={-0.5} testID="bar" />);

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.width).toBe('0%');
  });

  it('clamps a progress fraction above 1 to a full fill', async () => {
    await render(<EquityProgressBar progress={1.5} testID="bar" />);

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.width).toBe('100%');
  });

  it('fills the track completely at progress 1', async () => {
    await render(<EquityProgressBar progress={1} testID="bar" />);

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.width).toBe('100%');
  });

  it('draws the fill in this project’s brand-exact lime accent, the same token the empty state’s own pill button reaches for', async () => {
    await render(<EquityProgressBar progress={0.5} testID="bar" />);

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.backgroundColor).toBe(lightTheme.colors.solid.accent.rest);
  });
});
