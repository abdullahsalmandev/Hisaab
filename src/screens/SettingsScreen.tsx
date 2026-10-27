import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import app from '../../app.json';
import { exportData, importData } from '../db';
import { colors, fonts, radius } from '../theme';
import Header from '../components/account/Header';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Cheap check so a wrong file is refused before the "replace all data" prompt. importData validates the rest.
function parseBackupFile(text: string): unknown {
  const d = JSON.parse(text);
  if (d?.version !== 1 && d?.version !== 2 && d?.version !== 3) throw new Error('This file is not a Hisaab backup.');
  return d;
}

interface CardProps { title: string; hint: string; button: string; busy: boolean; onPress: () => void; outlined?: boolean; }

function ActionCard({ title, hint, button, busy, onPress, outlined }: CardProps) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{hint}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onPress}
        style={{
          minHeight: 52, marginTop: 16, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
          backgroundColor: outlined ? colors.card : colors.primary, borderWidth: outlined ? 1 : 0, borderColor: colors.borderStrong,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text style={{ color: outlined ? colors.primary : colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>{button}</Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
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
      // '*/*' because Android often reports .json files as octet-stream; bad files fail in parseBackupFile.
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const data = parseBackupFile(await new File(res.assets[0].uri).text());
      Alert.alert('Import backup', 'This will replace all current data. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await importData(data);
              Alert.alert('Import complete', 'Your backup has been restored.');
            } catch (e) {
              Alert.alert('Import failed', `${errMsg(e)}\n\nYour existing data was not changed.`);
            } finally {
              setBusy(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Settings" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}>
        <ActionCard
          title="Export backup"
          hint="Save all accounts, sources and entries as a JSON file you can share or keep."
          button="Export backup"
          busy={busy}
          onPress={exportBackup}
        />
        <ActionCard
          title="Import backup"
          hint="Replace all data with a backup file. Backups from earlier versions of Hisaab work too."
          button="Import backup"
          outlined
          busy={busy}
          onPress={importBackup}
        />
        {busy && <ActivityIndicator color={colors.primary} />}
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 24, gap: 4 }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' }}>Hisaab. All data is stored only on this phone.</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, fontVariant: ['tabular-nums'] }}>Version {app.expo.version}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
