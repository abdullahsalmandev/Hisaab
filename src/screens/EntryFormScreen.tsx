import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addEntry, getEntry, getSources, updateEntry } from '../db';
import { paisaToInput, parseDateInput, toDateInput } from '../components/account/helpers';
import { useTheme } from '../theme';
import type { RootStackParamList, Source } from '../types';
import { toPaisa } from '../utils/money';

type Props = NativeStackScreenProps<RootStackParamList, 'EntryForm'>;

const showError = (err: unknown) => Alert.alert('Error', String(err instanceof Error ? err.message : err));

export default function EntryFormScreen({ navigation, route }: Props) {
  const { accountId, type, entryId } = route.params;
  const { colors, spacing } = useTheme();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toDateInput(new Date()));
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [errors, setErrors] = useState<{ amount?: string; source?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: entryId ? 'Edit entry' : type === 'in' ? 'Add Ingoing' : 'Add Outgoing' });
    (async () => {
      try {
        if (type === 'in') setSources(await getSources());
        if (entryId) {
          const e = await getEntry(entryId);
          if (!e) {
            Alert.alert('Error', 'Entry not found.');
            navigation.goBack();
            return;
          }
          setAmount(paisaToInput(e.amount));
          setSource(e.source ?? '');
          setNote(e.note ?? '');
          setDate(toDateInput(new Date(e.date)));
          setOriginalDate(e.date);
        }
      } catch (err) {
        showError(err);
      }
    })();
  }, [entryId, type, navigation]);

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toDateInput(d);
  };

  const save = async () => {
    const paisa = toPaisa(amount);
    // Unchanged day on edit keeps the original timestamp.
    const iso = originalDate && date === toDateInput(new Date(originalDate)) ? originalDate : parseDateInput(date);
    const next = {
      amount: paisa ? undefined : 'Enter a valid amount, e.g. 45,000 or 99.50',
      source: type === 'in' && !source.trim() ? 'Source is required' : undefined,
      date: iso ? undefined : 'Use YYYY-MM-DD, e.g. 2026-10-25',
    };
    setErrors(next);
    if (!paisa || !iso || next.source) return;

    setSaving(true);
    const entry = {
      accountId,
      type,
      amount: paisa,
      source: type === 'in' ? source.trim() : null,
      note: note.trim() || null,
      date: iso,
    };
    try {
      if (entryId) await updateEntry(entryId, entry);
      else await addEntry(entry);
      navigation.goBack();
    } catch (err) {
      showError(err);
      setSaving(false);
    }
  };

  const input = {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    color: colors.text, padding: spacing.md, fontSize: 16,
  };
  const label = { color: colors.muted, marginTop: spacing.md, marginBottom: spacing.xs };
  const error = (msg?: string) => (msg ? <Text style={{ color: colors.outColor, marginTop: spacing.xs }}>{msg}</Text> : null);
  const pill = (text: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={text}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        borderColor: active ? colors.primary : colors.border, borderWidth: 1, borderRadius: 16,
        paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.text }}>{text}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={label}>Amount</Text>
      <TextInput
        style={input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        autoFocus
        placeholder="0"
        placeholderTextColor={colors.muted}
      />
      {error(errors.amount)}

      {type === 'in' && (
        <>
          <Text style={label}>Source</Text>
          <TextInput
            style={input}
            value={source}
            onChangeText={setSource}
            placeholder="Who or where from"
            placeholderTextColor={colors.muted}
          />
          {error(errors.source)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
            {sources.map((s) => pill(s.name, source === s.name, () => setSource(s.name)))}
          </View>
        </>
      )}

      <Text style={label}>Note (optional)</Text>
      <TextInput
        style={input}
        value={note}
        onChangeText={setNote}
        placeholder="Note"
        placeholderTextColor={colors.muted}
      />

      <Text style={label}>Date</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        {pill('Today', date === daysAgo(0), () => setDate(daysAgo(0)))}
        {pill('Yesterday', date === daysAgo(1), () => setDate(daysAgo(1)))}
      </View>
      <TextInput
        style={input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error(errors.date)}

      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={save}
        style={{
          backgroundColor: colors.primary, opacity: saving ? 0.5 : 1, borderRadius: 12,
          padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>{saving ? 'Saving...' : 'Save'}</Text>
      </Pressable>
    </ScrollView>
  );
}
