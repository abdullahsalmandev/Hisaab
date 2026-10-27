import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';

interface Props { visible: boolean; title: string; initial: string; onSave: (name: string) => Promise<void>; onCancel: () => void; }

// onSave rejecting (e.g. duplicate name) keeps the modal open and shows the message under the input.
export default function SourceModal({ visible, title, initial, onSave, onCancel }: Props) {
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
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim }}>
        <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 20 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.text, marginBottom: 14 }}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Source name (e.g. Ahmed)"
            placeholderTextColor={colors.muted}
            autoFocus
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
