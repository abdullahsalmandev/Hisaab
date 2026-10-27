import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addAccount, deleteAccount, getAccounts, getTotal, renameAccount } from '../db';
import { formatMoney } from '../utils/money';
import { useTheme } from '../theme';
import type { AccountWithBalance, RootStackParamList } from '../types';
import AccountModal from '../components/home/AccountModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function HomeScreen({ navigation }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([getTotal(), getAccounts()]);
      setTotal(t);
      setAccounts(a);
    } catch (e) {
      Alert.alert('Could not load accounts', errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Hisaab',
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={12} accessibilityLabel="Settings" style={{ padding: spacing.sm }}>
          <Ionicons name="settings-outline" size={26} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, colors.text, spacing.sm]);

  const save = async (name: string) => {
    const target = editing;
    setEditing(null);
    try {
      if (target && target !== 'new') await renameAccount(target.id, name);
      else await addAccount(name);
    } catch (e) {
      Alert.alert('Could not save account', errMsg(e));
    }
    load();
  };

  const confirmDelete = (a: AccountWithBalance) =>
    Alert.alert(`Delete "${a.name}"?`, 'All entries in this account will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deleteAccount(a.id); } catch (e) { Alert.alert('Could not delete account', errMsg(e)); }
          load();
        },
      },
    ]);

  const options = (a: AccountWithBalance) =>
    Alert.alert(a.name, undefined, [
      { text: 'Rename', onPress: () => setEditing(a) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(a) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const balanceColor = (n: number) => (n < 0 ? colors.outColor : colors.text);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.muted, fontSize: 16 }}>Total</Text>
            <Text style={{ color: balanceColor(total), fontSize: 36, fontWeight: '700', marginTop: spacing.xs }}>{formatMoney(total)}</Text>
          </View>
        }
        ListEmptyComponent={
          loaded ? <Text style={{ color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: spacing.xl }}>No accounts yet. Add your first account.</Text> : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('Account', { accountId: item.id })}
            onLongPress={() => options(item)}
            style={{ backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, minHeight: 72, justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.muted, fontSize: 16 }}>{item.name}</Text>
            <Text style={{ color: balanceColor(item.balance), fontSize: 24, fontWeight: '600', marginTop: spacing.xs }}>{formatMoney(item.balance)}</Text>
          </Pressable>
        )}
      />
      <View style={{ padding: spacing.md, paddingBottom: spacing.md + insets.bottom }}>
        <Pressable onPress={() => setEditing('new')} style={{ minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>+ Add account</Text>
        </Pressable>
      </View>
      <AccountModal
        visible={editing !== null}
        title={editing && editing !== 'new' ? 'Rename account' : 'Add account'}
        initial={editing && editing !== 'new' ? editing.name : ''}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
    </View>
  );
}
