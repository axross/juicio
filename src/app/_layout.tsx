import '@/core/theme/unistyles';

import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';

function RootLayout() {
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

// Sentry.wrap installs the SDK's own instrumentation — an error boundary
// above this tree, plus navigation and interaction context — on top of
// whatever this app's own error boundary already does. Initialization
// itself happens in the entry module (main.ts), not here.
export default Sentry.wrap(RootLayout);
