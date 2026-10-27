import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';

interface Props { visible: boolean; title: string; initial: string; onSave: (name: string) => void; onCancel: () => void; }

export default function AccountModal({ visible, title, initial, onSave, onCancel }: Props) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState(initial);
  useEffect(() => { if (visible) setName(initial); }, [visible, initial]);
  const trimmed = name.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: spacing.md }}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Account name (e.g. Meezan)"
            placeholderTextColor={colors.muted}
            autoFocus
            maxLength={40}
            style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: spacing.md, fontSize: 18 }}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <Pressable onPress={onCancel} style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!trimmed}
              onPress={() => onSave(trimmed)}
              style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary, opacity: trimmed ? 1 : 0.4 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
