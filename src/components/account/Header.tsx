import { useLayoutEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

// Replaces the native header: hides it on the host screen and draws back arrow + title (+ optional subtitle).
export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 8, paddingBottom: 8 }}>
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: 4 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.text }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
