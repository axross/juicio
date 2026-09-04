// registers this project's real themes against the mocked `StyleSheet`
// before `TabBar`'s own themed styles run (see docs/conventions/testing.md).
import '@/core/theme/unistyles';

import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

// `TabNavigator`'s own default (non-iOS) sibling. This file's own name
// carries no `.ios`/`.android` suffix, and this project's Jest config
// resolves a bare `./tab-navigator` specifier to the `.ios.tsx` sibling
// instead — its `haste.defaultPlatform` is `'ios'`
// (`@react-native/jest-preset`'s own default; unrelated to what actually
// ships on a device). Importing the literal filename, extension included,
// is what reaches this file specifically rather than its iOS sibling.
import { TabNavigator } from './tab-navigator.tsx';

jest.mock('@/core/haptics/haptics');
// an automock still needs the real `./haptics` once, to introspect its
// exports (see `tab-bar-item.test.tsx`'s own identical comment) — and that
// reaches `@sentry/react-native` via `report-error`, which starts a real
// `setInterval` nothing here clears. mocking `report-error` too keeps the
// native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const context = {
  _layout: () => <TabNavigator />,
  index: () => <Text testID="index-screen">index</Text>,
  history: () => <Text testID="history-screen">history</Text>,
  presets: () => <Text testID="presets-screen">presets</Text>,
  settings: () => <Text testID="settings-screen">settings</Text>,
};

/**
 * a pure extraction of what `src/app/(tabs)/_layout.tsx` rendered directly
 * before issue #165 (see `./tab-navigator.tsx`'s own doc comment) — this is
 * this project's first test of it as its own unit, mounted through
 * `expo-router/testing-library`'s `renderRouter` (the router context
 * `Tabs`, and every `Tabs.Screen`, needs) rather than through a visual
 * assertion: `TabBar`'s own rendering is already `tab-bar-item.test.tsx`'s
 * subject.
 */
describe('<TabNavigator /> (default)', () => {
  it('mounts and lands on the Analyze (index) tab', () => {
    renderRouter(context);

    expect(screen.getByTestId('index-screen')).toBeTruthy();
  });

  it.each(['history', 'presets', 'settings'])('registers the %s route', (name) => {
    renderRouter(context, { initialUrl: `/${name}` });

    expect(screen.getByTestId(`${name}-screen`)).toBeTruthy();
  });
});
