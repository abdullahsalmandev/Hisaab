import { Alert } from 'react-native';
import { deleteSource } from '../../db';
import type { Source } from '../../types';

// Shared by the Sources tab (long press) and the source page (more button). onDeleted runs only after a successful delete.
export function confirmDeleteSource(s: Source, onDeleted: () => void) {
  Alert.alert(`Delete "${s.name}"?`, 'Deletes this source from all accounts with all its entries', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        try {
          await deleteSource(s.id);
        } catch (e) {
          Alert.alert('Could not delete source', e instanceof Error ? e.message : String(e));
          return;
        }
        onDeleted();
      },
    },
  ]);
}

export function sourceOptions(s: Source, onRename: () => void, onDeleted: () => void) {
  Alert.alert(s.name, 'Renaming changes it in every account.', [
    { text: 'Rename', onPress: onRename },
    { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteSource(s, onDeleted) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
