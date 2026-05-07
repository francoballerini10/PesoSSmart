export const colors = {
  // Base
  black:        '#212121',
  blackSoft:    '#2A2A2A',
  darkGray:     '#4A4A4A',
  mediumGray:   '#9E9E9E',
  textSecondary:'#757575',
  white:        '#FFFFFF',

  // ── Paleta de marca — verde principal mockup ──────────────────────────────
  primary:    '#2E7D32',
  primaryDim: '#1B5E20',

  secondary: '#FFFFFF',
  tertiary:  '#7B61FF',    // Violeta (accent secundario)
  accent:    '#1976D2',    // Azul info

  red:    '#EF4444',       // Rojo alerta
  yellow: '#F59E0B',       // Advertencia / ajustado

  // Alias
  neon:    '#2E7D32',
  neonDim: '#1B5E20',

  // Semantic
  success: '#2E7D32',
  error:   '#EF4444',
  warning: '#F9A825',
  info:    '#1976D2',

  // Verde suaves para fondos de card
  greenLight: '#E8F5E9',
  greenSoft:  '#C8E6C9',

  // ── Fondos ────────────────────────────────────────────────────────────────
  bg: {
    primary:      '#F6F7F9',   // Fondo general
    secondary:    '#EEEEF2',
    card:         '#FFFFFF',   // Cards blanco puro
    elevated:     '#F2F2F2',   // Superficie elevada
    input:        '#F2F2F2',
    inputFocused: '#E8E8E8',
  },

  // ── Texto ─────────────────────────────────────────────────────────────────
  text: {
    primary:       '#212121',
    secondary:     '#757575',
    tertiary:      '#9E9E9E',
    inverse:       '#FFFFFF',
    accent:        '#2E7D32',
    primary_brand: '#2E7D32',
    error:         '#EF4444',
    warning:       '#F9A825',
  },

  // ── Bordes ────────────────────────────────────────────────────────────────
  border: {
    default: '#E0E0E0',
    subtle:  '#EEEEEE',
    primary: '#2E7D32',
    neon:    '#2E7D32',
    accent:  '#1976D2',
    error:   '#EF4444',
  },

  // ── Clasificación de gastos ───────────────────────────────────────────────
  expense: {
    necessary:  '#1976D2',
    disposable: '#EF4444',
    investable: '#2E7D32',
  },

  transparent:  'transparent',
  overlay:      'rgba(0,0,0,0.48)',
  overlayLight: 'rgba(0,0,0,0.14)',
} as const;

export type Color = typeof colors;
