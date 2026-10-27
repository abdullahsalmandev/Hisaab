import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';

interface Props { visible: boolean; title: string; initial: string; onSave: (name: string) => void; onCancel: () => void; }

export default function AccountModal({ visible, title, initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (visible) setName(initial); }, [visible, initial]);
  const trimmed = name.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Pressable accessibilityLabel="Close" onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        <View style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 24, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 20, marginBottom: 16 }}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Account name (e.g. Meezan)"
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSave(trimmed)}
            style={{
              minHeight: 52, paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.semibold, color: colors.text,
              backgroundColor: colors.cardAlt, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius.button,
            }}
          />
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
              onPress={() => onSave(trimmed)}
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
