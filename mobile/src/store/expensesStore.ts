import { create } from 'zustand';
import type { Expense, ExpenseCategory } from '@/types';
import { supabase, handleSupabaseError } from '@/lib/supabase';

interface ExpensesFilter {
  month: number | null;
  year: number | null;
  category_id: string | null;
  classification: string | null;
  search: string;
}

interface ExpensesState {
  expenses: Expense[];
  categories: ExpenseCategory[];
  selectedExpense: Expense | null;
  filter: ExpensesFilter;
  isLoading: boolean;
  isLoadingCategories: boolean;
  error: string | null;
  totalThisMonth: number;
  totalNecessary: number;
  totalDisposable: number;
  totalInvestable: number;

  // Actions
  fetchExpenses: (userId: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  addExpense: (userId: string, data: Partial<Expense>) => Promise<Expense>;
  updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  setFilter: (filter: Partial<ExpensesFilter>) => void;
  setSelectedExpense: (expense: Expense | null) => void;
  clearError: () => void;
}

const currentDate = new Date();

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: [],
  categories: [],
  selectedExpense: null,
  filter: {
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear(),
    category_id: null,
    classification: null,
    search: '',
  },
  isLoading: false,
  isLoadingCategories: false,
  error: null,
  totalThisMonth: 0,
  totalNecessary: 0,
  totalDisposable: 0,
  totalInvestable: 0,

  fetchExpenses: async (userId) => {
    const { filter } = get();
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('expenses')
        .select('*, category:expense_categories(*), receipt:expense_receipts(*)')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: false });

      if (filter.year && filter.month) {
        const startDate = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
        const endMonth = filter.month === 12 ? 1 : filter.month + 1;
        const endYear = filter.month === 12 ? filter.year + 1 : filter.year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
        query = query.gte('date', startDate).lt('date', endDate);
      }

      if (filter.category_id) {
        query = query.eq('category_id', filter.category_id);
      }

      if (filter.classification) {
        query = query.eq('classification', filter.classification);
      }

      if (filter.search) {
        query = query.ilike('description', `%${filter.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const expenses = (data ?? []) as Expense[];

      // Calcular totales
      const totalThisMonth = expenses.reduce((sum, e) => sum + e.amount, 0);
      const totalNecessary = expenses
        .filter(e => e.classification === 'necessary')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalDisposable = expenses
        .filter(e => e.classification === 'disposable')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalInvestable = expenses
        .filter(e => e.classification === 'investable')
        .reduce((sum, e) => sum + e.amount, 0);

      set({ expenses, totalThisMonth, totalNecessary, totalDisposable, totalInvestable });
    } catch (err) {
      set({ error: handleSupabaseError(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCategories: async () => {
    set({ isLoadingCategories: true });
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('name_es');
      if (error) throw error;
      set({ categories: data ?? [] });
    } catch (err) {
      set({ error: handleSupabaseError(err) });
    } finally {
      set({ isLoadingCategories: false });
    }
  },

  addExpense: async (userId, data) => {
    set({ isLoading: true, error: null });
    try {
      const { data: newExpense, error } = await supabase
        .from('expenses')
        .insert({
          user_id: userId,
          description: data.description ?? '',
          amount: data.amount ?? 0,
          date: data.date ?? new Date().toISOString().split('T')[0],
          payment_method: data.payment_method ?? 'cash',
          category_id: data.category_id ?? null,
          notes: data.notes ?? null,
          is_recurring: data.is_recurring ?? false,
        })
        .select('*, category:expense_categories(*)')
        .single();

      if (error) throw error;

      set((s) => ({ expenses: [newExpense as Expense, ...s.expenses] }));
      return newExpense as Expense;
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateExpense: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const { data: updated, error } = await supabase
        .from('expenses')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, category:expense_categories(*)')
        .single();

      if (error) throw error;

      set((s) => ({
        expenses: s.expenses.map((e) => (e.id === id ? (updated as Expense) : e)),
      }));
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteExpense: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    } catch (err) {
      set({ error: handleSupabaseError(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  setFilter: (filter) => set((s) => ({ filter: { ...s.filter, ...filter } })),
  setSelectedExpense: (expense) => set({ selectedExpense: expense }),
  clearError: () => set({ error: null }),
}));
