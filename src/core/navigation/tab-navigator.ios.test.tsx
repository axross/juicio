// registers this project's real themes against the mocked `StyleSheet`
// (see docs/conventions/testing.md) before `TabNavigator` calls
// `useUnistyles()`.
import '@/core/theme/unistyles';

import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { TabNavigator } from './tab-navigator.ios';

/**
 * `NativeTabs` renders native chrome RNTL cannot introspect — no icon,
 * label, or colour it's given reaches a queryable node (see
 * docs/conventions/testing.md's "What a Unit Test Asserts About a
 * Third-Party Library"). This mounts `TabNavigator` through
 * `expo-router/testing-library`'s `renderRouter` — the router context every
 * `NativeTabs.Trigger` needs (`useContextKey()` throws outside one) — with
 * one stub screen per real route, and asserts only what's actually
 * observable here: that mounting doesn't throw, and that each of the four
 * `name="..."` triggers actually resolves to its matching route file.
 */
const context = {
  _layout: () => <TabNavigator />,
  index: () => <Text testID="index-screen">index</Text>,
  history: () => <Text testID="history-screen">history</Text>,
  presets: () => <Text testID="presets-screen">presets</Text>,
  settings: () => <Text testID="settings-screen">settings</Text>,
};

describe('<TabNavigator /> (iOS)', () => {
  it('mounts and lands on the Analyze (index) tab', () => {
    renderRouter(context);

    expect(screen.getByTestId('index-screen')).toBeTruthy();
  });

  it.each(['history', 'presets', 'settings'])('registers the %s route', (name) => {
    renderRouter(context, { initialUrl: `/${name}` });

    expect(screen.getByTestId(`${name}-screen`)).toBeTruthy();
  });
});
