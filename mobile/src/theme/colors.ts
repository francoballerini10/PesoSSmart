export const colors = {
  // Base
  black: '#0a0a0a',
  blackSoft: '#0d0d0d',
  darkGray: '#1a1a1a',
  mediumGray: '#2a2a2a',
  textSecondary: '#888888',
  white: '#f2f0ea',

  // Brand
  neon: '#00e676',
  neonDim: '#00c853',
  red: '#ff3d3d',
  yellow: '#ffe600',

  // Semantic
  success: '#00e676',
  error: '#ff3d3d',
  warning: '#ffe600',
  info: '#82b1ff',

  // Backgrounds
  bg: {
    primary: '#0a0a0a',
    secondary: '#1a1a1a',
    card: '#1a1a1a',
    elevated: '#2a2a2a',
    input: '#1a1a1a',
    inputFocused: '#2a2a2a',
  },

  // Text
  text: {
    primary: '#f2f0ea',
    secondary: '#888888',
    tertiary: '#555555',
    inverse: '#0a0a0a',
    neon: '#00e676',
    error: '#ff3d3d',
    warning: '#ffe600',
  },

  // Borders
  border: {
    default: '#2a2a2a',
    subtle: '#1a1a1a',
    neon: '#00e676',
    error: '#ff3d3d',
  },

  // Expense classification
  expense: {
    necessary: '#82b1ff',
    disposable: '#ff3d3d',
    investable: '#00e676',
  },

  // Transparent
  transparent: 'transparent',

  // Overlays
  overlay: 'rgba(0,0,0,0.7)',
  overlayLight: 'rgba(0,0,0,0.4)',
} as const;

export type Color = typeof colors;
