import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { avatarTints, colors, fonts } from '../../theme';
import type { SourceWithTotal } from '../../types';
import { formatMoney } from '../../utils/money';
import { initials } from '../account/helpers';

const nums = ['tabular-nums' as const];

interface Props { source: SourceWithTotal; index: number; onPress: () => void; onLongPress: () => void; }

// One row of the white sources card; the card draws the hairline above every row but the first.
export default function SourceRow({ source, index, onPress, onLongPress }: Props) {
  const tint = avatarTints[index % avatarTints.length];
  const n = source.accountCount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${source.name}, ${formatMoney(source.total)}`}
      accessibilityHint="Long press to rename or delete"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
        borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline, opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tint.bg }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: tint.fg }}>{initials(source.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>{source.name}</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted, fontVariant: nums }}>
          {n ? `In ${n} ${n === 1 ? 'account' : 'accounts'}` : 'Not in any account yet'}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontFamily: fonts.heavy, fontSize: 17, color: source.total < 0 ? colors.outColor : colors.text, fontVariant: nums }}>{formatMoney(source.total)}</Text>
      <Feather name="chevron-right" size={20} color={colors.chevron} />
    </Pressable>
  );
}
