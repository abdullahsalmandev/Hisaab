import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addSource, getAccount, getAccountSources, getUnlinkedSources, linkSource, renameSource, unlinkSource } from '../db';
import { avatarTints, colors, fonts, radius } from '../theme';
import type { AccountSourceBalance, AccountWithBalance, RootStackParamList, Source } from '../types';
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
  const [sources, setSources] = useState<AccountSourceBalance[]>([]);
  const [unlinked, setUnlinked] = useState<Source[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<AccountSourceBalance | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s, u] = await Promise.all([getAccount(accountId), getAccountSources(accountId), getUnlinkedSources(accountId)]);
      setAccount(a);
      setSources(s);
      setUnlinked(u);
    } catch (e) {
      Alert.alert('Could not load sources', errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, [accountId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Throws on duplicate name; the modal shows the message inline.
  const save = async (name: string) => {
    if (editing && editing !== 'new') await renameSource(editing.sourceId, name);
    else await linkSource(accountId, await addSource(name));
    setEditing(null);
    load();
  };

  const pick = async (s: Source) => {
    try {
      await linkSource(accountId, s.id);
    } catch (e) {
      Alert.alert('Could not add source', errMsg(e));
    }
    setEditing(null);
    load();
  };

  const confirmRemove = (s: AccountSourceBalance) =>
    Alert.alert(`Remove ${s.sourceName}?`, `Deletes this source's entries in ${s.accountName}. The source stays in other accounts.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await unlinkSource(accountId, s.sourceId);
          } catch (e) {
            Alert.alert('Could not remove source', errMsg(e));
          }
          load();
        },
      },
    ]);

  const options = (s: AccountSourceBalance) =>
    Alert.alert(s.sourceName, 'Renaming changes the name in every account.', [
      { text: 'Rename', onPress: () => setEditing(s) },
      { text: 'Remove from this account', style: 'destructive', onPress: () => confirmRemove(s) },
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
                    key={s.sourceId}
                    onPress={() => navigation.navigate('Ledger', { accountId, sourceId: s.sourceId })}
                    onLongPress={() => options(s)}
                    accessibilityRole="button"
                    style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tint.bg }}>
                      <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: tint.fg }}>{initials(s.sourceName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>{s.sourceName}</Text>
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
      <SourceModal visible={editing !== null} title={editing && editing !== 'new' ? 'Rename source' : 'Add source'} initial={editing && editing !== 'new' ? editing.sourceName : ''} existing={editing === 'new' ? unlinked : undefined} onPick={pick} onSave={save} onCancel={() => setEditing(null)} />
    </View>
  );
}
