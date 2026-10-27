import { Text, View } from 'react-native';
import { accountColors, colors, fonts, radius } from '../../theme';
import type { AccountWithBalance } from '../../types';
import { formatMoney } from '../../utils/money';

const nums = ['tabular-nums' as const];

interface Props { total: number; accounts: AccountWithBalance[]; }

export default function HeroCard({ total, accounts }: Props) {
  // Each account with a positive balance gets a bar segment sized by its share; colors follow the account's list position.
  const segments = accounts.map((a, i) => ({ a, i })).filter(({ a }) => a.balance > 0);
  return (
    <View style={{ backgroundColor: colors.primary, borderRadius: radius.hero, padding: 24 }}>
      <Text style={{ color: colors.onPrimaryMuted, fontFamily: fonts.semibold, fontSize: 14 }}>Total balance</Text>
      <Text
        accessibilityLabel={`Total balance ${formatMoney(total)}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: colors.onPrimary, fontFamily: fonts.heavy, fontSize: 40, marginTop: 4, fontVariant: nums }}
      >
        {formatMoney(total)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 3, height: 8, marginTop: 20 }}>
        {segments.length ? (
          segments.map(({ a, i }) => (
            <View key={a.id} style={{ flex: a.balance, borderRadius: 4, backgroundColor: accountColors[i % accountColors.length] }} />
          ))
        ) : (
          <View style={{ flex: 1, borderRadius: 4, backgroundColor: colors.onPrimaryMuted, opacity: 0.3 }} />
        )}
      </View>
      <Text style={{ color: colors.onPrimaryMuted, fontFamily: fonts.regular, fontSize: 13, marginTop: 12, fontVariant: nums }}>
        Across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
      </Text>
    </View>
  );
}
