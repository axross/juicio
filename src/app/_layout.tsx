import * as Sentry from '@sentry/react-native';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { deriveNavigationTheme } from '@/core/navigation/navigation-theme';
import { useFollowSystemColorScheme } from '@/features/settings/adapter/use-follow-system-color-scheme';
import { usePersistedSettings } from '@/features/settings/adapter/use-persisted-settings';
import { PortalHost } from '@/shared/ui/portal/portal';

function RootLayout() {
  const { success: migrationsSucceeded, error: migrationsError } = useDatabaseMigrations();
  const { ready: settingsReady } = usePersistedSettings();
  // subscribes to OS colour-scheme changes for the app's lifetime — see
  // #19. started here, beside the other readiness hooks and above both
  // early returns below, so it is already running before either the error
  // view or the splash screen resolves; it needs no readiness state of its
  // own to gate on.
  useFollowSystemColorScheme();
  // tracks only `rt.themeName`, not the runtime or theme proxy as a whole,
  // so this does not re-render on every Unistyles runtime change — but an
  // actual theme-name change now re-renders `RootLayout` and recreates the
  // `<Stack>` element beneath it, where before this wiring a theme change
  // needed no React re-render at all. that cost is accepted rather than
  // avoided: `deriveNavigationTheme` below feeds a React Navigation
  // `ThemeProvider`, and a React-context API can only propagate a new value
  // through a re-render. `_layout.tsx` is also the lowest common ancestor of
  // every navigator, so there is no lower point in the tree to read
  // `themeName` and absorb the re-render instead.
  const { rt } = useUnistyles();

  // both prerequisites must have *terminated* — succeeded or failed — before
  // the splash can go: a migration failure still renders the error view
  // below rather than leaving the app stuck behind the splash, and a
  // settings-read failure still unblocks the launch (see
  // use-persisted-settings.ts).
  const migrationsSettled = migrationsSucceeded || migrationsError !== undefined;
  const ready = migrationsSettled && settingsReady;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

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
    // the nesting order is load-bearing in both directions.
    // `GestureHandlerRootView` is outermost because every gesture-driven
    // surface below it — including one rendered through `PortalHost`, which
    // escapes the navigator tree entirely — resolves its handlers against
    // this root. `ThemeProvider` sits inside it because it is an ordinary
    // React context that only has to be above the navigators reading it.
    // `<PortalHost />` then wraps `<Stack>` rather than sitting beside it:
    // `children` (the `Stack`, and everything it renders including the tab
    // bar `Tabs` draws) paints first, and every portalled entry — the
    // card/range input sheet's own bottom sheet, today — paints after it,
    // on top. See that component's own doc comment.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={deriveNavigationTheme(rt.themeName)}>
        <PortalHost>
          <Stack screenOptions={{ headerShown: false }} />
        </PortalHost>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
