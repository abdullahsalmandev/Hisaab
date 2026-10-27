import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { initDb } from './src/db';
import { colors, fonts } from './src/theme';
import type { RootStackParamList } from './src/types';
import HomeScreen from './src/screens/HomeScreen';
import AccountScreen from './src/screens/AccountScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import SourceDetailScreen from './src/screens/SourceDetailScreen';
import EntryFormScreen from './src/screens/EntryFormScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Header titles use Manrope too; fontWeight stays 'normal' because each weight is its own font file.
const face = (fontFamily: string) => ({ fontFamily, fontWeight: 'normal' as const });
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background, text: colors.text, border: colors.border, primary: colors.primary },
  fonts: { regular: face(fonts.regular), medium: face(fonts.semibold), bold: face(fonts.bold), heavy: face(fonts.heavy) },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded, fontError] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!ready || !(fontsLoaded || fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <StatusBar style="dark" />
        {error ? (
          <>
            <Text style={{ color: colors.outColor, fontFamily: fonts.bold, fontSize: 20, marginBottom: 8 }}>Could not open the database</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{error}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="dark" />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="Ledger" component={LedgerScreen} />
        <Stack.Screen name="SourceDetail" component={SourceDetailScreen} />
        <Stack.Screen name="EntryForm" component={EntryFormScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
