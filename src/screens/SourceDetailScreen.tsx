import { Text, View } from 'react-native';
import { colors, fonts } from '../theme';

// Placeholder: the Home session builds the real screen.
export default function SourceDetailScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.text, fontFamily: fonts.bold }}>SourceDetail</Text>
    </View>
  );
}
