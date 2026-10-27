import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { accountColors, colors, fonts, radius } from '../../theme';
import type { AccountWithBalance } from '../../types';
import { formatMoney } from '../../utils/money';

const nums = ['tabular-nums' as const];

interface Props { account: AccountWithBalance; index: number; onPress: () => void; onLongPress: () => void; }

export default function AccountCard({ account, index, onPress, onLongPress }: Props) {
  const n = account.sourceCount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatMoney(account.balance)}`}
      accessibilityHint="Long press to rename or delete"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, paddingHorizontal: 18, paddingVertical: 14,
        backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accountColors[index % accountColors.length] }} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>{account.name}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 2, fontVariant: nums }}>
          {n} {n === 1 ? 'source' : 'sources'}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ color: account.balance < 0 ? colors.outColor : colors.text, fontFamily: fonts.heavy, fontSize: 18, fontVariant: nums }}>
        {formatMoney(account.balance)}
      </Text>
      <Feather name="chevron-right" size={20} color={colors.chevron} />
    </Pressable>
  );
}
