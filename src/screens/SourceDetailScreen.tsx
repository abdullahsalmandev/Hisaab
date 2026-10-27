import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getAccounts, getSourceSummary, linkSource, renameSource, unlinkSource } from '../db';
import { accountColors, colors, fonts, radius } from '../theme';
import type { Account, AccountSourceBalance, RootStackParamList, SourceSummary } from '../types';
import { formatMoney } from '../utils/money';
import { formatShortDate } from '../components/account/helpers';
import AccountPickerModal from '../components/source/AccountPickerModal';
import SourceNameModal from '../components/source/SourceNameModal';
import { sourceOptions } from '../components/source/actions';

type Props = NativeStackScreenProps<RootStackParamList, 'SourceDetail'>;

const num = { fontVariant: ['tabular-nums' as const] };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SourceDetailScreen({ navigation, route }: Props) {
  const { sourceId } = route.params;
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([getSourceSummary(sourceId), getAccounts()]);
      setSummary(s);
      setAccounts(a);
    } catch (e) {
      Alert.alert('Could not load source', errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, [sourceId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Throws on duplicate name; the modal shows the message inline.
  const rename = async (name: string) => {
    await renameSource(sourceId, name);
    setRenaming(false);
    load();
  };

  const add = async (account: Account) => {
    setPicking(false);
    try {
      await linkSource(account.id, sourceId);
    } catch (e) {
      Alert.alert('Could not add to account', errMsg(e));
    }
    load();
  };

  const confirmRemove = (p: AccountSourceBalance) =>
    Alert.alert(`Remove from ${p.accountName}?`, `Deletes this source's entries in ${p.accountName}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await unlinkSource(p.accountId, sourceId);
          } catch (e) {
            Alert.alert('Could not remove from account', errMsg(e));
          }
          load();
        },
      },
    ]);

  const options = (p: AccountSourceBalance) =>
    Alert.alert(p.accountName, undefined, [
      { text: 'Remove from this account', style: 'destructive', onPress: () => confirmRemove(p) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const linked = new Set(summary?.accounts.map((p) => p.accountId));
  const choices = accounts.map((account, colorIndex) => ({ account, colorIndex })).filter(({ account }) => !linked.has(account.id));
  const total = summary?.total ?? 0;
  const addButton = (
    <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.primary }}>+ Add to account</Text>
    </Pressable>
  );
  const mini = (label: string, amount: number, color: string) => (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[num, { fontFamily: fonts.heavy, fontSize: 17, color, marginTop: 2 }]}>{formatMoney(amount)}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 8, paddingBottom: 8 }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 4, fontFamily: fonts.heavy, fontSize: 20, color: colors.text }}>{summary?.source.name ?? ''}</Text>
        {summary ? (
          <Pressable
            onPress={() => sourceOptions(summary.source, () => setRenaming(true), () => navigation.goBack())}
            accessibilityRole="button"
            accessibilityLabel="More"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="more-vertical" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {loaded && !summary ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', paddingVertical: 32 }}>This source no longer exists.</Text>
        ) : (
          <>
            <View style={{ backgroundColor: colors.primary, borderRadius: radius.hero, padding: 24 }}>
              <Text style={{ color: colors.onPrimaryMuted, fontFamily: fonts.semibold, fontSize: 14 }}>Total across all accounts</Text>
              <Text
                accessibilityLabel={`Total across all accounts ${formatMoney(total)}`}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[num, { color: colors.onPrimary, fontFamily: fonts.heavy, fontSize: 36, marginTop: 4 }]}
              >
                {formatMoney(total)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                {mini('Total in', summary?.totalIn ?? 0, colors.inColor)}
                {mini('Total out', summary?.totalOut ?? 0, colors.outColor)}
              </View>
            </View>

            {loaded && summary && summary.accounts.length === 0 ? (
              <View style={{ alignItems: 'center', gap: 16, paddingVertical: 32 }}>
                <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center' }}>Not added to any account yet</Text>
                {addButton}
              </View>
            ) : summary ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
                  <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.text }}>Accounts</Text>
                  {addButton}
                </View>
                <View style={{ backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                  {summary.accounts.map((p, i) => (
                    <Pressable
                      key={p.accountId}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.accountName}, ${formatMoney(p.balance)}`}
                      accessibilityHint="Long press to remove from this account"
                      onPress={() => navigation.navigate('Ledger', { accountId: p.accountId, sourceId })}
                      onLongPress={() => options(p)}
                      style={({ pressed }) => ({
                        minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16,
                        borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline, opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accountColors[Math.max(0, accounts.findIndex((a) => a.id === p.accountId)) % accountColors.length] }} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>{p.accountName}</Text>
                        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>{p.lastEntryDate ? `Last entry ${formatShortDate(p.lastEntryDate)}` : 'No entries yet'}</Text>
                      </View>
                      <Text numberOfLines={1} style={[num, { fontFamily: fonts.heavy, fontSize: 17, color: p.balance < 0 ? colors.outColor : colors.text }]}>{formatMoney(p.balance)}</Text>
                      <Feather name="chevron-right" size={20} color={colors.chevron} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <SourceNameModal visible={renaming} title="Rename source" initial={summary?.source.name ?? ''} onSave={rename} onCancel={() => setRenaming(false)} />
      <AccountPickerModal
        visible={picking}
        choices={choices}
        emptyText={accounts.length ? 'Already in every account' : 'No accounts yet. Add one on the home screen.'}
        onPick={add}
        onCancel={() => setPicking(false)}
      />
    </View>
  );
}
