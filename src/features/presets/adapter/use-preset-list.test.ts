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

const mockedReportError = jest.mocked(reportError);
const mockedListPresets = jest.mocked(listPresets);

describe('usePresetList()', () => {
  afterEach(() => {
    // only `presets` — the one table this file's happy-path case writes to
    // (seeded with no tag selection, so `preset_tags` is never touched).
    db.delete(presets).run();
    mockedReportError.mockClear();
    mockedListPresets.mockClear();
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
});
