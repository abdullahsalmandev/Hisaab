import { Pressable, Text, View } from 'react-native';
import { colors, fonts } from '../../theme';

export type Tab = 'accounts' | 'sources';
const TABS: { key: Tab; label: string }[] = [{ key: 'accounts', label: 'Accounts' }, { key: 'sources', label: 'Sources' }];

export default function Segmented({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      {TABS.map(({ key, label }) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.primary : colors.card }}
          >
            <Text style={{ color: selected ? colors.onPrimary : colors.muted, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
