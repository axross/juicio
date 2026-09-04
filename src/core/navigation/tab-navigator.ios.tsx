import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { useUnistyles } from 'react-native-unistyles';

/**
 * the iOS tab navigator: `expo-router`'s native tab bar
 * (`expo-router/unstable-native-tabs`), themed with this app's own colours
 * rather than the fully custom `TabBar` every other platform still renders
 * (`./tab-navigator.tsx`). Metro resolves this file only on iOS, by its own
 * `.ios.tsx` suffix — no platform branch lives in `_layout.tsx` itself.
 *
 * This supersedes
 * docs/decisions/2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md
 * **for iOS only** — see
 * docs/decisions/2026-09-04-render-the-ios-tab-bar-with-expo-routers-native-tabs.md
 * for why. Android (and every other non-iOS platform) keeps that ADR's original
 * reasoning and implementation untouched.
 *
 * iOS 26 renders this with Liquid Glass automatically — `NativeTabs` gets it
 * for free from the OS, with no application code (and no `expo-glass-effect`
 * dependency) needed here. `backgroundColor` below only affects iOS below
 * 26, where Liquid Glass doesn't apply and the tab bar falls back to a flat
 * fill.
 *
 * `useUnistyles()` (the same pattern `./navigation-theme.ts` and
 * `../theme/status-bar-style.ts` already use for a non-stylesheet consumer)
 * reads the active theme reactively, so the bar re-themes on a light/dark
 * switch — these are plain component props, not a `StyleSheet.create`
 * factory Unistyles could otherwise re-run on its own.
 *
 * `disableTransparentOnScrollEdge` (the documented fix for `NativeTabs`'
 * iOS-18-and-earlier transparent-bar-at-scroll-edge bug) is not set on any
 * trigger below: none of the four screens render a scrollable view as their
 * root's first child — each renders a fixed header (a `NavBar`, or, on
 * Analyze, the board layout) first, with the screen's own `ScrollView`
 * appearing after it — so there is no clear need to set it.
 */
export function TabNavigator() {
  const { t } = useTranslation('navigation');
  const { theme } = useUnistyles();

  const selectedColor = theme.colors.text.accent.brand;
  const defaultColor = theme.colors.text.neutral.low;

  return (
    <NativeTabs
      tintColor={selectedColor}
      iconColor={{ selected: selectedColor, default: defaultColor }}
      backgroundColor={theme.colors.background.neutral.subtle}
      // attempts to match this project's own tab label face and per-state
      // colour; a known open upstream bug (expo/expo#44029) may prevent
      // `color` specifically from taking effect on iOS. Shipped anyway per
      // the plan this file implements — not worked around here.
      labelStyle={{
        default: { fontFamily: theme.fontFaces.medium, color: defaultColor },
        selected: { fontFamily: theme.fontFaces.medium, color: selectedColor },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <NativeTabs.Trigger.Label>{t('analyzeTab')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        {/* no natural "filled" SF Symbol variant exists for this one, so the
        same symbol is reused for both states. */}
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" />
        <NativeTabs.Trigger.Label>{t('historyTab')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="presets">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
        />
        <NativeTabs.Trigger.Label>{t('presetsTab')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>{t('settingsTab')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
