/**
 * roundUpStore — Redondeo automático estilo Acorns.
 *
 * Cada gasto se redondea al siguiente $500 o $1.000.
 * La diferencia se acumula y el usuario elige el destino:
 *  - 'fci'     → FCI Money Market
 *  - 'savings' → Ahorro en efectivo
 *
 * Los acumulados (semana / mes) se persisten en AsyncStorage.
 * El reseteo semanal/mensual se ejecuta al llamar a `checkReset()`.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RoundTo      = 500 | 1000;
export type RoundDest    = 'fci' | 'savings';

export interface RoundUpState {
  enabled:             boolean;
  roundTo:             RoundTo;
  destination:         RoundDest;
  totalThisWeek:       number;
  totalThisMonth:      number;
  totalAllTime:        number;
  lastResetWeek:       string | null;   // YYYY-Www
  lastResetMonth:      string | null;   // YYYY-MM
  isLoaded:            boolean;

  load:                () => Promise<void>;
  save:                () => Promise<void>;

  /** Configura opciones y persiste */
  configure:           (opts: { enabled?: boolean; roundTo?: RoundTo; destination?: RoundDest }) => Promise<void>;

  /**
   * Registra el redondeo de un gasto.
   * Devuelve el monto redondeado (diferencia) para que el caller pueda mostrarlo.
   */
  recordExpense:       (amount: number) => Promise<number>;

  /** Revisa si hay que resetear contadores semanales/mensuales */
  checkReset:          () => Promise<void>;

  reset:               () => Promise<void>;
}

// ─── Claves ───────────────────────────────────────────────────────────────────

const KEYS = {
  enabled:        '@sp/roundup/enabled',
  roundTo:        '@sp/roundup/roundTo',
  destination:    '@sp/roundup/destination',
  totalWeek:      '@sp/roundup/totalWeek',
  totalMonth:     '@sp/roundup/totalMonth',
  totalAllTime:   '@sp/roundup/totalAllTime',
  lastResetWeek:  '@sp/roundup/lastResetWeek',
  lastResetMonth: '@sp/roundup/lastResetMonth',
};

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function currentWeekStr(): string {
  const d   = new Date();
  const jan = new Date(d.getFullYear(), 0, 1);
  const wk  = Math.ceil(((d.getTime() - jan.getTime()) / 86400000 + jan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Calcula el redondeo: siguiente múltiplo de `roundTo` */
export function computeRoundUp(amount: number, roundTo: RoundTo): number {
  if (amount <= 0) return 0;
  const remainder = amount % roundTo;
  return remainder === 0 ? 0 : roundTo - remainder;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRoundUpStore = create<RoundUpState>((set, get) => ({
  enabled:          false,
  roundTo:          500,
  destination:      'fci',
  totalThisWeek:    0,
  totalThisMonth:   0,
  totalAllTime:     0,
  lastResetWeek:    null,
  lastResetMonth:   null,
  isLoaded:         false,

  load: async () => {
    try {
      const keys = [
        KEYS.enabled, KEYS.roundTo, KEYS.destination,
        KEYS.totalWeek, KEYS.totalMonth, KEYS.totalAllTime,
        KEYS.lastResetWeek, KEYS.lastResetMonth,
      ];
      const results = await AsyncStorage.multiGet(keys);
      const m = Object.fromEntries(results.map(([k, v]) => [k, v]));

      set({
        enabled:        m[KEYS.enabled]      === 'true',
        roundTo:        (parseInt(m[KEYS.roundTo] ?? '500', 10) as RoundTo),
        destination:    (m[KEYS.destination] ?? 'fci') as RoundDest,
        totalThisWeek:  parseFloat(m[KEYS.totalWeek]    ?? '0'),
        totalThisMonth: parseFloat(m[KEYS.totalMonth]   ?? '0'),
        totalAllTime:   parseFloat(m[KEYS.totalAllTime] ?? '0'),
        lastResetWeek:  m[KEYS.lastResetWeek]  ?? null,
        lastResetMonth: m[KEYS.lastResetMonth] ?? null,
        isLoaded:       true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  save: async () => {
    const s = get();
    try {
      await AsyncStorage.multiSet([
        [KEYS.enabled,        String(s.enabled)],
        [KEYS.roundTo,        String(s.roundTo)],
        [KEYS.destination,    s.destination],
        [KEYS.totalWeek,      String(s.totalThisWeek)],
        [KEYS.totalMonth,     String(s.totalThisMonth)],
        [KEYS.totalAllTime,   String(s.totalAllTime)],
        [KEYS.lastResetWeek,  s.lastResetWeek  ?? ''],
        [KEYS.lastResetMonth, s.lastResetMonth ?? ''],
      ]);
    } catch { /* ignore */ }
  },

  configure: async (opts) => {
    set((s) => ({
      enabled:     opts.enabled     !== undefined ? opts.enabled     : s.enabled,
      roundTo:     opts.roundTo     !== undefined ? opts.roundTo     : s.roundTo,
      destination: opts.destination !== undefined ? opts.destination : s.destination,
    }));
    await get().save();
  },

  recordExpense: async (amount) => {
    const s = get();
    if (!s.enabled) return 0;
    const roundUp = computeRoundUp(amount, s.roundTo);
    if (roundUp === 0) return 0;

    set((prev) => ({
      totalThisWeek:  prev.totalThisWeek  + roundUp,
      totalThisMonth: prev.totalThisMonth + roundUp,
      totalAllTime:   prev.totalAllTime   + roundUp,
    }));
    await get().save();
    return roundUp;
  },

  checkReset: async () => {
    const s         = get();
    const thisWeek  = currentWeekStr();
    const thisMonth = currentMonthStr();
    let changed     = false;

    const updates: Partial<RoundUpState> = {};
    if (s.lastResetWeek !== thisWeek) {
      updates.totalThisWeek  = 0;
      updates.lastResetWeek  = thisWeek;
      changed = true;
    }
    if (s.lastResetMonth !== thisMonth) {
      updates.totalThisMonth  = 0;
      updates.lastResetMonth  = thisMonth;
      changed = true;
    }
    if (changed) {
      set(updates as any);
      await get().save();
    }
  },

  reset: async () => {
    set({
      enabled: false, roundTo: 500, destination: 'fci',
      totalThisWeek: 0, totalThisMonth: 0, totalAllTime: 0,
      lastResetWeek: null, lastResetMonth: null,
    });
    await get().save();
  },
}));
