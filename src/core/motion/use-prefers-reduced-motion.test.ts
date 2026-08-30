import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { EmitterSubscription } from 'react-native';
import { AccessibilityInfo } from 'react-native';

import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

// a bare `{ remove }` satisfies this hook's own use of what
// `addEventListener` returns, but not `EmitterSubscription`'s full shape
// (`emitter`, `listener`, `context`, `eventType`, and one more) — cast
// rather than fabricated in full, since nothing here reads those fields.
function fakeSubscription(remove: () => void): EmitterSubscription {
  return { remove } as unknown as EmitterSubscription;
}

describe('usePrefersReducedMotion()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts false and resolves to what the OS setting reports', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(fakeSubscription(jest.fn()));

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false when the OS setting is off', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(fakeSubscription(jest.fn()));

    const { result } = renderHook(() => usePrefersReducedMotion());

    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('updates live when the OS setting changes mid-session', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    let changeHandler: ((enabled: boolean) => void) | null = null;
    // `addEventListener` is overloaded per event name (`AccessibilityInfo.d.ts`),
    // and `jest.spyOn` types a mocked overloaded method against its last
    // declared overload — cast the whole implementation rather than fight
    // that mismatch, since this test only ever calls it for
    // `reduceMotionChanged`.
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      handler: (enabled: boolean) => void,
    ) => {
      if (event === 'reduceMotionChanged') {
        changeHandler = handler;
      }
      return fakeSubscription(jest.fn());
    }) as typeof AccessibilityInfo.addEventListener);

    const { result } = renderHook(() => usePrefersReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      changeHandler?.(true);
    });

    expect(result.current).toBe(true);
  });

  it('removes its subscription on unmount', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(fakeSubscription(remove));

    const { unmount } = renderHook(() => usePrefersReducedMotion());
    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
