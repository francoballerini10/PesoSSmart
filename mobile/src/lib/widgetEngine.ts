import { formatCurrency } from '@/utils/format';
import type { Expense } from '@/types';

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type WidgetType =
  | 'unclassified'
  | 'budget_risk'
  | 'budget_over'
  | 'impulse'
  | 'recoverable'
  | 'opportunity'
  | 'prediction'
  | 'positive';

export interface HomeBudget {
  id:            string;
  category_id:   string;
  monthly_limit: number;
}

export interface WidgetData {
  type:     WidgetType;
  title:    string;
  headline: string;
  body:     string;
  cta:      string;
  cardBg:   string;
  accent:   string;
  emoji:    string;
}

// ── Helpers internos ───────────────────────────────────────────────────────────

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function getUnclassifiedCount(expenses: Expense[]): number {
  return expenses.filter(e => !e.deleted_at && !e.classification).length;
}

function getBudgetRisk(
  expenses: Expense[],
  budgets:  HomeBudget[],
): { categoryId: string; used: number; limit: number; pct: number } | null {
  if (!budgets.length) return null;
  const ms = monthStart();
  const totals: Record<string, number> = {};
  for (const e of expenses) {
    if (!e.deleted_at && e.category_id && e.date >= ms) {
      totals[e.category_id] = (totals[e.category_id] ?? 0) + e.amount;
    }
  }
  let worst: { categoryId: string; used: number; limit: number; pct: number } | null = null;
  for (const b of budgets) {
    const used = totals[b.category_id] ?? 0;
    const pct  = b.monthly_limit > 0 ? used / b.monthly_limit : 0;
    if (pct >= 0.75 && (!worst || pct > worst.pct)) {
      worst = { categoryId: b.category_id, used, limit: b.monthly_limit, pct };
    }
  }
  return worst;
}

function getImpulsiveStats(expenses: Expense[]): { count: number; amount: number } {
  const cutoff = daysAgoStr(7);
  const recent = expenses.filter(
    e => !e.deleted_at && e.classification === 'disposable' && e.date >= cutoff,
  );
  return {
    count:  recent.length,
    amount: recent.reduce((s, e) => s + e.amount, 0),
  };
}

// ── Engine principal ───────────────────────────────────────────────────────────

export interface WidgetParams {
  expenses:        Expense[];
  totalDisposable: number;
  totalThisMonth:  number;
  estimatedIncome: number | null;
  homeBudgets:     HomeBudget[];
  dayOfMonth:      number;
  daysInMonth:     number;
}

// Devuelve TODOS los widgets aplicables en orden de prioridad.
// Permite rotar entre ellos en la UI.
export function computeAllWidgets(params: WidgetParams): WidgetData[] {
  const { expenses, totalDisposable, totalThisMonth, estimatedIncome,
          homeBudgets, dayOfMonth, daysInMonth } = params;
  const list: WidgetData[] = [];

  // 1. Gastos sin clasificar ─────────────────────────────────────────────────
  const unclassifiedCount = getUnclassifiedCount(expenses);
  if (unclassifiedCount > 0) {
    list.push({
      type:     'unclassified',
      title:    'ESTÁS PERDIENDO CONTROL',
      headline: `${unclassifiedCount} gasto${unclassifiedCount !== 1 ? 's' : ''} sin clasificar`,
      body:     'Ya están cargados en tus gastos. Solo falta elegir la categoría.',
      cta:      'Clasificar ahora',
      cardBg:   '#0F2240',
      accent:   '#60A5FA',
      emoji:    '❓',
    });
  }

  // 2 & 3. Presupuesto en riesgo / superado ─────────────────────────────────
  const budgetRisk = getBudgetRisk(expenses, homeBudgets);
  if (budgetRisk) {
    const pct    = Math.round(budgetRisk.pct * 100);
    const isOver = pct > 100;
    list.push({
      type:     isOver ? 'budget_over' : 'budget_risk',
      title:    isOver ? 'PRESUPUESTO SUPERADO' : 'PRESUPUESTO EN RIESGO',
      headline: isOver
        ? `Superaste ${formatCurrency(budgetRisk.limit)}`
        : `${pct}% del presupuesto usado`,
      body: isOver
        ? `Gastaste ${formatCurrency(budgetRisk.used)} de ${formatCurrency(budgetRisk.limit)} este mes.`
        : `Usaste ${formatCurrency(budgetRisk.used)} de ${formatCurrency(budgetRisk.limit)}.`,
      cta:    'Ver presupuesto',
      cardBg: isOver ? '#3B0A00' : '#3B2500',
      accent: isOver ? '#F97316' : '#FBBF24',
      emoji:  isOver ? '🔴' : '⚠️',
    });
  }

  // 4. Compras impulsivas ────────────────────────────────────────────────────
  const { count: impCount, amount: impAmount } = getImpulsiveStats(expenses);
  if (impCount >= 5 && impAmount >= 10_000) {
    list.push({
      type:     'impulse',
      title:    'ESTÁS PERDIENDO ESTO',
      headline: `${impCount} compras impulsivas`,
      body:     `En los últimos 7 días gastaste ${formatCurrency(impAmount)} en prescindibles.`,
      cta:      'Revisar hábitos',
      cardBg:   '#3B0A1A',
      accent:   '#F43F5E',
      emoji:    '⚡',
    });
  }

  // 5. Dinero recuperable ────────────────────────────────────────────────────
  const recoverable = Math.round(totalDisposable * 0.5);
  if (recoverable >= 10_000) {
    list.push({
      type:     'recoverable',
      title:    'ESTÁS PERDIENDO ESTO',
      headline: `${formatCurrency(recoverable)} este mes`,
      body:     'Detectamos gastos que podés ajustar sin cambiar tu estilo de vida.',
      cta:      'Ver cómo recuperarlo',
      cardBg:   '#1B5E20',
      accent:   '#4ADE80',
      emoji:    '💰',
    });
  }

  // 6. Costo de oportunidad ─────────────────────────────────────────────────
  if (totalDisposable >= 15_000) {
    const projected6m = Math.round(totalDisposable * 1.25);
    list.push({
      type:     'opportunity',
      title:    'ESTÁS PERDIENDO ESTO',
      headline: `${formatCurrency(totalDisposable)} este mes`,
      body:     `Si invertías esto hace 6 meses, hoy tendrías ${formatCurrency(projected6m)}.`,
      cta:      'Ver oportunidad',
      cardBg:   '#1E1050',
      accent:   '#A78BFA',
      emoji:    '📈',
    });
  }

  // 7. Predicción de fin de mes ─────────────────────────────────────────────
  if (dayOfMonth >= 8 && estimatedIncome && estimatedIncome > 0) {
    const projected = Math.round((totalThisMonth / dayOfMonth) * daysInMonth);
    if (projected > estimatedIncome) {
      const excess = projected - estimatedIncome;
      list.push({
        type:     'prediction',
        title:    'ALERTA DE FIN DE MES',
        headline: `Te vas a pasar ${formatCurrency(excess)}`,
        body:     `A este ritmo, superás tu ingreso estimado antes de fin de mes.`,
        cta:      'Ver predicción',
        cardBg:   '#3B0A00',
        accent:   '#EF4444',
        emoji:    '🔮',
      });
    }
  }

  // 8. Todo bien (siempre como fallback) ────────────────────────────────────
  list.push({
    type:     'positive',
    title:    'VAS MUY BIEN 🎯',
    headline: 'Tus finanzas están sanas',
    body:     'Este mes estás controlando bien tus gastos. ¡Seguí así!',
    cta:      'Ver análisis completo',
    cardBg:   '#0F2D1A',
    accent:   '#4ADE80',
    emoji:    '✅',
  });

  return list;
}

// Backwards-compat: retorna solo el primer widget (mayor prioridad).
export function computeActiveWidget(params: WidgetParams): WidgetData {
  return computeAllWidgets(params)[0];
}
