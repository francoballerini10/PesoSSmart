// ============================================================
// SmartPesos — Edge Function: process-screenshot
// Usa Groq Llama 4 Vision para extraer gastos de un screenshot
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

    const { image_base64, image_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: 'Imagen requerida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    const mimeType = image_type ?? 'image/jpeg';
    const imageUrl = `data:${mimeType};base64,${image_base64}`;

    const prompt = `Analizá este screenshot de una app financiera argentina (Mercado Pago, Ualá, Brubank, Naranja X, resumen bancario, etc).

Extraé TODOS los movimientos donde se gastó o pagó dinero. Ignorá ingresos (transferencias recibidas, sueldos, recargas recibidas).

Para cada gasto devolvé:
- description: nombre del comercio, persona o servicio (limpio)
- amount: número positivo sin símbolos (ej: "$ 14.000" → 14000, "$1.900,50" → 1900.5)
- date: formato YYYY-MM-DD. "hoy" = ${today}, "ayer" = ${yesterday}, "26 mar" = ${currentYear}-03-26, "26/03" = ${currentYear}-03-26
- classification: "necessary" (supermercado, farmacia, transporte, servicios, alquiler), "disposable" (restaurant, bar, ropa, delivery, entretenimiento), "investable" (ahorro, FCI, cripto)
- category: una de: groceries, food_dining, transport, health, entertainment, clothing, education, home, technology, subscriptions, travel, other

Respondé SOLO con JSON válido, sin texto antes ni después:
{"expenses":[{"description":"Nombre","amount":1000,"date":"${today}","classification":"necessary","category":"other"}]}

Si no hay gastos visibles: {"expenses":[]}`;

    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    const groqData = await groqResponse.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({
        expenses: [],
        debug: `Sin respuesta del modelo. Error: ${JSON.stringify(groqData.error ?? groqData)}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    console.error('[process-screenshot] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error), expenses: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
