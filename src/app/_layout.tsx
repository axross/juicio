import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { usePersistedSettings } from '@/features/settings/adapter/use-persisted-settings';

function RootLayout() {
  const { success: migrationsSucceeded, error: migrationsError } = useDatabaseMigrations();
  const { ready: settingsReady } = usePersistedSettings();

  // Both prerequisites must have *terminated* — succeeded or failed — before
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

  return <Stack screenOptions={{ headerShown: false }} />;
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. Initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
