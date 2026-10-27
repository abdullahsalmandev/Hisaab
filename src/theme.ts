// Light theme only. Static tokens: import them directly, there is no hook.
export const colors = {
  background: '#F3F2EE',
  card: '#FFFFFF',
  cardAlt: '#FAF9F6',
  border: '#E4E2DA',
  hairline: '#EEECE5',
  borderStrong: '#D6D3C8',
  text: '#17181A',
  textSecondary: '#3A3C42',
  muted: '#5E6066',
  chevron: '#9A9CA1',
  primary: '#1C2B4A',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#C7D0E3',
  primarySoft: '#E3EAF6',
  inColor: '#157A4A',
  outColor: '#B3261E',
  chip: '#F1EFE8',
  dashed: '#A9A69B',
};

// Pick by account index: accountColors[i % accountColors.length]
export const accountColors = ['#F2B544', '#7FA3D9', '#E58F6B', '#8CC2A4', '#B9A3E0'];

// Pick by source index: avatarTints[i % avatarTints.length]
export const avatarTints = [
  { bg: '#FBEFD3', fg: '#6E4C05' },
  { bg: '#E3EAF6', fg: '#1C2B4A' },
  { bg: '#E4F2EA', fg: '#14532D' },
  { bg: '#F8E3DE', fg: '#7A2418' },
  { bg: '#ECE6F7', fg: '#3F2A6B' },
];

export const radius = { card: 20, hero: 24, button: 18, pill: 22, small: 8 };

// Loaded in App.tsx with useFonts; use these as fontFamily and do not combine with fontWeight.
export const fonts = {
  regular: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
};
