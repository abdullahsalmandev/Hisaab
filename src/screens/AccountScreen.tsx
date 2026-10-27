import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteEntry, getAccount, getEntries } from '../db';
import { formatDate } from '../components/account/helpers';
import { useTheme } from '../theme';
import type { AccountWithBalance, Entry, RootStackParamList } from '../types';
import { formatMoney } from '../utils/money';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

export default function AccountScreen({ navigation, route }: Props) {
  const { accountId } = route.params;
  const { colors, spacing } = useTheme();
  const [account, setAccount] = useState<AccountWithBalance | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([getAccount(accountId), getEntries(accountId)]);
      if (a) navigation.setOptions({ title: a.name });
      setAccount(a);
      setEntries(e);
    } catch (err) {
      Alert.alert('Error', String(err instanceof Error ? err.message : err));
    }
  }, [accountId, navigation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = (e: Entry) =>
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(e.id);
            await load();
          } catch (err) {
            Alert.alert('Error', String(err instanceof Error ? err.message : err));
          }
        },
      },
    ]);

  const bigButton = (label: string, type: 'in' | 'out', color: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('EntryForm', { accountId, type })}
      style={{ flex: 1, backgroundColor: color, padding: spacing.md, borderRadius: 12, alignItems: 'center' }}
    >
      <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  const header = (
    <View style={{ paddingBottom: spacing.md }}>
      <Text style={{ color: colors.muted, textAlign: 'center' }}>Balance</Text>
      <Text style={{ color: colors.text, fontSize: 40, fontWeight: '700', textAlign: 'center', marginVertical: spacing.md }}>
        {account ? formatMoney(account.balance) : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {bigButton('Ingoing', 'in', colors.inColor)}
        {bigButton('Outgoing', 'out', colors.outColor)}
      </View>
    </View>
  );

  const renderItem = ({ item: e }: { item: Entry }) => {
    const isIn = e.type === 'in';
    const color = isIn ? colors.inColor : colors.outColor;
    const label = isIn ? e.source || 'Ingoing' : e.note || 'Outgoing';
    const secondary = isIn ? e.note : null;
    return (
      <Pressable
        onPress={() => navigation.navigate('EntryForm', { accountId, type: e.type, entryId: e.id })}
        onLongPress={() => confirmDelete(e)}
        style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border,
          borderWidth: 1, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
          {secondary ? <Text style={{ color: colors.muted }}>{secondary}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>{formatDate(e.date)}</Text>
        </View>
        <Text style={{ color, fontSize: 16, fontWeight: '700' }}>
          {isIn ? '+' : '-'}{formatMoney(e.amount).replace('Rs ', '')}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={entries}
      keyExtractor={(e) => String(e.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: spacing.lg }}>No entries yet.</Text>}
      renderItem={renderItem}
    />
  );
}
