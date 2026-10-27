import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addSource, deleteSource, getAccount, getSources, renameSource } from '../db';
import { avatarTints, colors, fonts, radius } from '../theme';
import type { AccountWithBalance, RootStackParamList, SourceWithBalance } from '../types';
import { formatMoney } from '../utils/money';
import Header from '../components/account/Header';
import SourceModal from '../components/account/SourceModal';
import { formatShortDate, initials } from '../components/account/helpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

const num = { fontVariant: ['tabular-nums' as const] };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function AccountScreen({ navigation, route }: Props) {
  const { accountId } = route.params;
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<AccountWithBalance | null>(null);
  const [sources, setSources] = useState<SourceWithBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<SourceWithBalance | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([getAccount(accountId), getSources(accountId)]);
      setAccount(a);
      setSources(s);
    } catch (e) {
      Alert.alert('Could not load sources', errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, [accountId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Throws on duplicate name; the modal shows the message inline.
  const save = async (name: string) => {
    if (editing && editing !== 'new') await renameSource(editing.id, name);
    else await addSource(accountId, name);
    setEditing(null);
    load();
  };

  const confirmDelete = (s: SourceWithBalance) =>
    Alert.alert(`Delete ${s.name}?`, 'This deletes the source and all its entries', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSource(s.id);
          } catch (e) {
            Alert.alert('Could not delete source', errMsg(e));
          }
          load();
        },
      },
    ]);

  const options = (s: SourceWithBalance) =>
    Alert.alert(s.name, undefined, [
      { text: 'Rename', onPress: () => setEditing(s) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(s) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const balance = account?.balance ?? 0;
  const addButton = (
    <Pressable onPress={() => setEditing('new')} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.primary }}>+ Add source</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={account?.name ?? ''} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.muted }}>Balance</Text>
          <Text style={[num, { fontFamily: fonts.heavy, fontSize: 42, color: balance < 0 ? colors.outColor : colors.primary }]}>{formatMoney(balance)}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>Across {sources.length} {sources.length === 1 ? 'source' : 'sources'}</Text>
        </View>

        {loaded && sources.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 16, paddingVertical: 32 }}>
            <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center' }}>No sources yet. Add one for each person or origin of money.</Text>
            {addButton}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.text }}>Sources</Text>
              {addButton}
            </View>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {sources.map((s, i) => {
                const tint = avatarTints[i % avatarTints.length];
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => navigation.navigate('Source', { sourceId: s.id })}
                    onLongPress={() => options(s)}
                    accessibilityRole="button"
                    style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tint.bg }}>
                      <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: tint.fg }}>{initials(s.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>{s.name}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>{s.lastEntryDate ? `Last entry ${formatShortDate(s.lastEntryDate)}` : 'No entries yet'}</Text>
                    </View>
                    <Text style={[num, { fontFamily: fonts.heavy, fontSize: 17, color: s.balance < 0 ? colors.outColor : colors.text }]}>{formatMoney(s.balance)}</Text>
                    <Feather name="chevron-right" size={20} color={colors.chevron} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 16 }}>Tap a source to see its entries and add money in or out.</Text>
          </>
        )}
      </ScrollView>
      <SourceModal visible={editing !== null} title={editing && editing !== 'new' ? 'Rename source' : 'Add source'} initial={editing && editing !== 'new' ? editing.name : ''} onSave={save} onCancel={() => setEditing(null)} />
    </View>
  );
}
