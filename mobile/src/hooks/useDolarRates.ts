import { useEffect, useState } from 'react';

export type DolarType = 'oficial' | 'blue' | 'mep';

export interface DolarRates {
  oficial: number | null;
  blue:    number | null;
  mep:     number | null;
}

export const DOLAR_LABELS: Record<DolarType, string> = {
  oficial: 'Oficial',
  blue:    'Blue',
  mep:     'MEP',
};

const API_URL = 'https://api.bluelytics.com.ar/v2/latest';

// Cache liviano solo para el display del formulario (1 minuto)
let _cache: { rates: DolarRates; ts: number } | null = null;
const CACHE_MS = 60 * 1000;

function parseRates(json: any): DolarRates {
  return {
    oficial: json.oficial?.value_sell      ?? null,
    blue:    json.blue?.value_sell          ?? null,
    mep:     json.oficial_euro?.value_sell  ?? null,
  };
}

// ── Fetch fresco, sin cache — para usar al momento de guardar ──────────────
export async function fetchDolarRateNow(type: DolarType): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`bluelytics ${res.status}`);
  const json   = await res.json();
  const rates  = parseRates(json);
  const value  = rates[type];
  if (!value) throw new Error(`Cotización ${type} no disponible`);
  // Actualizar cache de paso
  _cache = { rates, ts: Date.now() };
  return value;
}

// ── Hook para mostrar cotización en el formulario (cache corto) ────────────
export function useDolarRates() {
  const [rates,   setRates]   = useState<DolarRates>({ oficial: null, blue: null, mep: null });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (_cache && Date.now() - _cache.ts < CACHE_MS) {
        if (!cancelled) { setRates(_cache.rates); setLoading(false); }
        return;
      }
      try {
        const res  = await fetch(API_URL);
        if (!res.ok) throw new Error('fetch failed');
        const json   = await res.json();
        const parsed = parseRates(json);
        _cache = { rates: parsed, ts: Date.now() };
        if (!cancelled) { setRates(parsed); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { rates, loading, error, labels: DOLAR_LABELS };
}
