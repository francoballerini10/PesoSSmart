-- ============================================================
-- Pesos$mart — Políticas RLS (Row Level Security)
-- Ejecutar DESPUÉS del schema.sql
-- ============================================================

-- Habilitar RLS en todas las tablas de usuario
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================

CREATE POLICY "profiles: users can view own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: users can update own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- El INSERT lo hace el trigger handle_new_user con SECURITY DEFINER
-- No necesita política de INSERT del usuario

-- ============================================================
-- FINANCIAL PROFILES
-- ============================================================

CREATE POLICY "financial_profiles: users can view own" ON public.financial_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "financial_profiles: users can insert own" ON public.financial_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "financial_profiles: users can update own" ON public.financial_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "financial_profiles: users can delete own" ON public.financial_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- RISK PROFILES
-- ============================================================

CREATE POLICY "risk_profiles: users can view own" ON public.risk_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "risk_profiles: users can insert own" ON public.risk_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "risk_profiles: users can update own" ON public.risk_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- USER INTERESTS
-- ============================================================

CREATE POLICY "user_interests: users can view own" ON public.user_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_interests: users can insert own" ON public.user_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_interests: users can delete own" ON public.user_interests
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- EXPENSE CATEGORIES (catálogo público, solo lectura)
-- ============================================================

CREATE POLICY "expense_categories: anyone can view" ON public.expense_categories
  FOR SELECT USING (true);

-- Solo admins pueden insertar/modificar categorías del sistema
-- (Para la app, los usuarios no crean categorías propias en esta versión)

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE POLICY "expenses: users can view own" ON public.expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "expenses: users can insert own" ON public.expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses: users can update own" ON public.expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "expenses: users can soft delete own" ON public.expenses
  FOR UPDATE USING (auth.uid() = user_id);
  -- El soft delete es un UPDATE (deleted_at = now()), cubierto por la política de update

-- ============================================================
-- EXPENSE RECEIPTS
-- ============================================================

CREATE POLICY "expense_receipts: users can view own" ON public.expense_receipts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "expense_receipts: users can insert own" ON public.expense_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expense_receipts: users can update own" ON public.expense_receipts
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- MONTHLY REPORTS
-- ============================================================

CREATE POLICY "monthly_reports: users can view own" ON public.monthly_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "monthly_reports: users can insert own" ON public.monthly_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "monthly_reports: users can update own" ON public.monthly_reports
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- MARKET INSTRUMENTS (público, solo lectura)
-- ============================================================

CREATE POLICY "market_instruments: anyone can view active" ON public.market_instruments
  FOR SELECT USING (is_active = true);

-- ============================================================
-- INSTRUMENT PRICE HISTORY (público, solo lectura)
-- ============================================================

CREATE POLICY "instrument_price_history: anyone can view" ON public.instrument_price_history
  FOR SELECT USING (true);

-- ============================================================
-- INVESTMENT SIMULATIONS
-- ============================================================

CREATE POLICY "investment_simulations: users can view own" ON public.investment_simulations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "investment_simulations: users can insert own" ON public.investment_simulations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- AI CHAT THREADS
-- ============================================================

CREATE POLICY "ai_chat_threads: users can view own" ON public.ai_chat_threads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_chat_threads: users can insert own" ON public.ai_chat_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_chat_threads: users can update own" ON public.ai_chat_threads
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- AI CHAT MESSAGES
-- ============================================================

CREATE POLICY "ai_chat_messages: users can view own" ON public.ai_chat_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_chat_messages: users can insert own" ON public.ai_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- IMPORTANTE: Los mensajes del asistente los inserta la Edge Function
-- con service_role key, que bypasea RLS. No necesita política de INSERT del usuario.

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

CREATE POLICY "subscriptions: users can view own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Los updates de suscripción son solo desde el backend (webhook de pago)

-- ============================================================
-- FEATURE USAGE LOGS
-- ============================================================

CREATE POLICY "feature_usage_logs: users can view own" ON public.feature_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "feature_usage_logs: users can insert own" ON public.feature_usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- USER ALERTS
-- ============================================================

CREATE POLICY "user_alerts: users can view own" ON public.user_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_alerts: users can update own (mark as read)" ON public.user_alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Ejecutar estos comandos desde la UI de Supabase o via API:
-- 1. Crear bucket: 'expense-receipts' (privado)
-- 2. Crear bucket: 'report-pdfs' (privado)
-- 3. Crear bucket: 'avatars' (público)

-- Política de storage para receipts:
-- Nombre: "users can upload own receipts"
-- Bucket: expense-receipts
-- Operation: INSERT
-- Policy: auth.uid()::text = (storage.foldername(name))[1]

-- Política de storage para read:
-- Nombre: "users can view own receipts"
-- Bucket: expense-receipts
-- Operation: SELECT
-- Policy: auth.uid()::text = (storage.foldername(name))[1]
