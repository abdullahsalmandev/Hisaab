import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { deleteEntry, getAccount, getLedger, getSource } from '../db';
import { colors, fonts, radius } from '../theme';
import type { EntryType, LedgerRow, RootStackParamList, SourceWithBalance } from '../types';
import { formatMoney } from '../utils/money';
import Header from '../components/account/Header';
import { formatShortDate, formatTime } from '../components/account/helpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Ledger'>;

const num = { fontVariant: ['tabular-nums' as const] };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Grid ratio 1.5 : 1 : 1 for Date | Out | In.
const cols = { date: { flex: 1.5 }, amt: { flex: 1, alignItems: 'flex-end' as const } };

export default function LedgerScreen({ navigation, route }: Props) {
  const { sourceId } = route.params;
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<SourceWithBalance | null>(null);
  const [accountName, setAccountName] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([getSource(sourceId), getLedger(sourceId)]);
      setSource(s);
      setRows(l);
      if (s) setAccountName((await getAccount(s.accountId))?.name ?? '');
    } catch (e) {
      Alert.alert('Could not load entries', errMsg(e));
    }
  }, [sourceId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = (r: LedgerRow) =>
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(r.id);
          } catch (e) {
            Alert.alert('Could not delete entry', errMsg(e));
          }
          load();
        },
      },
    ]);

  const miniCard = (label: string, value: string, color: string) => (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 12 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text numberOfLines={1} style={[num, { fontFamily: fonts.heavy, fontSize: 16, color, marginTop: 2 }]}>{value}</Text>
    </View>
  );

  const bigButton = (label: string, type: EntryType) => (
    <Pressable
      onPress={() => navigation.navigate('EntryForm', { sourceId, type })}
      accessibilityRole="button"
      style={{ flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.button, backgroundColor: type === 'in' ? colors.inColor : colors.outColor }}
    >
      <Feather name={type === 'in' ? 'arrow-down' : 'arrow-up'} size={20} color={colors.onPrimary} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onPrimary }}>{label}</Text>
    </Pressable>
  );

  const headCell = (label: string, style: object, right = false) => (
    <Text style={[style, { fontFamily: fonts.bold, fontSize: 12, color: colors.muted, textAlign: right ? 'right' : 'left' }]}>{label}</Text>
  );

  const renderRow = ({ item: r, index }: { item: LedgerRow; index: number }) => {
    const amount = formatMoney(r.amount).replace('Rs ', '');
    const isOut = r.type === 'out';
    return (
      <Pressable
        onPress={() => navigation.navigate('EntryForm', { sourceId, type: r.type, entryId: r.id })}
        onLongPress={() => confirmDelete(r)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }}
      >
        <View style={[cols.date, { alignItems: 'flex-start' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.text }}>{formatShortDate(r.date)}</Text>
            <Text style={[num, { fontFamily: fonts.regular, fontSize: 13, color: colors.muted }]}>{formatTime(r.date)}</Text>
          </View>
          <View style={{ backgroundColor: colors.chip, borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 }}>
            <Text style={[num, { fontFamily: fonts.semibold, fontSize: 12, color: r.runningBalance < 0 ? colors.outColor : colors.text }]}>Bal {formatMoney(r.runningBalance)}</Text>
          </View>
        </View>
        <Text style={[cols.amt, num, { fontFamily: fonts.heavy, fontSize: 15, color: colors.outColor, textAlign: 'right' }]}>{isOut ? amount : ''}</Text>
        <Text style={[cols.amt, num, { fontFamily: fonts.heavy, fontSize: 15, color: colors.inColor, textAlign: 'right' }]}>{isOut ? '' : amount}</Text>
      </Pressable>
    );
  };

  const balance = source?.balance ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={source?.name ?? ''} subtitle={accountName} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <View style={{ backgroundColor: colors.primary, borderRadius: radius.hero, padding: 20 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.onPrimaryMuted }}>Balance</Text>
          <Text style={[num, { fontFamily: fonts.heavy, fontSize: 36, color: colors.onPrimary, marginBottom: 14 }]}>{formatMoney(balance)}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {miniCard('Total in', `+ ${formatMoney(source?.totalIn ?? 0)}`, colors.inColor)}
            {miniCard('Total out', `− ${formatMoney(source?.totalOut ?? 0)}`, colors.outColor)}
          </View>
        </View>

        <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            {headCell('Date', cols.date)}
            {headCell('Out', cols.amt, true)}
            {headCell('In', cols.amt, true)}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(r) => String(r.id)}
            renderItem={renderRow}
            ListEmptyComponent={<Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 32 }}>No entries yet</Text>}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {bigButton('Money out', 'out')}
          {bigButton('Money in', 'in')}
        </View>
      </View>
    </View>
  );
}
