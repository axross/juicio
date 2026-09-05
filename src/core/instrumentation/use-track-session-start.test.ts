import { renderHook } from '@testing-library/react-native';

import { trackEvent } from './analytics';
import { useTrackSessionStart } from './use-track-session-start';

jest.mock('./analytics', () => ({ trackEvent: jest.fn() }));

const mockedTrackEvent = jest.mocked(trackEvent);

describe('useTrackSessionStart', () => {
  beforeEach(() => {
    mockedTrackEvent.mockClear();
  });

  it('tracks a Session Started event once ready', () => {
    renderHook(() => useTrackSessionStart(true));

    expect(mockedTrackEvent).toHaveBeenCalledWith('Session Started', {});
  });

  it('does not track while not ready', () => {
    renderHook(() => useTrackSessionStart(false));

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('does not track twice for a re-render that leaves readiness unchanged', () => {
    const { rerender } = renderHook(() => useTrackSessionStart(true));

    mockedTrackEvent.mockClear();
    rerender({});

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('tracks exactly once when readiness resolves from false to true', () => {
    const { rerender } = renderHook(({ ready }) => useTrackSessionStart(ready), {
      initialProps: { ready: false },
    });

    expect(mockedTrackEvent).not.toHaveBeenCalled();

    rerender({ ready: true });

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).toHaveBeenCalledWith('Session Started', {});
  });
});
