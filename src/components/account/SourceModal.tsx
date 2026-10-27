import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';
import type { Source } from '../../types';

// existing + onPick: tappable chips of sources that can be linked instead of created (Add source only).
interface Props { visible: boolean; title: string; initial: string; existing?: Source[]; onPick?: (s: Source) => void; onSave: (name: string) => Promise<void>; onCancel: () => void; }
const sectionLabel = { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted, marginBottom: 8 };

// onSave rejecting (e.g. duplicate name) keeps the modal open and shows the message under the input.
export default function SourceModal({ visible, title, initial, existing, onPick, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) { setName(initial); setError(''); } }, [visible, initial]);
  const trimmed = name.trim();
  const picking = !!existing?.length && !!onPick;

  const save = async () => {
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim }}>
        <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 20 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.text, marginBottom: 14 }}>{title}</Text>
          {picking && (
            <>
              <Text style={sectionLabel}>Add an existing source</Text>
              <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {existing.map((s) => (
                    <Pressable key={s.id} onPress={() => onPick(s)} accessibilityRole="button" style={{ height: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.borderStrong }}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.textSecondary }}>{s.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={sectionLabel}>Or create new</Text>
            </>
          )}
          <TextInput
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Source name (e.g. Ahmed)"
            placeholderTextColor={colors.muted}
            autoFocus={!picking}
            maxLength={40}
            style={{ fontFamily: fonts.semibold, fontSize: 17, color: colors.text, borderColor: error ? colors.outColor : colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}
          />
          {error ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.outColor, marginTop: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable onPress={onCancel} accessibilityRole="button" style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable disabled={!trimmed} onPress={save} accessibilityRole="button" style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary, opacity: trimmed ? 1 : 0.4 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onPrimary }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
