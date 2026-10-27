import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addAccount, deleteAccount, getAccounts, getTotal, renameAccount } from '../db';
import { colors, fonts, radius } from '../theme';
import type { AccountWithBalance, RootStackParamList } from '../types';
import AccountCard from '../components/home/AccountCard';
import AccountModal from '../components/home/AccountModal';
import HeroCard from '../components/home/HeroCard';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null);

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

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
    Alert.alert(`Delete "${a.name}"?`, 'All sources and entries in this account will be removed. This cannot be undone.', [
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

  const header = (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.heavy, fontSize: 28 }}>Hisaab</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => navigation.navigate('Settings')}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
        >
          <Feather name="settings" size={20} color={colors.text} />
        </Pressable>
      </View>
      <HeroCard total={total} accounts={accounts} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>Accounts</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing('new')}
          style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 15 }}>+ Add account</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, gap: 12 }}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: 4 }}
        ListEmptyComponent={
          loaded ? (
            <View style={{ padding: 24, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' }}>No accounts yet. Add your first account.</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <AccountCard
            account={item}
            index={index}
            onPress={() => navigation.navigate('Account', { accountId: item.id })}
            onLongPress={() => options(item)}
          />
        )}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 8, paddingBottom: 16 + insets.bottom }}>
        <Feather name="lock" size={14} color={colors.muted} />
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>All data stays on this phone</Text>
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
