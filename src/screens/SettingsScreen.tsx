import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { exportData, importData } from '../db';
import { useTheme } from '../theme';
import type { BackupFile } from '../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Shape check only; the db session's importData owns row-level validation.
function parseBackup(text: string): BackupFile {
  const d = JSON.parse(text);
  if (d?.version !== 1 || !Array.isArray(d.accounts) || !Array.isArray(d.entries) || !Array.isArray(d.sources)) {
    throw new Error('This file is not a Hisaab backup.');
  }
  return d;
}

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      const file = new File(Paths.cache, `hisaab-backup-${today()}.json`);
      file.create({ overwrite: true });
      await file.write(JSON.stringify(data, null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Hisaab backup' });
    } catch (e) {
      Alert.alert('Export failed', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    setBusy(true);
    try {
      // '*/*' because Android often reports .json files as octet-stream; bad files fail in parseBackup.
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const data = parseBackup(await new File(res.assets[0].uri).text());
      Alert.alert('Import backup', 'This will replace all current data. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              await importData(data);
              Alert.alert('Import complete', 'Your backup has been restored.');
            } catch (e) {
              Alert.alert('Import failed', errMsg(e));
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Import failed', e instanceof SyntaxError ? 'This file is not valid JSON.' : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) => (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={{ backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, minHeight: 72, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.5 : 1 }}
    >
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: spacing.xs }}>{hint}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.sm }}>
      <Row title="Export backup" hint="Save all data as a JSON file you can share or keep" onPress={exportBackup} />
      <Row title="Import backup" hint="Replace all data with a backup file" onPress={importBackup} />
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: spacing.lg }}>Hisaab. All data is stored only on this phone.</Text>
    </View>
  );
}
