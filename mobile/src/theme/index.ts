export { colors } from './colors';
export { fontFamilies, fontSizes, textVariants, lineHeights, letterSpacings } from './typography';
export { spacing, radius, layout } from './spacing';

// Convenience re-export del theme completo
import { colors } from './colors';
import { fontFamilies, fontSizes, textVariants } from './typography';
import { spacing, radius, layout } from './spacing';

export const theme = {
  colors,
  fonts: fontFamilies,
  fontSizes,
  textVariants,
  spacing,
  radius,
  layout,
} as const;

export type Theme = typeof theme;
