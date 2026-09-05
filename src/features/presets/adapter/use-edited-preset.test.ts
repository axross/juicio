import { renderHook, waitFor } from '@testing-library/react-native';

import { reportError } from '@/core/instrumentation/report-error';

import { PresetNotFoundError, type Preset } from '../model/preset';
import { getPreset } from './preset-storage';
import { useEditedPreset } from './use-edited-preset';

// mirrors `./use-preset-list.test.ts`'s own mock: `reportError` reaches
// `@sentry/react-native` for real, which this suite has no native module to
// run against under Jest.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// wraps `getPreset`'s own real implementation in a `jest.fn()` — call-through
// for every case except a rejection test, mirroring
// `./use-preset-list.test.ts`'s identical `listPresets` mock.
jest.mock('./preset-storage', () => {
  const actual: typeof import('./preset-storage') = jest.requireActual('./preset-storage');
  return { __esModule: true, ...actual, getPreset: jest.fn(actual.getPreset) };
});

const mockedReportError = jest.mocked(reportError);
const mockedGetPreset = jest.mocked(getPreset);

const NO_TAGS: Preset['tags'] = { position: [], players: [], stack: [], action: [] };

function preset(id: number, name: string): Preset {
  return { id, name, handRange: new Set(['AA']), tags: NO_TAGS };
}

describe('useEditedPreset()', () => {
  afterEach(() => {
    mockedReportError.mockClear();
    mockedGetPreset.mockClear();
  });

  it('resolves to skipped immediately when presetId is undefined — create mode needs no fetch', () => {
    const { result } = renderHook(() => useEditedPreset(undefined));

    expect(result.current).toEqual({ status: 'skipped' });
    expect(mockedGetPreset).not.toHaveBeenCalled();
  });

  it('starts in the loading state when presetId is given', () => {
    mockedGetPreset.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useEditedPreset(7));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('resolves to the loaded state with the fetched preset', async () => {
    mockedGetPreset.mockResolvedValueOnce(preset(7, 'BTN Open'));

    const { result } = renderHook(() => useEditedPreset(7));

    await waitFor(() => expect(result.current.status).toBe('loaded'));

    expect(result.current).toEqual({ status: 'loaded', preset: preset(7, 'BTN Open') });
    expect(mockedGetPreset).toHaveBeenCalledWith(7);
  });

  it('reports the failure and resolves to load-failed when getPreset rejects', async () => {
    const error = new Error('boom');
    mockedGetPreset.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useEditedPreset(7));

    await waitFor(() => expect(result.current.status).toBe('load-failed'));

    expect(result.current).toEqual({ status: 'load-failed' });
    expect(mockedReportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ feature: 'presets' }),
        extra: expect.objectContaining({ operation: 'getPreset', presetId: 7 }),
      }),
    );
  });

  // issue #177's own Assumptions: a since-deleted preset resolves the same
  // load-failed state as any other rejection — `PresetNotFoundError` is not
  // special-cased.
  it('resolves to load-failed for a preset id that no longer exists', async () => {
    mockedGetPreset.mockRejectedValueOnce(new PresetNotFoundError(7));

    const { result } = renderHook(() => useEditedPreset(7));

    await waitFor(() => expect(result.current.status).toBe('load-failed'));

    expect(result.current).toEqual({ status: 'load-failed' });
  });

  it('does not update state after unmount, once getPreset settles late', async () => {
    let resolveGetPreset!: () => void;
    mockedGetPreset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGetPreset = () => resolve(preset(7, 'BTN Open'));
        }),
    );

    const { result, unmount } = renderHook(() => useEditedPreset(7));
    unmount();
    resolveGetPreset();
    // flush the microtask queue the resolved promise's own `.then()` runs
    // on — see `./use-preset-list.test.ts`'s identical unmount test for why.
    await Promise.resolve();

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('re-fetches when presetId changes', async () => {
    mockedGetPreset.mockResolvedValueOnce(preset(1, 'A')).mockResolvedValueOnce(preset(2, 'B'));

    const { result, rerender } = renderHook(({ id }) => useEditedPreset(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'loaded', preset: preset(1, 'A') }),
    );

    rerender({ id: 2 });

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'loaded', preset: preset(2, 'B') }),
    );
    expect(mockedGetPreset).toHaveBeenCalledTimes(2);
  });
});
