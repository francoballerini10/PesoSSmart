import { supabase } from '@/lib/supabase';

export type BudgetStatus = 'ok' | 'warning' | 'over';

export interface CategoryBudget {
  categoryId:   string;
  name:         string;
  icon:         string | null;
  color:        string | null;
  avgMonthly:   number;
  currentSpend: number;
  pct:          number;
  projected:    number;
  monthHistory: { month: string; label: string; amount: number }[];
  status:       BudgetStatus;
}

export interface BudgetPlan {
  categories:        CategoryBudget[];
  totalAvg:          number;
  totalCurrentSpend: number;
  totalProjected:    number;
  potentialSavings:  number;
  dayOfMonth:        number;
  daysInMonth:       number;
  monthLabel:        string;
}

const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTH_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                     'Septiembre','Octubre','Noviembre','Diciembre'];

export async function fetchBudgetPlan(userId: string): Promise<BudgetPlan | null> {
  const now           = new Date();
  const curYear       = now.getFullYear();
  const curMonth      = now.getMonth(); // 0-indexed
  const currentStart  = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
  const historyStart  = new Date(curYear, curMonth - 3, 1).toISOString().split('T')[0];

  const { data: expenses, error } = await (supabase as any)
    .from('expenses')
    .select('amount, date, category_id, category:expense_categories(name_es, icon, color)')
    .eq('user_id', userId)
    .gte('date', historyStart)
    .is('deleted_at', null);

  if (error || !expenses) return null;

  const dayOfMonth  = now.getDate();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const dayPct      = Math.max(dayOfMonth / daysInMonth, 0.05);

  const catMap: Record<string, {
    name: string; icon: string | null; color: string | null;
    months: Record<string, number>; current: number;
  }> = {};

  for (const exp of expenses) {
    if (!exp.category_id) continue;
    const id     = exp.category_id;
    const cat    = exp.category;
    const amount = Number(exp.amount);
    const month  = (exp.date as string).substring(0, 7);

    if (!catMap[id]) {
      catMap[id] = {
        name:    cat?.name_es ?? 'Sin categoría',
        icon:    cat?.icon ?? null,
        color:   cat?.color ?? null,
        months:  {},
        current: 0,
      };
    }

    if (exp.date >= currentStart) {
      catMap[id].current += amount;
    } else {
      catMap[id].months[month] = (catMap[id].months[month] ?? 0) + amount;
    }
  }

  const categories: CategoryBudget[] = [];

  for (const [catId, cat] of Object.entries(catMap)) {
    const histAmounts = Object.values(cat.months);
    if (histAmounts.length === 0 && cat.current === 0) continue;

    const avgMonthly = histAmounts.length > 0
      ? histAmounts.reduce((s, v) => s + v, 0) / Math.min(histAmounts.length, 3)
      : cat.current;

    const currentSpend = cat.current;
    const projected    = currentSpend / dayPct;
    const pct          = avgMonthly > 0 ? currentSpend / avgMonthly : 0;

    const status: BudgetStatus = pct > 1 ? 'over' : pct > 0.75 ? 'warning' : 'ok';

    const monthHistory = [];
    for (let i = 3; i >= 1; i--) {
      const d   = new Date(curYear, curMonth - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthHistory.push({ month: key, label: MONTH_SHORT[d.getMonth()], amount: cat.months[key] ?? 0 });
    }

    categories.push({ categoryId: catId, name: cat.name, icon: cat.icon, color: cat.color,
      avgMonthly, currentSpend, pct, projected, monthHistory, status });
  }

  categories.sort((a, b) => {
    const o = { over: 0, warning: 1, ok: 2 };
    if (o[a.status] !== o[b.status]) return o[a.status] - o[b.status];
    return b.avgMonthly - a.avgMonthly;
  });

  const totalAvg          = categories.reduce((s, c) => s + c.avgMonthly,   0);
  const totalCurrentSpend = categories.reduce((s, c) => s + c.currentSpend, 0);
  const totalProjected    = categories.reduce((s, c) => s + c.projected,    0);
  const potentialSavings  = categories
    .filter(c => c.status !== 'over' && c.avgMonthly > 0)
    .reduce((s, c) => s + Math.max(0, c.avgMonthly - c.projected), 0);

  return {
    categories,
    totalAvg,
    totalCurrentSpend,
    totalProjected,
    potentialSavings,
    dayOfMonth,
    daysInMonth,
    monthLabel: `${MONTH_FULL[curMonth]} ${curYear}`,
  };
}
