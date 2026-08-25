import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.accent,
  },
}));

export default function HomeScreen() {
  const { rt } = useUnistyles();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Juicio</Text>
      <Text style={styles.subtitle}>color scheme: {rt.colorScheme}</Text>
    </View>
  );
}
