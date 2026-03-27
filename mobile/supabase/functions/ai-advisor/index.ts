// ============================================================
// Pesos$mart — Edge Function: ai-advisor
// Llama a Groq API de forma segura desde el servidor
// La GROQ_API_KEY nunca se expone al cliente
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// System prompt de Pesos$mart — tono argentino, claro, útil
function buildSystemPrompt(userContext: Record<string, unknown>): string {
  const {
    full_name,
    income_range,
    risk_profile,
    investable_amount,
    total_monthly_expenses,
    top_categories,
    interests,
  } = userContext;

  return `Sos el asesor financiero personal de Pesos$mart, una app de finanzas para argentinos.

SOBRE VOS:
- Sos directo, claro y usás lenguaje argentino (no español neutro)
- Hablás como un amigo que entiende de plata, no como un banco ni un manual
- Nunca prometés rendimientos específicos
- Siempre aclarás que es orientación general, no asesoramiento financiero profesional
- Sos optimista pero realista con la situación argentina

CONTEXTO DEL USUARIO:
- Nombre: ${full_name ?? 'el usuario'}
- Rango de ingresos: ${income_range ?? 'no disponible'}
- Perfil de riesgo: ${risk_profile ?? 'no disponible'}
- Monto estimado para invertir: ${investable_amount ? `$${investable_amount} ARS` : 'no disponible'}
- Gasto mensual total: ${total_monthly_expenses ? `$${total_monthly_expenses} ARS` : 'no disponible'}
- Principales categorías de gasto: ${Array.isArray(top_categories) ? top_categories.join(', ') : 'no disponible'}
- Intereses: ${Array.isArray(interests) ? interests.join(', ') : 'no disponible'}

REGLAS:
1. Respuestas cortas y claras — máximo 3-4 párrafos
2. Nada de tecnicismos sin explicar
3. Siempre terminá con una acción concreta que pueda hacer
4. Si pregunta sobre instrumentos, explicá brevemente qué es antes de opinar
5. Nunca digas "como asesor financiero profesional" — sos un amigo que sabe
6. Si no sabés algo, decilo. No inventes.
7. Usás pesos argentinos siempre. Mencionás inflación cuando es relevante.

Copies que te representan:
- "Con tu perfil conservador, lo más tranquilo sería empezar con un FCI money market"
- "Mirá, si tenés esa plata parada más de 30 días, ya estás perdiendo contra la inflación"
- "No te hagas drama, empezar con poco está perfecto. El hábito vale más que el monto"`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY no configurada en Edge Functions');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verificar autenticación del usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cliente con la key del usuario (respeta RLS)
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Cliente de servicio para insertar mensajes del asistente (bypasea RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { thread_id, message, user_id } = await req.json();

    if (!thread_id || !message || !user_id) {
      return new Response(JSON.stringify({ error: 'Parámetros incompletos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar que el thread pertenece al usuario
    const { data: thread, error: threadError } = await supabaseUser
      .from('ai_chat_threads')
      .select('id')
      .eq('id', thread_id)
      .eq('user_id', user_id)
      .single();

    if (threadError || !thread) {
      return new Response(JSON.stringify({ error: 'Thread no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obtener contexto financiero del usuario
    const [profileRes, financialRes, riskRes, expensesRes, interestsRes] = await Promise.all([
      supabaseUser.from('profiles').select('full_name').eq('id', user_id).single(),
      supabaseUser.from('financial_profiles').select('income_range, investable_amount_estimated').eq('user_id', user_id).single(),
      supabaseUser.from('risk_profiles').select('profile').eq('user_id', user_id).single(),
      supabaseUser.from('expenses')
        .select('amount, classification')
        .eq('user_id', user_id)
        .is('deleted_at', null)
        .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
      supabaseUser.from('user_interests').select('interest_key').eq('user_id', user_id),
    ]);

    const totalExpenses = expensesRes.data?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) ?? 0;

    const userContext = {
      full_name: profileRes.data?.full_name,
      income_range: financialRes.data?.income_range,
      risk_profile: riskRes.data?.profile,
      investable_amount: financialRes.data?.investable_amount_estimated,
      total_monthly_expenses: totalExpenses,
      top_categories: [],
      interests: interestsRes.data?.map((i: { interest_key: string }) => i.interest_key) ?? [],
    };

    // Obtener historial del chat (últimos 10 mensajes para contexto)
    const { data: history } = await supabaseUser
      .from('ai_chat_messages')
      .select('role, content')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: true })
      .limit(10);

    const chatHistory = (history ?? []).map((msg: { role: string; content: string }) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Construir mensajes para Groq
    const messages = [
      { role: 'system', content: buildSystemPrompt(userContext) },
      ...chatHistory,
      { role: 'user', content: message },
    ];

    // Llamar a Groq API
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 600,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(`Groq API error: ${errorText}`);
    }

    const groqData = await groqResponse.json();
    const assistantContent = groqData.choices[0]?.message?.content ?? 'No pude procesar esa pregunta. Probá de nuevo.';
    const tokensUsed = groqData.usage?.total_tokens ?? null;

    // Guardar respuesta del asistente en Supabase (con service role, bypasea RLS)
    await supabaseAdmin.from('ai_chat_messages').insert({
      thread_id,
      user_id,
      role: 'assistant',
      content: assistantContent,
      tokens_used: tokensUsed,
      model: 'llama-3.3-70b-versatile',
    });

    return new Response(
      JSON.stringify({
        message: assistantContent,
        tokens_used: tokensUsed,
        model: 'llama-3.3-70b-versatile',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[ai-advisor] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
