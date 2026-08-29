import * as Sentry from '@sentry/react-native';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { deriveNavigationTheme } from '@/core/navigation/navigation-theme';
import { usePersistedSettings } from '@/features/settings/adapter/use-persisted-settings';

function RootLayout() {
  const { success: migrationsSucceeded, error: migrationsError } = useDatabaseMigrations();
  const { ready: settingsReady } = usePersistedSettings();
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

  if (migrationsError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Database migration failed: {migrationsError.message}</Text>
      </View>
    );
  }

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={deriveNavigationTheme(rt.themeName)}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
