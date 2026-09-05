import { act, renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import type { EmitterSubscription } from 'react-native';

import { useKeyboardVisible } from './use-keyboard-visible';

type KeyboardEventHandler = () => void;

// the mock listener a test hands back never needs to be a real
// `EmitterSubscription` — only its `remove()` matters here, which is all
// `useKeyboardVisible` ever calls on it — so every mock listener below
// takes this shortcut through `unknown` rather than constructing the
// emitter/listener/context fields a real one carries.
function mockListener(remove: () => void = jest.fn()): EmitterSubscription {
  return { remove } as unknown as EmitterSubscription;
}

function mockAddListener(): KeyboardEventHandler[] {
  const handlers: KeyboardEventHandler[] = [];

  jest.spyOn(Keyboard, 'addListener').mockImplementation((_eventName, handler) => {
    handlers.push(handler as KeyboardEventHandler);
    return mockListener();
  });

  return handlers;
}

describe('useKeyboardVisible()', () => {
  it('returns false initially', () => {
    mockAddListener();

    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toBe(false);
  });

  it('flips to true on a real show event and back to false on a real hide event', () => {
    // the hook subscribes to its show event first, then its hide event
    // (`use-keyboard-visible.ts`'s own registration order), so the two
    // captured handlers are addressable by that fixed position regardless
    // of which platform's event names this file's default test platform
    // resolves to.
    const handlers = mockAddListener();

    const { result } = renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);

    act(() => handlers[0]());
    expect(result.current).toBe(true);

    act(() => handlers[1]());
    expect(result.current).toBe(false);
  });

  it('removes both subscriptions on unmount', () => {
    const removeShow = jest.fn();
    const removeHide = jest.fn();
    jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementationOnce(() => mockListener(removeShow))
      .mockImplementationOnce(() => mockListener(removeHide));

    const { unmount } = renderHook(() => useKeyboardVisible());
    unmount();

    expect(removeShow).toHaveBeenCalledTimes(1);
    expect(removeHide).toHaveBeenCalledTimes(1);
  });

  describe('platform-specific event names', () => {
    it('subscribes to the will-prefixed pair on iOS', () => {
      expect(eventNamesRegisteredOn('ios')).toEqual(['keyboardWillShow', 'keyboardWillHide']);
    });

    it('subscribes to the did-prefixed pair on Android', () => {
      expect(eventNamesRegisteredOn('android')).toEqual(['keyboardDidShow', 'keyboardDidHide']);
    });
  });
});

/**
 * mounts a fresh copy of the hook under the given `Platform.OS`, and
 * returns the event names it subscribed with. `SHOW_EVENT`/`HIDE_EVENT` in
 * `use-keyboard-visible.ts` are computed once at that module's own top
 * level, so observing the Android pair needs a fresh import of the module
 * taken *after* `Platform.OS` changes — flipping the constant on an
 * already-imported copy would not do it.
 *
 * `jest.isolateModules` gives that fresh import its own module registry,
 * but rendering it through the already-loaded `@testing-library/react-native`
 * (and the `react` copy that library wired its renderer to) throws an
 * invalid-hook-call error: the isolated hook and the outer renderer would be
 * running two different `react` instances, and React rejects a hook call
 * whose dispatcher was never set on that instance.
 * Requiring `react` and `react-test-renderer` inside the same isolated
 * registry as the hook keeps all three consistent with each other, at the
 * cost of driving the render with `react-test-renderer` directly instead of
 * `renderHook`. `isolateModules` needs synchronous `require`, not a
 * top-level `import`, to land the fresh copies inside its sandbox — a
 * dynamic `import()` fails here with "invoked without
 * --experimental-vm-modules", which this project's CommonJS Jest transform
 * doesn't enable.
 */
function eventNamesRegisteredOn(os: 'android' | 'ios'): string[] {
  const eventNames: string[] = [];

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- `jest.isolateModules` needs a synchronous `require`, not a top-level `import`, to land its fresh copies inside the sandbox; see this function's own doc comment.
    const React = require('react') as typeof import('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const ReactNative = require('react-native') as typeof import('react-native');
    // `Platform.OS` is typed as a per-platform literal because the real
    // module is one of several platform-specific files picked at build
    // time; under Jest it is one plain, mutable object, which is what lets
    // a test force it to either value.
    (ReactNative.Platform as { OS: string }).OS = os;
    jest.spyOn(ReactNative.Keyboard, 'addListener').mockImplementation((eventName) => {
      eventNames.push(eventName);
      return mockListener();
    });

    const { useKeyboardVisible: isolatedUseKeyboardVisible } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
      require('./use-keyboard-visible') as typeof import('./use-keyboard-visible');

    function Probe() {
      isolatedUseKeyboardVisible();
      return null;
    }

    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(Probe));
    });
  });

  return eventNames;
}
