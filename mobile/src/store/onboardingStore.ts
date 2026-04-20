import { create } from 'zustand';
import type {
  FinancialProfile,
  RiskProfileRecord,
  UserInterest,
  IncomeRange,
  WorkType,
  FamilyStatus,
  RiskProfile,
} from '@/types';
import { supabase as _supabase, handleSupabaseError } from '@/lib/supabase';
const supabase = _supabase as any;

interface OnboardingData {
  // Step 1 — Perfil financiero
  income_range: IncomeRange | null;
  fixed_expenses_estimated: number | null;
  work_type: WorkType | null;
  family_status: FamilyStatus | null;
  dependents_count: number;
  has_savings: boolean;
  savings_amount: number | null;
  has_debt: boolean;
  debt_amount: number | null;
  financial_goal: string | null;
  investable_amount_estimated: number | null;
  // Step 2 — Intereses
  selected_interests: string[];
  // Step 3 — Perfil de riesgo
  risk_profile: RiskProfile | null;
  risk_score: number;
  risk_answers: Record<string, string>;
}

interface OnboardingState extends OnboardingData {
  currentStep: number;
  totalSteps: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setFinancialProfile: (data: Partial<OnboardingData>) => void;
  setInterests: (interests: string[]) => void;
  setRiskProfile: (profile: RiskProfile, score: number, answers: Record<string, string>) => void;
  saveFinancialProfile: (userId: string) => Promise<void>;
  saveInterests: (userId: string) => Promise<void>;
  saveRiskProfile: (userId: string) => Promise<void>;
  completeOnboarding: (userId: string) => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

const initialData: OnboardingData = {
  income_range: null,
  fixed_expenses_estimated: null,
  work_type: null,
  family_status: null,
  dependents_count: 0,
  has_savings: false,
  savings_amount: null,
  has_debt: false,
  debt_amount: null,
  financial_goal: null,
  investable_amount_estimated: null,
  selected_interests: [],
  risk_profile: null,
  risk_score: 0,
  risk_answers: {},
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialData,
  currentStep: 1,
  totalSteps: 4, // welcome, financial, interests, risk
  isLoading: false,
  error: null,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.totalSteps) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

  setFinancialProfile: (data) => set((s) => ({ ...s, ...data })),
  setInterests: (interests) => set({ selected_interests: interests }),
  setRiskProfile: (profile, score, answers) =>
    set({ risk_profile: profile, risk_score: score, risk_answers: answers }),

  saveFinancialProfile: async (userId) => {
    const state = get();
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('financial_profiles')
        .upsert({
          user_id: userId,
          income_range: state.income_range,
          fixed_expenses_estimated: state.fixed_expenses_estimated,
          work_type: state.work_type,
          family_status: state.family_status,
          dependents_count: state.dependents_count,
          has_savings: state.has_savings,
          savings_amount: state.savings_amount,
          has_debt: state.has_debt,
          debt_amount: state.debt_amount,
          financial_goal: state.financial_goal,
          investable_amount_estimated: state.investable_amount_estimated,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  saveInterests: async (userId) => {
    const { selected_interests } = get();
    set({ isLoading: true, error: null });
    try {
      // Primero borramos los intereses viejos
      await supabase.from('user_interests').delete().eq('user_id', userId);

      if (selected_interests.length > 0) {
        const { error } = await supabase.from('user_interests').insert(
          selected_interests.map((key, index) => ({
            user_id: userId,
            interest_key: key,
            priority: index + 1,
          }))
        );
        if (error) throw error;
      }
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  saveRiskProfile: async (userId) => {
    const { risk_profile, risk_score, risk_answers } = get();
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('risk_profiles')
        .upsert({
          user_id: userId,
          profile: risk_profile,
          score: risk_score,
          answers: risk_answers,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  completeOnboarding: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_step: 4,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({ ...initialData, currentStep: 1 }),
  clearError: () => set({ error: null }),
}));
