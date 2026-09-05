// registers this project's real themes against the mocked
// `StyleSheet.configure` — see docs/conventions/testing.md and
// `../toast/toast.test.tsx`'s own matching import.
import '@/core/theme/unistyles';

import { StyleSheet as RNStyleSheet } from 'react-native';

import { render, screen } from '@testing-library/react-native';

import { lightTheme } from '@/core/theme/tokens';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import { EquityProgressBar } from './equity-progress-bar';

// this component reads its own progress off `useEquityEvaluationStore`
// directly rather than taking a `progress` prop, so it needs
// real Reanimated hooks — `useSharedValue`/`useAnimatedStyle` — to resolve
// synchronously under Jest. `react-native-reanimated/mock` itself reaches
// into `react-native-worklets`' native module at import time (confirmed
// directly: omitting this mock throws inside
// `NativeWorklets.native.ts`'s own `loadUnpackers`), the same reason
// `../player-row/player-row.test.tsx`'s own matching comment gives for its
// own pair of mocks — so both are needed here too, even though this
// component itself never imports `react-native-gesture-handler`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// counts every write this component's own subscription callback makes to
// `fillFraction.value` (`./equity-progress-bar.tsx`) — needed so the
// "ignores a store update that leaves progress unchanged" test below can
// assert that the subscription's own early-return guard actually ran,
// rather than merely reading back a number that happens to match. the
// real mock's own `useSharedValue` (`react-native-reanimated/src/mock.ts`)
// returns a `Proxy` whose `value` is a plain data property, not an
// accessor pair, so `jest.spyOn(sharedValue, 'value', 'set')` cannot spy
// it — confirmed directly: `Object.getOwnPropertyDescriptor` on that
// Proxy returns a plain `{ value, writable, enumerable, configurable }`
// descriptor with no `get`/`set` functions for `jest.spyOn` to find.
// wrapping the real mock's own returned shared value in a *second* Proxy,
// whose own `set` trap records the write here and then performs it for
// real via `Reflect.set`, is what makes a write observable at all without
// touching what the value itself ends up holding — every other test in
// this file still reads the result back through `fillWidth()` exactly as
// before, since every actual assignment still happens.
const mockFillFractionSet = jest.fn();

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actualMock = require('react-native-reanimated/mock');
  return {
    __esModule: true,
    ...actualMock,
    useSharedValue: (init: unknown) => {
      const sharedValue = actualMock.useSharedValue(init);
      return new Proxy(sharedValue, {
        set(target, prop, newValue) {
          if (prop === 'value') {
            mockFillFractionSet();
          }
          return Reflect.set(target, prop, newValue);
        },
      });
    },
  };
});

beforeEach(() => {
  // this store is module-scope and shared across every test file that
  // imports it (see `../player-row/player-row.test.tsx`'s own matching
  // comment) — reset directly so a progress value set by one test never
  // leaks into the next.
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
  mockFillFractionSet.mockClear();
});

function renderBar() {
  return render(<EquityProgressBar testID="bar" />);
}

function fillWidth(): unknown {
  return RNStyleSheet.flatten(screen.getByTestId('fill').props.style).width;
}

describe('<EquityProgressBar />', () => {
  it("fills the track to the store's own progress fraction, read at mount rather than from a prop", async () => {
    useEquityEvaluationStore.setState({ progress: 0.42 });

    await renderBar();

    expect(fillWidth()).toBe('42%');
  });

  it('clamps a progress fraction below 0 to an empty fill', async () => {
    useEquityEvaluationStore.setState({ progress: -0.5 });

    await renderBar();

    expect(fillWidth()).toBe('0%');
  });

  it('clamps a progress fraction above 1 to a full fill', async () => {
    useEquityEvaluationStore.setState({ progress: 1.5 });

    await renderBar();

    expect(fillWidth()).toBe('100%');
  });

  it('fills the track completely at progress 1', async () => {
    useEquityEvaluationStore.setState({ progress: 1 });

    await renderBar();

    expect(fillWidth()).toBe('100%');
  });

  it('draws the fill in this project’s brand-exact lime accent, the same token the add-player FAB reaches for', async () => {
    await renderBar();

    const fillStyle = RNStyleSheet.flatten(screen.getByTestId('fill').props.style);
    expect(fillStyle.backgroundColor).toBe(lightTheme.colors.solid.accent.rest);
  });

  it('writes a later store progress update into its own shared value, through its subscription — not through a re-rendered prop', async () => {
    const { rerender } = await renderBar();
    mockFillFractionSet.mockClear();

    useEquityEvaluationStore.setState({ progress: 0.75 });

    // this project's Reanimated mock is a plain, non-reactive
    // `useSharedValue` Proxy that only recomputes `useAnimatedStyle`'s
    // returned style when this component's own function body runs again
    // (docs/conventions/testing.md) — unlike a real device, where
    // Reanimated pushes a shared-value change straight to the native view
    // with no React re-render at all, which is this component's actual,
    // intended behaviour and is not observable from this suite. forcing a
    // re-render here (with the identical props) is what makes the
    // subscription's own write to `fillFraction.value` — this component's
    // own configuration of the library, which docs/conventions/testing.md's
    // "What a Unit Test Asserts About a Third-Party Library" section says a
    // test MAY assert — observable at all; it does not assert that the real
    // update happens with zero re-renders, which no test here can prove.
    await rerender(<EquityProgressBar testID="bar" />);

    expect(fillWidth()).toBe('75%');
    // the subscription actually wrote once for this genuine progress
    // change — the companion assertion to the "ignores..." test below,
    // which asserts the opposite count for a progress-unchanged tick; see
    // `mockFillFractionSet`'s own doc comment above for why this, not
    // `fillWidth()` alone, is what actually distinguishes "wrote" from
    // "skipped the write".
    expect(mockFillFractionSet).toHaveBeenCalledTimes(1);
  });

  it('ignores a store update that leaves progress unchanged (a results/status/impossibleSignal-only tick)', async () => {
    useEquityEvaluationStore.setState({ progress: 0.3 });
    const { rerender } = await renderBar();
    mockFillFractionSet.mockClear();

    useEquityEvaluationStore.setState((state) => ({
      // `distribution` is present only because `EspadaEquityPlayerResult`
      // requires it — this test's own assertion reads the progress bar's
      // fill, never this result's distribution.
      results: {
        ...state.results,
        'player-1': { win: 0.5, tie: 0, equity: 0.5, distribution: [] },
      },
    }));
    await rerender(<EquityProgressBar testID="bar" />);

    // still 30% — but reading the fill back this way alone cannot tell
    // "the subscription's own guard returned early" apart from "the
    // subscription reassigned `fillFraction.value` to the same 0.3 again"
    // (0.3 written unconditionally, with no guard at all, would still
    // read back as '30%'). the assertion below is what actually
    // distinguishes them: the results-only update above never touched
    // `progress`, so this component's own subscription listener MUST have
    // returned early rather than writing at all — see `mockFillFractionSet`'s
    // own doc comment above.
    expect(fillWidth()).toBe('30%');
    expect(mockFillFractionSet).not.toHaveBeenCalled();
  });
});
