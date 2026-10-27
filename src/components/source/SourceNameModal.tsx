import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';

interface Props { visible: boolean; title: string; initial: string; onSave: (name: string) => Promise<void>; onCancel: () => void; }

// Add or rename a global source. onSave rejecting (e.g. duplicate name) keeps the modal open and shows the message under the input.
export default function SourceNameModal({ visible, title, initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) { setName(initial); setError(''); } }, [visible, initial]);
  const trimmed = name.trim();

  const save = async () => {
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Pressable accessibilityLabel="Close" onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 24, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 20, marginBottom: 16 }}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Source name (e.g. Ahmed)"
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && save()}
            style={{
              minHeight: 52, paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.semibold, color: colors.text,
              backgroundColor: colors.cardAlt, borderColor: error ? colors.outColor : colors.borderStrong, borderWidth: 1, borderRadius: radius.button,
            }}
          />
          {error ? <Text style={{ color: colors.outColor, fontFamily: fonts.semibold, fontSize: 13, marginTop: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!trimmed}
              onPress={save}
              style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.primary, opacity: trimmed ? 1 : 0.4 }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
