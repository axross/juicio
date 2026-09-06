import * as Sentry from '@sentry/react-native';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { useTrackSessionStart } from '@/core/instrumentation/use-track-session-start';
import { deriveNavigationTheme } from '@/core/navigation/navigation-theme';
import { useTrackScreenViews } from '@/core/navigation/use-track-screen-views';
import { deriveStatusBarStyle } from '@/core/theme/status-bar-style';
import { useSeedTagCatalog } from '@/features/presets/adapter/use-seed-tag-catalog';
import { useFollowSystemColorScheme } from '@/features/settings/adapter/use-follow-system-color-scheme';
import { usePersistedSettings } from '@/features/settings/adapter/use-persisted-settings';
import { BlurTarget, BlurTargetProvider } from '@/shared/ui/blur-target/blur-target';
import { PortalHost } from '@/shared/ui/portal/portal';

function RootLayout() {
  const { success: migrationsSucceeded, error: migrationsError } = useDatabaseMigrations();
  // gated on `migrationsSucceeded` alone, not on `migrationsSettled` below —
  // seeding needs the `tag_axes`/`tag_values` tables that migration
  // creates, so it has nothing to run against on a migration failure.
  const { ready: tagCatalogReady } = useSeedTagCatalog(migrationsSucceeded);
  const { ready: settingsReady } = usePersistedSettings();
  // subscribes to OS colour-scheme changes for the app's lifetime — see
  // #19. started here, beside the other readiness hooks and above both
  // early returns below, so it is already running before either the error
  // view or the splash screen resolves; it needs no readiness state of its
  // own to gate on.
  useFollowSystemColorScheme();
  // tracks only `rt.themeName`, not the runtime or theme proxy as a whole, so
  // this does not re-render on every Unistyles change; an actual theme-name
  // change still re-renders `RootLayout`, a cost accepted here — see
  // ../../docs/decisions/2026-09-05-accept-a-rerender-on-theme-name-change-in-root-layout.md.
  const { rt } = useUnistyles();

  // the splash hides only once migrations and settings have settled
  // (succeeded or failed); tag-catalog readiness only gates that once
  // migrations actually succeed, since its own effect never runs otherwise.
  const migrationsSettled = migrationsSucceeded || migrationsError !== undefined;
  const tagCatalogSettled = migrationsSucceeded ? tagCatalogReady : true;
  const ready = migrationsSettled && tagCatalogSettled && settingsReady;

  // one router-level subscription for every `Screen Viewed` event (issue
  // #211) — see `use-track-screen-views.ts`'s own doc comment for why this
  // sits here rather than in each screen component, and for why it takes
  // `ready` rather than mounting unconditionally: the same reason
  // `useTrackSessionStart` below gates on it.
  useTrackScreenViews(ready);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  // see `use-track-session-start.ts`'s own doc comment for why this is a
  // hook of its own rather than an inline effect, why it gates on `ready`,
  // and why that is enough to keep it to once per launch.
  useTrackSessionStart(ready);

  // GestureHandlerRootView wraps every branch below, not only the happy
  // path: later gesture-driven surfaces (a bottom sheet's drag, a swipe)
  // need it mounted above wherever they render, and the error and
  // not-ready branches are reachable renders too, not just intermediate
  // states nothing interacts with.
  if (migrationsError) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Database migration failed: {migrationsError.message}</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  if (!ready) {
    return <GestureHandlerRootView style={{ flex: 1 }} />;
  }

  return (
    // the provider nesting order below is load-bearing; see
    // ../../docs/decisions/2026-09-05-nest-gesturehandlerrootview-outside-themeprovider-and-portalhost-in-root-layout.md.
    // `BlurTargetProvider` sits between `ThemeProvider` and `PortalHost`,
    // above the latter rather than below: a portalled node — `BottomSheet`'s
    // own backdrop — reads this context from inside `PortalHost`'s own
    // portalled output, so the provider has to be an ancestor of
    // `PortalHost` itself, not merely of whatever calls `usePortal` — the
    // same requirement `@/shared/ui/portal/portal`'s own doc comment already
    // states for Unistyles' theme, `react-i18next`'s translations, and
    // gesture-handler's root context, and that
    // `@/shared/ui/blur-target/blur-target`'s own doc comment restates for
    // this context specifically.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={deriveStatusBarStyle(rt.themeName)} />
      <ThemeProvider value={deriveNavigationTheme(rt.themeName)}>
        <BlurTargetProvider>
          <PortalHost>
            <BlurTarget>
              <Stack screenOptions={{ headerShown: false }} />
            </BlurTarget>
          </PortalHost>
        </BlurTargetProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
