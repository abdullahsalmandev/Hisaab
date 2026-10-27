import { useColorScheme } from 'react-native';

const light = {
  background: '#f4f5f7', card: '#ffffff', text: '#111827', muted: '#6b7280',
  border: '#e5e7eb', primary: '#2563eb', inColor: '#16a34a', outColor: '#dc2626',
};
const dark = {
  background: '#0b0f14', card: '#161b22', text: '#f3f4f6', muted: '#9ca3af',
  border: '#2d333b', primary: '#60a5fa', inColor: '#4ade80', outColor: '#f87171',
};
const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export function useTheme() {
  return { colors: useColorScheme() === 'dark' ? dark : light, spacing };
}
