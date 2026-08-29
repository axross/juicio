import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { usePersistedSettings } from '@/features/settings/adapter/use-persisted-settings';

function RootLayout() {
  const { success: migrationsSucceeded, error: migrationsError } = useDatabaseMigrations();
  const { ready: settingsReady } = usePersistedSettings();

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
