import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addAccount, addSource, deleteAccount, getAccounts, getAllSources, getTotal, renameAccount, renameSource } from '../db';
import { colors, fonts, radius } from '../theme';
import type { AccountWithBalance, RootStackParamList, SourceWithTotal } from '../types';
import AccountCard from '../components/home/AccountCard';
import AccountModal from '../components/home/AccountModal';
import HeroCard from '../components/home/HeroCard';
import Segmented, { type Tab } from '../components/home/Segmented';
import SourceRow from '../components/home/SourceRow';
import SourceNameModal from '../components/source/SourceNameModal';
import { sourceOptions } from '../components/source/actions';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The last tab is remembered while the app is open (module state outlives the screen).
let lastTab: Tab = 'accounts';

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [sources, setSources] = useState<SourceWithTotal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>(lastTab);
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null);
  const [editingSource, setEditingSource] = useState<SourceWithTotal | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, a, s] = await Promise.all([getTotal(), getAccounts(), getAllSources()]);
      setTotal(t);
      setAccounts(a);
      setSources(s);
    } catch (e) {
      Alert.alert('Could not load your data', errMsg(e));
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

  const changeTab = (t: Tab) => {
    lastTab = t;
    setTab(t);
  };

  // Throws on duplicate name; the modal shows the message inline.
  const saveSource = async (name: string) => {
    if (editingSource && editingSource !== 'new') await renameSource(editingSource.id, name);
    else await addSource(name);
    setEditingSource(null);
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

  const empty = (text: string) => (
    <View style={{ padding: 24, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, alignItems: 'center' }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' }}>{text}</Text>
    </View>
  );
  const emptyAccounts = loaded ? empty('No accounts yet. Add your first account.') : undefined;
  // The Sources tab is one white card, so it renders as the list's empty component (the list data is empty on that tab).
  const sourcesList = !loaded ? undefined : sources.length === 0 ? (
    empty('No sources yet. Add one for each person or origin of money.')
  ) : (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      {sources.map((s, i) => (
        <SourceRow
          key={s.id}
          source={s}
          index={i}
          onPress={() => navigation.navigate('SourceDetail', { sourceId: s.id })}
          onLongPress={() => sourceOptions(s, () => setEditingSource(s), load)}
        />
      ))}
    </View>
  );

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
      <Segmented value={tab} onChange={changeTab} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>{tab === 'accounts' ? 'Accounts' : 'Sources'}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (tab === 'accounts' ? setEditing('new') : setEditingSource('new'))}
          style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 15 }}>{tab === 'accounts' ? '+ Add account' : '+ Add source'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tab === 'accounts' ? accounts : []}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, gap: 12 }}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: 4 }}
        ListEmptyComponent={tab === 'accounts' ? emptyAccounts : sourcesList}
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
      <SourceNameModal
        visible={editingSource !== null}
        title={editingSource && editingSource !== 'new' ? 'Rename source' : 'Add source'}
        initial={editingSource && editingSource !== 'new' ? editingSource.name : ''}
        onSave={saveSource}
        onCancel={() => setEditingSource(null)}
      />
    </View>
  );
}
