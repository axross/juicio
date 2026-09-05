import { renderHook, waitFor } from '@testing-library/react-native';

import { db } from '@/core/db/client';
import { presets } from '@/core/db/schema';
import { reportError } from '@/core/instrumentation/report-error';

import { listPresets } from './preset-storage';
import { usePresetList } from './use-preset-list';

// mirrors `@/features/history/adapter/history-entries-store.test.ts`'s own
// mock: `reportError` reaches `@sentry/react-native` for real, which this
// suite has no native module to run against under Jest.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// wraps `listPresets`'s own real implementation in a `jest.fn()` —
// call-through, never a stub, for every case except this file's own
// rejection test below — mirroring
// `@/features/evaluations/ui/player-list/player-list.test.tsx`'s identical
// `PlayerRow` mock. `usePresetList` imports `listPresets` before any test
// body runs, so the spy has to be installed at `jest.mock`'s own
// hoisted-above-every-import factory, not later inside a test.
jest.mock('./preset-storage', () => {
  const actual: typeof import('./preset-storage') = jest.requireActual('./preset-storage');
  return { __esModule: true, ...actual, listPresets: jest.fn(actual.listPresets) };
});

// `useFocusEffect` needs a real navigator context this file's own bare
// `renderHook()` mounts none of — this project carries no direct
// `@react-navigation/native` dependency to reach for a lighter test double
// either (see `use-preset-list.ts`'s own doc comment). Mocked here to the
// two documented cases this file actually exercises: running its effect
// immediately once, on the first render — the real hook's own "the screen
// is already focused" case, true here since nothing in this file ever
// simulates losing focus — and again whenever a test calls
// `mockSimulateRefocus()`, which imitates the Presets tab regaining focus,
// cleaning up the previous call first exactly as the real hook does before
// firing the next one. Referenced identifiers are all named with a leading
// `mock` (Jest's own out-of-scope-variable rule for a module factory), and
// `react`'s `useEffect` is required lazily inside the factory rather than
// imported at the top of this file, for the same reason.
// `usePresetList`'s own effect (`use-preset-list.ts`) always returns a real
// cleanup function, never an implicit `undefined` — typed here as `() =>
// (() => void)` rather than matching `expo-router`'s own wider
// `EffectCallback` signature, since this mock only ever stands in for this
// one caller's own shape.
let mockCapturedEffect: (() => () => void) | undefined;
let mockCapturedCleanup: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    mockCapturedEffect = effect;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect: mockUseEffect } = require('react');
    mockUseEffect(() => {
      mockCapturedCleanup = effect();
      return () => {
        mockCapturedCleanup?.();
      };
    }, []);
  },
}));

function mockSimulateRefocus() {
  mockCapturedCleanup?.();
  mockCapturedCleanup = mockCapturedEffect?.();
}

const mockedReportError = jest.mocked(reportError);
const mockedListPresets = jest.mocked(listPresets);

describe('usePresetList()', () => {
  afterEach(() => {
    // only `presets` — the one table this file's happy-path case writes to
    // (seeded with no tag selection, so `preset_tags` is never touched).
    db.delete(presets).run();
    mockedReportError.mockClear();
    mockedListPresets.mockClear();
    mockCapturedEffect = undefined;
    mockCapturedCleanup = undefined;
  });

  it('starts in the loading state', async () => {
    const { result } = renderHook(() => usePresetList());

    expect(result.current).toEqual({ status: 'loading' });

    // lets the real `listPresets()` call this render kicked off settle
    // before the test ends, so its `setState` lands inside this test's own
    // `act()` scope rather than warning against whichever test runs next.
    await waitFor(() => expect(result.current.status).toBe('loaded'));
  });

  it('resolves to the loaded state with every stored Preset, once listPresets() settles', async () => {
    // seeded directly through Drizzle primitives, not through
    // `createPreset()` — docs/conventions/testing.md's Database-Backed Tests
    // section: pre-existing state a test needs is seeded this way, never by
    // calling the unit under test.
    db.insert(presets).values({ name: 'Untitled', handRange: '[]' }).run();

    const { result } = renderHook(() => usePresetList());

    await waitFor(() => expect(result.current.status).toBe('loaded'));

    const expected = await listPresets();
    expect(result.current).toEqual({ status: 'loaded', presets: expected });
    expect(mockedReportError).not.toHaveBeenCalled();
  });

  it('resolves to the loaded state with an empty list when no Preset is stored', async () => {
    const { result } = renderHook(() => usePresetList());

    await waitFor(() => expect(result.current.status).toBe('loaded'));

    expect(result.current).toEqual({ status: 'loaded', presets: [] });
  });

  it('reports the failure and resolves to the error state when listPresets() rejects', async () => {
    const error = new Error('boom');
    mockedListPresets.mockRejectedValueOnce(error);

    const { result } = renderHook(() => usePresetList());

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current).toEqual({ status: 'error' });
    expect(mockedReportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ feature: 'presets' }),
        extra: expect.objectContaining({ operation: 'listPresets' }),
      }),
    );
  });

  it('does not update state after unmount, once listPresets() settles late', async () => {
    let resolveListPresets!: () => void;
    mockedListPresets.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListPresets = () => resolve([]);
        }),
    );

    const { result, unmount } = renderHook(() => usePresetList());
    unmount();
    resolveListPresets();
    // flush the microtask queue the resolved promise's own `.then()` runs
    // on: if the hook failed to guard its post-unmount `setState`, this
    // would throw React's own "state update on an unmounted component"
    // warning/error instead of resolving quietly.
    await Promise.resolve();

    expect(result.current).toEqual({ status: 'loading' });
  });

  // a preset saved or changed in the editor shows up on returning to the
  // Presets tab without a remount.
  it('reloads when the Presets tab regains focus', async () => {
    const { result } = renderHook(() => usePresetList());
    await waitFor(() => expect(result.current).toEqual({ status: 'loaded', presets: [] }));

    db.insert(presets).values({ name: 'BTN Open', handRange: '[]' }).run();
    mockedListPresets.mockClear();

    mockSimulateRefocus();

    // waits for the reload to actually land in `result.current`, not merely
    // for `listPresets()` to have been called — the mocked call resolving
    // is itself async, so asserting right after the call count alone would
    // race the `setState` it drives. This hook's own `status` stays
    // `'loaded'` throughout a refocus reload (its own doc comment: it never
    // resets to `'loading'` first), so `presets` — the one field the reload
    // actually changes here — is what this waits on instead.
    await waitFor(() => {
      if (result.current.status !== 'loaded') {
        throw new Error(`expected 'loaded', got '${result.current.status}'`);
      }
      expect(result.current.presets).toHaveLength(1);
    });

    expect(mockedListPresets).toHaveBeenCalledTimes(1);
    const expected = await listPresets();
    expect(result.current).toEqual({ status: 'loaded', presets: expected });
    expect(expected).toHaveLength(1);
  });

  it('reports a rejection on a refocus reload the same way it does on the first load', async () => {
    const { result } = renderHook(() => usePresetList());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    const error = new Error('boom');
    mockedListPresets.mockRejectedValueOnce(error);

    mockSimulateRefocus();

    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
    expect(mockedReportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ extra: expect.objectContaining({ operation: 'listPresets' }) }),
    );
  });

  it('cancels a still-pending reload once the tab loses focus again before it resolves', async () => {
    const { result } = renderHook(() => usePresetList());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    let resolveReload!: () => void;
    mockedListPresets.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReload = () => resolve([]);
        }),
    );
    mockSimulateRefocus();
    // blurs (running the previous focus's own cleanup) before the pending
    // reload above ever resolves — the same "cancelled" guard the unmount
    // test above already exercises, triggered here by a focus-effect
    // cleanup instead of a component unmount.
    mockCapturedCleanup?.();
    resolveReload();
    await Promise.resolve();

    expect(result.current.status).toBe('loaded');
  });
});
