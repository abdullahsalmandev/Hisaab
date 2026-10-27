import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { accountColors, colors, fonts, radius } from '../../theme';
import type { Account } from '../../types';

// colorIndex is the account's position in the full account list, so its dot matches the rest of the app.
export interface Choice { account: Account; colorIndex: number; }
interface Props { visible: boolean; choices: Choice[]; emptyText: string; onPick: (account: Account) => void; onCancel: () => void; }

export default function AccountPickerModal({ visible, choices, emptyText, onPick, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Pressable accessibilityLabel="Close" onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        <View style={{ maxHeight: '80%', backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingTop: 24, overflow: 'hidden' }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 20, marginBottom: 8, paddingHorizontal: 24 }}>Add to account</Text>
          {choices.length ? (
            <ScrollView>
              {choices.map(({ account, colorIndex }, i) => (
                <Pressable
                  key={account.id}
                  accessibilityRole="button"
                  onPress={() => onPick(account)}
                  style={({ pressed }) => ({
                    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24,
                    borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline, opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accountColors[colorIndex % accountColors.length] }} />
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{account.name}</Text>
                  <Feather name="plus" size={20} color={colors.chevron} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 15, paddingHorizontal: 24, paddingBottom: 8 }}>{emptyText}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={{ minHeight: 52, margin: 16, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}
          >
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
