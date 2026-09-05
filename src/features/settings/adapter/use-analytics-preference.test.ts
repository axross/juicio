import { act, renderHook } from '@testing-library/react-native';

import { setAnalyticsEnabled } from '@/core/instrumentation/analytics';

import {
  setAnalyticsPreference,
  useAnalyticsPreference,
  useAnalyticsPreferenceStore,
} from './use-analytics-preference';

jest.mock('@/core/instrumentation/analytics', () => ({ setAnalyticsEnabled: jest.fn() }));

const mockedSetAnalyticsEnabled = jest.mocked(setAnalyticsEnabled);

describe('useAnalyticsPreference / setAnalyticsPreference', () => {
  beforeEach(() => {
    mockedSetAnalyticsEnabled.mockClear();
    useAnalyticsPreferenceStore.setState({ enabled: true });
  });

  it('defaults to true (enabled)', () => {
    const { result } = renderHook(() => useAnalyticsPreference());

    expect(result.current).toBe(true);
  });

  it('updates the shared store and pushes the value into the analytics wrapper', () => {
    const { result } = renderHook(() => useAnalyticsPreference());

    act(() => {
      setAnalyticsPreference(false);
    });

    expect(result.current).toBe(false);
    expect(mockedSetAnalyticsEnabled).toHaveBeenCalledWith(false);
  });

  it('turns back on', () => {
    act(() => {
      setAnalyticsPreference(false);
      setAnalyticsPreference(true);
    });

    expect(mockedSetAnalyticsEnabled).toHaveBeenLastCalledWith(true);
  });
});
