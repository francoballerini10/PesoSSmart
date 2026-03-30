// ============================================================
// SmartPesos — Edge Function: parse-transactions
// Parsea texto copiado de MP/Ualá/Brubank con Groq (texto)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) throw new Error('GROQ_API_KEY no configurada');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text } = await req.json();
    if (!text || text.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Texto vacío o muy corto' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    const prompt = `Sos un asistente que extrae gastos de texto copiado de apps de billetera virtual argentina (Mercado Pago, Ualá, Brubank, Naranja X, etc).

El usuario pegó este texto:
---
${text}
---

Extraé TODOS los movimientos donde se gastó dinero (pagos, compras, transferencias enviadas). Ignorá ingresos (transferencias recibidas, sueldos, recargas recibidas).

Para cada gasto devolvé:
- description: nombre del comercio, persona o servicio (limpio, sin caracteres raros)
- amount: número positivo sin símbolos (ej: "$ 14.000" → 14000, "1.900,50" → 1900.50)
- date: formato YYYY-MM-DD. "hoy" = ${today}, "ayer" = ${yesterday}, "26 mar" o "26/03" = ${currentYear}-03-26
- classification: "necessary" (supermercado, farmacia, transporte, servicios, alquiler), "disposable" (restaurant, bar, ropa, entretenimiento, delivery), "investable" (transferencia a ahorro, FCI, cripto)
- category: una de estas: groceries, food_dining, transport, health, entertainment, clothing, education, home, technology, subscriptions, travel, other

Respondé SOLO con este JSON, sin texto antes ni después:
{"expenses":[{"description":"Nombre","amount":1000,"date":"${today}","classification":"necessary","category":"other"}]}

Si no encontrás ningún gasto: {"expenses":[]}`;

    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    const groqData = await groqResponse.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ expenses: [], debug: JSON.stringify(groqData.error) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return new Response(JSON.stringify({ expenses: [], debug: content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[parse-transactions] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error), expenses: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
