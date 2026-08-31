import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BarChartIcon } from '@/core/icons/bar-chart-icon';
import { ClipboardListIcon } from '@/core/icons/clipboard-list-icon';
import { CogIcon } from '@/core/icons/cog-icon';
import { HistoryIcon } from '@/core/icons/history-icon';
import type { IconProps } from '@/core/icons/icon-props';

import { TabBarItem } from './tab-bar-item';

type NavigationLabelKey = 'analyzeTab' | 'historyTab' | 'presetsTab' | 'settingsTab';

/**
 * route name → {icon, translation key, test id}. fixed rather than derived
 * from `state.routes` order alone, so a route this map does not know about
 * fails loudly instead of rendering with no icon.
 */
const TAB_CONFIG: Record<
  string,
  { Icon: ComponentType<IconProps>; labelKey: NavigationLabelKey; testId: string }
> = {
  index: { Icon: BarChartIcon, labelKey: 'analyzeTab', testId: 'tab-bar-item-analyze' },
  history: { Icon: HistoryIcon, labelKey: 'historyTab', testId: 'tab-bar-item-history' },
  presets: { Icon: ClipboardListIcon, labelKey: 'presetsTab', testId: 'tab-bar-item-presets' },
  settings: { Icon: CogIcon, labelKey: 'settingsTab', testId: 'tab-bar-item-settings' },
};

/**
 * the design's own tab bar, rendered through `Tabs`'s `tabBar` render prop
 * (see `src/app/(tabs)/_layout.tsx`) rather than through tab-bar options,
 * because the design's 90px height, its per-cell active hairline, and its
 * `Sheet (Inverted)` shadow cannot be expressed through them.
 *
 * 90px tall on the design's own reference device — a fixed 56px of content
 * (8px top padding + 24px icon + 4px gap + 16px label line height + 4px
 * bottom padding, all per cell) plus that device's 34px home-indicator
 * inset. the inset is *added* rather than baked in, so a device with a
 * smaller or zero inset renders a correspondingly shorter bar instead of a
 * fixed 90px with the wrong gutter. `insets.bottom` comes from
 * `BottomTabBarProps`, which `expo-router`'s `BottomTabView` already
 * populates from `react-native-safe-area-context` (the router mounts a
 * `SafeAreaProvider` at its own root) — this component needs no safe-area
 * hook or provider of its own.
 *
 * **takes no `style`, deliberately.** unlike this project's other
 * components, this one is never composed by another component in the
 * ordinary sense — it is reached only through `Tabs`' own `tabBar` render
 * prop (`src/app/(tabs)/_layout.tsx`), the same way a route screen under
 * `src/app/` is reached only by the router. no caller is ever in a
 * position to pass this component a `style`, so it declares none — see
 * docs/conventions/component-styling.md's own row for this exemption,
 * which calls this component out by name since — unlike the route screens
 * — its location under `src/core/navigation/` doesn't make the exemption
 * obvious on its own.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation('navigation');

  return (
    // the bottom inset is a minimum clearance, not a floor to combine with a
    // gutter — a device with no home indicator collapsing to 0 padding here
    // is exactly the shorter bar the design calls for, not a gap to guard.
    // it has no theme dependency, so it is applied here as a plain
    // per-render style rather than living inside `styles.root` — see that
    // style's own comment for why a themed value must not share a property
    // with one that varies for a reason Unistyles never sees.
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const config = TAB_CONFIG[route.name];

        if (!config) {
          return null;
        }

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabBarItem
            key={route.key}
            label={t(config.labelKey)}
            Icon={config.Icon}
            active={isFocused}
            onPress={onPress}
            testID={config.testId}
          />
        );
      })}
    </View>
  );
}

/**
 * a plain (non-function) style, deliberately: a style value that is itself a
 * function — `root: (bottomInset) => ({ ... })`, as this used to read — is
 * not parsed until Unistyles calls it at least once, so its
 * `uni__dependencies` (here `theme` and `rt.insets`) stay empty until then.
 * that leaves it out of both sets Unistyles consults on a theme change, so a
 * theme switch that happens before this component's first render — which is
 * exactly what happens on this app's own launch path — never refreshes it,
 * and it keeps rendering whatever theme was active when `StyleSheet.create`
 * first ran, for the rest of the process (issue #68; see
 * docs/decisions/2026-08-29-ban-dynamic-function-styles.md for the full
 * mechanism and `eslint.config.js`'s `no-restricted-syntax` rule that now
 * forbids this shape under `src/`). Keeping this a two-argument `(theme,
 * rt) =>` factory rather than a one-argument one is still required — see the
 * `paddingStart`/`paddingEnd` values below, which need `rt.insets` — the fix
 * is only to stop the *style itself* from being a function, not the
 * stylesheet factory.
 */
const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingStart: Math.max(rt.insets.left, theme.space.x16),
    paddingEnd: Math.max(rt.insets.right, theme.space.x16),
    backgroundColor: theme.colors.background.neutral.subtle,
    boxShadow: theme.effects.sheetInverted,
  },
}));
