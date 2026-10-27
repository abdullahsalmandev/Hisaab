import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addEntry, addSource, getAccount, getEntry, getSource, getSources, updateEntry } from '../db';
import { formatDate, paisaToInput, parseDateInput, toDateInput } from '../components/account/helpers';
import { colors, fonts, radius } from '../theme';
import type { RootStackParamList, SourceWithBalance } from '../types';
import { toPaisa } from '../utils/money';

type Props = NativeStackScreenProps<RootStackParamList, 'EntryForm'>;

const showError = (err: unknown) => Alert.alert('Error', String(err instanceof Error ? err.message : err));
const label = { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14, marginTop: 24, marginBottom: 8 };
const errorText = { color: colors.outColor, fontFamily: fonts.semibold, fontSize: 13, marginTop: 8 };
const inputBox = {
  backgroundColor: colors.card, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 14, height: 48,
  paddingHorizontal: 14, color: colors.text, fontFamily: fonts.semibold, fontSize: 16,
};

function Chip({ text, active, dashed, icon, onPress }: {
  text: string; active?: boolean; dashed?: boolean; icon?: 'calendar'; onPress: () => void;
}) {
  const fg = active ? colors.primary : dashed ? colors.muted : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 44, borderRadius: radius.pill, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: active ? colors.primarySoft : colors.card,
        borderWidth: active ? 2 : 1, borderColor: active ? colors.primary : dashed ? colors.dashed : colors.borderStrong,
        borderStyle: dashed ? 'dashed' : 'solid',
      }}
    >
      {icon && <Feather name={icon} size={16} color={fg} />}
      <Text style={{ color: fg, fontFamily: active ? fonts.heavy : fonts.bold, fontSize: 15 }}>{text}</Text>
    </Pressable>
  );
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
};

export default function EntryFormScreen({ navigation, route }: Props) {
  const { entryId } = route.params;
  const insets = useSafeAreaInsets();
  const [type, setType] = useState(route.params.type);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountName, setAccountName] = useState('');
  const [sources, setSources] = useState<SourceWithBalance[]>([]);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; source?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const e = entryId ? await getEntry(entryId) : null;
        if (entryId && !e) {
          Alert.alert('Error', 'Entry not found.');
          navigation.goBack();
          return;
        }
        const src = await getSource(e?.sourceId ?? route.params.sourceId);
        if (!src) throw new Error('Source not found.');
        const [acc, list] = await Promise.all([getAccount(src.accountId), getSources(src.accountId)]);
        setAccountId(src.accountId);
        setAccountName(acc?.name ?? '');
        setSources(list);
        setSourceId(src.id);
        if (e) {
          setType(e.type);
          setAmount(paisaToInput(e.amount));
          setDate(toDateInput(new Date(e.date)));
          setOriginalDate(e.date);
        }
      } catch (err) {
        showError(err);
      }
    })();
  }, [entryId, route.params.sourceId, navigation]);

  // A chosen day gets the current time of day; an edit that keeps the day keeps its original timestamp.
  const iso = originalDate && date === toDateInput(new Date(originalDate)) ? originalDate : parseDateInput(date);
  const typeColor = type === 'in' ? colors.inColor : colors.outColor;

  const createSource = async () => {
    if (accountId == null) return;
    try {
      const id = await addSource(accountId, newName);
      setSources(await getSources(accountId));
      setSourceId(id);
      setErrors((x) => ({ ...x, source: undefined }));
      setAdding(false);
      setNewName('');
      setNewError('');
    } catch (err) {
      setNewError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = async () => {
    const paisa = toPaisa(amount);
    setErrors({
      amount: paisa ? undefined : 'Enter a valid amount, e.g. 45,000 or 99.50',
      source: sourceId == null ? 'Pick a source' : undefined,
      date: iso ? undefined : 'Use YYYY-MM-DD, e.g. 2026-10-27',
    });
    if (!iso) setShowDate(true);
    if (!paisa || !iso || sourceId == null) return;

    setSaving(true);
    try {
      const entry = { sourceId, type, amount: paisa, date: iso };
      if (entryId) await updateEntry(entryId, entry);
      else await addEntry(entry);
      navigation.goBack();
    } catch (err) {
      showError(err);
      setSaving(false);
    }
  };

  const half = (value: 'out' | 'in', text: string) => {
    const on = type === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => setType(value)}
        style={{
          flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: on ? (value === 'in' ? colors.inColor : colors.outColor) : 'transparent',
        }}
      >
        <Text style={{ color: on ? colors.onPrimary : colors.textSecondary, fontFamily: fonts.heavy, fontSize: 16 }}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={navigation.goBack}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}
        >
          <Feather name="x" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.heavy, fontSize: 20 }}>{entryId ? 'Edit entry' : 'New entry'}</Text>
          {!!accountName && <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 }}>{accountName}</Text>}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 4 }}>
          {half('out', '− Money out')}
          {half('in', '+ Money in')}
        </View>

        <Text style={label}>Amount</Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.button,
          borderWidth: 2, borderColor: typeColor, paddingHorizontal: 16,
        }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 22 }}>Rs</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.chevron}
            style={{ flex: 1, color: colors.text, fontFamily: fonts.heavy, fontSize: 36, fontVariant: ['tabular-nums'], paddingVertical: 12 }}
          />
        </View>
        {!!errors.amount && <Text style={errorText}>{errors.amount}</Text>}

        <Text style={label}>Source</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sources.map((s) => <Chip key={s.id} text={s.name} active={s.id === sourceId} onPress={() => setSourceId(s.id)} />)}
          <Chip text="+ New source" dashed onPress={() => setAdding((a) => !a)} />
        </View>
        {adding && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Source name"
              placeholderTextColor={colors.chevron}
              autoFocus
              maxLength={40}
              onSubmitEditing={createSource}
              style={[inputBox, { flex: 1 }]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!newName.trim()}
              onPress={createSource}
              style={{ height: 48, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: newName.trim() ? 1 : 0.4 }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.heavy, fontSize: 15 }}>Add</Text>
            </Pressable>
          </View>
        )}
        {!!newError && <Text style={errorText}>{newError}</Text>}
        {!!errors.source && <Text style={errorText}>{errors.source}</Text>}

        <Text style={label}>Date</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip text="Today" active={date === daysAgo(0)} onPress={() => setDate(daysAgo(0))} />
          <Chip text="Yesterday" active={date === daysAgo(1)} onPress={() => setDate(daysAgo(1))} />
          <Chip
            icon="calendar"
            text={iso ? formatDate(iso) : date}
            active={showDate || (date !== daysAgo(0) && date !== daysAgo(1))}
            onPress={() => setShowDate((s) => !s)}
          />
        </View>
        {showDate && (
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.chevron}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            style={[inputBox, { marginTop: 12, fontVariant: ['tabular-nums'] }]}
          />
        )}
        {!!errors.date && <Text style={errorText}>{errors.date}</Text>}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={save}
          style={{ height: 58, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.heavy, fontSize: 17 }}>{saving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
