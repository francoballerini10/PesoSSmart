export * from './database';

// ---- Tipos de navegación ----
export type AuthStackParamList = {
  splash: undefined;
  login: undefined;
  register: undefined;
  forgotPassword: undefined;
};

export type OnboardingStackParamList = {
  welcome: undefined;
  financialProfile: undefined;
  interests: undefined;
  riskProfile: undefined;
  summary: undefined;
};

export type AppTabParamList = {
  home: undefined;
  expenses: undefined;
  advisor: undefined;
  reports: undefined;
  profile: undefined;
};

// ---- Tipos de UI ----
export interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
  icon?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// ---- Tipos de formularios ----
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ForgotPasswordForm {
  email: string;
}

export interface FinancialProfileForm {
  income_range: string;
  fixed_expenses_estimated: string;
  work_type: string;
  family_status: string;
  dependents_count: string;
  has_savings: boolean;
  savings_amount: string;
  has_debt: boolean;
  debt_amount: string;
  financial_goal: string;
}

export interface ExpenseForm {
  description: string;
  amount: string;
  category_id: string;
  date: string;
  payment_method: string;
  notes: string;
  is_recurring: boolean;
}

// ---- Tipos del simulador ----
export interface SimulatorInput {
  amount: number;
  start_date: string;
  end_date: string;
  instrument_id: string;
}

export interface SimulatorResult {
  initial_amount: number;
  final_amount: number;
  return_pct: number;
  real_return_pct: number | null;
  inflation_during_period: number | null;
  chart_data: Array<{ date: string; value: number }>;
}

// ---- Tipos del asesor IA ----
export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AdvisorContext {
  income_range: string | null;
  investable_amount: number | null;
  risk_profile: string | null;
  top_expense_categories: string[];
  total_monthly_expenses: number;
  interests: string[];
}

// ---- Tipos de features/plan ----
export type PlanFeature =
  | 'ai_chat'
  | 'receipt_scan'
  | 'simulator'
  | 'monthly_report'
  | 'export_pdf'
  | 'unlimited_expenses';

export interface PlanLimits {
  ai_messages_per_month: number;
  receipt_scans_per_month: number;
  simulations_per_month: number;
  expenses_per_month: number | null; // null = ilimitado
}

export const PLAN_LIMITS: Record<'free' | 'pro', PlanLimits> = {
  free: {
    ai_messages_per_month: 10,
    receipt_scans_per_month: 5,
    simulations_per_month: 3,
    expenses_per_month: 50,
  },
  pro: {
    ai_messages_per_month: -1, // ilimitado
    receipt_scans_per_month: -1,
    simulations_per_month: -1,
    expenses_per_month: null,
  },
};
