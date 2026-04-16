export const colors = {
  // Base
  black:        '#1A1A1A',
  blackSoft:    '#2A2A2A',
  darkGray:     '#4A4A4A',
  mediumGray:   '#9E9E9E',
  textSecondary:'#5C5C5C',
  white:        '#FFFFFF',

  // ── Paleta de marca — verde bosque del logo ───────────────────────────────
  // Botones, acciones principales, highlights
  primary:    '#1D6E47',   // Verde bosque profundo (CTA principal)
  primaryDim: '#165838',   // Versión más oscura (pressed/disabled)

  secondary: '#FFFFFF',
  tertiary:  '#7B61FF',    // Violeta (accent secundario)
  accent:    '#1978E5',    // Azul (info / gastos necesarios / links)

  red:    '#E53935',       // Error / gastos prescindibles
  yellow: '#F59E0B',       // Advertencia / ajustado

  // Alias para compatibilidad con screens existentes
  neon:    '#1D6E47',
  neonDim: '#165838',

  // Semantic
  success: '#1D6E47',
  error:   '#E53935',
  warning: '#F59E0B',
  info:    '#1978E5',

  // ── Fondos — blanco cálido con tinte crema ───────────────────────────────
  bg: {
    primary:      '#F8F7F4',   // Fondo principal — blanco crema cálido
    secondary:    '#F1F0EC',   // Fondo secundario
    card:         '#FFFFFF',   // Cards — blanco puro para contraste vs fondo
    elevated:     '#F4F3EF',   // Superficie elevada
    input:        '#EDECEA',   // Input background
    inputFocused: '#E5E3E0',   // Input focused
  },

  // ── Texto ─────────────────────────────────────────────────────────────────
  text: {
    primary:       '#1A1A1A',  // Texto principal
    secondary:     '#5A5A5A',  // Texto secundario
    tertiary:      '#9A9A9A',  // Texto terciario / hint
    inverse:       '#FFFFFF',  // Texto sobre fondos oscuros/brand
    accent:        '#1D6E47',  // Texto brand (verde)
    primary_brand: '#1D6E47',
    error:         '#E53935',
    warning:       '#F59E0B',
  },

  // ── Bordes — gris cálido ──────────────────────────────────────────────────
  border: {
    default: '#E0DDD7',   // Borde estándar — gris cálido
    subtle:  '#ECEAE6',   // Borde sutil
    primary: '#1D6E47',   // Borde brand (verde)
    neon:    '#1D6E47',
    accent:  '#1978E5',   // Borde azul (info)
    error:   '#E53935',
  },

  // ── Clasificación de gastos (colores semánticos — no cambiar) ─────────────
  expense: {
    necessary:  '#1978E5',   // Azul — gastos necesarios
    disposable: '#E53935',   // Rojo — gastos prescindibles
    investable: '#1D6E47',   // Verde bosque — gastos invertibles
  },

  transparent:  'transparent',
  overlay:      'rgba(0,0,0,0.48)',
  overlayLight: 'rgba(0,0,0,0.14)',
} as const;

export type Color = typeof colors;
