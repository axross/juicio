import '@/core/theme/unistyles';

import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useDatabaseMigrations } from '@/core/db/use-database-migrations';
import { initSentry } from '@/core/instrumentation/sentry';

initSentry();

export default function RootLayout() {
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
