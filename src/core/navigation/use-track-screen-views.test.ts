import { usePathname } from 'expo-router';
import { renderHook } from '@testing-library/react-native';

import { trackEvent } from '@/core/instrumentation/analytics';

import { useTrackScreenViews } from './use-track-screen-views';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));
jest.mock('@/core/instrumentation/analytics', () => ({ trackEvent: jest.fn() }));

const mockedUsePathname = jest.mocked(usePathname);
const mockedTrackEvent = jest.mocked(trackEvent);

describe('useTrackScreenViews', () => {
  beforeEach(() => {
    mockedTrackEvent.mockClear();
  });

  it('tracks a Screen Viewed event for a recognized pathname', () => {
    mockedUsePathname.mockReturnValue('/history');

    renderHook(() => useTrackScreenViews(true));

    expect(mockedTrackEvent).toHaveBeenCalledWith('Screen Viewed', { screenName: 'History' });
  });

  it('tracks again on navigating to a different recognized pathname', () => {
    mockedUsePathname.mockReturnValue('/');
    const { rerender } = renderHook(() => useTrackScreenViews(true));

    mockedTrackEvent.mockClear();
    mockedUsePathname.mockReturnValue('/settings');
    rerender({});

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).toHaveBeenCalledWith('Screen Viewed', { screenName: 'Settings' });
  });

  it('does not track twice for a re-render that leaves the pathname unchanged', () => {
    mockedUsePathname.mockReturnValue('/presets');
    const { rerender } = renderHook(() => useTrackScreenViews(true));

    mockedTrackEvent.mockClear();
    rerender({});

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('does not track a pathname this app does not recognize', () => {
    mockedUsePathname.mockReturnValue('/not-a-real-route');

    renderHook(() => useTrackScreenViews(true));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('does not track a recognized pathname while not ready', () => {
    mockedUsePathname.mockReturnValue('/history');

    renderHook(() => useTrackScreenViews(false));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('tracks the current pathname once when readiness resolves from false to true', () => {
    mockedUsePathname.mockReturnValue('/history');
    const { rerender } = renderHook(({ ready }) => useTrackScreenViews(ready), {
      initialProps: { ready: false },
    });

    expect(mockedTrackEvent).not.toHaveBeenCalled();

    rerender({ ready: true });

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).toHaveBeenCalledWith('Screen Viewed', { screenName: 'History' });
  });
});
