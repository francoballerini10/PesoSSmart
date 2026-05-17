// indec-sync — sincroniza IPC INDEC mensual a market_rates
// Fuente: sh_ipc_aperturas.xls (INDEC FTP) + datos.gob.ar (IPC general)
// Estrategia: promedio ponderado regional → nivel nacional

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ponderaciones regionales INDEC (canasta IPC base dic 2016)
const REGIONAL_WEIGHTS: Record<string, number> = {
  gba:       0.422,
  pampeana:  0.253,
  noroeste:  0.110,
  noreste:   0.071,
  cuyo:      0.091,
  patagonia: 0.053,
};

// [keyword en nombre de fila, instrument key en market_rates, label display]
const DIVISION_MAP: Array<[string, string, string]> = [
  ['nivel general',     'inflation',             'IPC Nivel General'],
  ['alimentos y beb',   'inflation_food',        'IPC Alimentos y bebidas'],
  ['prendas de vestir', 'inflation_clothing',    'IPC Indumentaria'],
  ['vivienda',          'inflation_housing',     'IPC Vivienda y servicios'],
  ['equipamiento',      'inflation_equipment',   'IPC Equipamiento del hogar'],
  ['salud',             'inflation_health',      'IPC Salud'],
  ['transporte',        'inflation_transport',   'IPC Transporte'],
  ['comunicaci',        'inflation_comms',       'IPC Comunicación'],
  ['recreaci',          'inflation_recreation',  'IPC Recreación y cultura'],
  ['educaci',           'inflation_education',   'IPC Educación'],
  ['restaurantes',      'inflation_restaurants', 'IPC Restaurantes y hoteles'],
];

function normalize(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const cronSecret  = Deno.env.get('INDEC_SYNC_SECRET') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';
  if (cronSecret && !authHeader.includes(cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const log: string[] = [];

  // ── 1. Descargar y parsear XLS regional del INDEC ─────────────────────────
  // acc[instrument] = { total: suma ponderada, weight: suma de pesos }
  const acc: Record<string, { total: number; weight: number }> = {};
  let lastColDate: string | null = null;

  try {
    const res = await fetchWithTimeout(
      'https://www.indec.gob.ar/ftp/cuadros/economia/sh_ipc_aperturas.xls',
      25000,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    // Hoja 0 = "Variación mensual aperturas"
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let currentRegion: string | null = null;
    let lastCol = -1;

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const col0 = normalize(row[0]);
      if (!col0) continue;

      // Fila de encabezado de región: tiene fechas Excel (>40000) en columnas siguientes
      if (col0.includes('regi')) {
        const regionKey =
          col0.includes('gba')       ? 'gba'
          : col0.includes('pampeana')  ? 'pampeana'
          : col0.includes('noroeste')  ? 'noroeste'
          : col0.includes('noreste')   ? 'noreste'
          : col0.includes('cuyo')      ? 'cuyo'
          : col0.includes('patagonia') ? 'patagonia'
          : null;

        currentRegion = regionKey;
        lastCol = -1;

        // Buscar la última columna con fecha Excel (> dic 2010 = ~40500)
        for (let c = row.length - 1; c >= 1; c--) {
          const v = row[c];
          if (typeof v === 'number' && v > 40500) {
            lastCol = c;
            const d = new Date((v - 25569) * 86400 * 1000);
            lastColDate = d.toISOString().substring(0, 7);
            break;
          }
        }
        log.push(`Región: ${regionKey ?? '?'} → col ${lastCol}, período: ${lastColDate}`);
        continue;
      }

      if (!currentRegion || lastCol < 0) continue;

      const val = (row as number[])[lastCol];
      if (typeof val !== 'number' || isNaN(val) || val < -20 || val > 30) continue;

      const weight = REGIONAL_WEIGHTS[currentRegion] ?? 0;
      for (const [keyword, instrument] of DIVISION_MAP) {
        if (col0.includes(keyword)) {
          if (!acc[instrument]) acc[instrument] = { total: 0, weight: 0 };
          acc[instrument].total  += val * weight;
          acc[instrument].weight += weight;
          break;
        }
      }
    }

    log.push(`Divisiones encontradas en XLS: ${Object.keys(acc).join(', ')}`);
  } catch (e) {
    log.push(`Error XLS: ${e}`);
  }

  // ── 2. IPC general de datos.gob.ar (más preciso que el ponderado) ─────────
  try {
    const res = await fetchWithTimeout(
      'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=2&sort=desc&format=json',
      8000,
    );
    if (res.ok) {
      const json = await res.json();
      const data: [string, number][] = json?.data ?? [];
      if (data.length >= 2) {
        const monthly = +((data[0][1] / data[1][1] - 1) * 100).toFixed(2);
        // Reemplaza el promedio ponderado con el valor oficial más preciso
        acc['inflation'] = { total: monthly, weight: 1 };
        log.push(`datos.gob.ar IPC general: ${monthly}% (${data[0][0]})`);
      }
    }
  } catch (e) {
    log.push(`Error datos.gob.ar: ${e}`);
  }

  // ── 3. Construir actualizaciones y normalizar pesos ────────────────────────
  const updates: Record<string, number> = {};
  for (const [instr, { total, weight }] of Object.entries(acc)) {
    if (weight > 0) updates[instr] = +(total / weight).toFixed(2);
  }

  if (Object.keys(updates).length === 0) {
    return new Response(
      JSON.stringify({ error: 'No se pudo obtener datos del INDEC', log }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // ── 4. Upsert en market_rates ──────────────────────────────────────────────
  const labelMap = Object.fromEntries(DIVISION_MAP.map(([, k, l]) => [k, l]));
  const now = new Date().toISOString();
  const upserted: string[] = [];

  for (const [instrument, rate] of Object.entries(updates)) {
    const { error } = await sb.from('market_rates').upsert(
      { instrument, rate_monthly: rate, label: labelMap[instrument] ?? instrument, updated_at: now },
      { onConflict: 'instrument' },
    );
    if (!error) upserted.push(`${instrument}=${rate}`);
    else log.push(`DB error ${instrument}: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ period: lastColDate, upserted, log }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
