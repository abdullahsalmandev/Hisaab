import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initDb } from './src/db';
import { useTheme } from './src/theme';
import type { RootStackParamList } from './src/types';
import HomeScreen from './src/screens/HomeScreen';
import AccountScreen from './src/screens/AccountScreen';
import EntryFormScreen from './src/screens/EntryFormScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors, spacing } = useTheme();
  const base = useColorScheme() === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background }}>
        {error ? (
          <>
            <Text style={{ color: colors.outColor, fontSize: 20, fontWeight: '600', marginBottom: spacing.sm }}>Could not open the database</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{error}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        ...base,
        colors: { ...base.colors, background: colors.background, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary },
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="EntryForm" component={EntryFormScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
