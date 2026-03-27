export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
} as const;

export const radius = {
  none: 0,
  sm: 2,
  base: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const;

// Layout constants
export const layout = {
  screenPadding: spacing[5],
  cardPadding: spacing[4],
  sectionSpacing: spacing[8],
  headerHeight: 56,
  tabBarHeight: 64,
  inputHeight: 52,
  buttonHeight: 52,
  buttonHeightSm: 40,
} as const;
