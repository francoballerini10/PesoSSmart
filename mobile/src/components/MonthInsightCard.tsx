import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '@/theme';
import { Text } from '@/components/ui';
import { formatCurrency } from '@/utils/format';
import type { Expense } from '@/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Budget {
  id: string;
  category_id: string;
  monthly_limit: number;
}

interface Insight {
  icon: string;
  iconColor: string;
  bg: string;
  border: string;
  label: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaRoute: string;
}

interface Props {
  expenses: Expense[];     // ya filtrados: solo category_id !== null
  budgets: Budget[];       // provistos por home.tsx (query compartida)
  pendingCount: number;    // gastos sin clasificar (pending_transactions status='pending')
  prevMonthTotal: number;
  onNavigate: (route: string) => void;
}

// ─── Lógica de insight ────────────────────────────────────────────────────────

function computeInsight(
  expenses: Expense[],
  budgets: Budget[],
  pendingCount: number,
  prevMonthTotal: number,
): Insight {
  // Gasto por categoría (solo gastos clasificados)
  const spendByCat: Record<string, number> = {};
  for (const e of expenses) {
    if (e.category_id) spendByCat[e.category_id] = (spendByCat[e.category_id] ?? 0) + e.amount;
  }

  // Total clasificado (denominador correcto para % de concentración)
  const classifiedTotal = Object.values(spendByCat).reduce((s, v) => s + v, 0);

  // Filas de presupuesto ordenadas por % de uso (mayor primero)
  const budgetRows = budgets
    .map(b => {
      const spent = spendByCat[b.category_id] ?? 0;
      const pct = b.monthly_limit > 0 ? spent / b.monthly_limit : 0;
      const matchExp = expenses.find(e => e.category_id === b.category_id);
      const catName = (matchExp as any)?.category?.name_es ?? 'esa categoría';
      return { ...b, spent, pct, catName };
    })
    .sort((a, b) => b.pct - a.pct);

  // BudgetHomeWidget ya muestra alerta cuando pct > 0.7 → no duplicar
  const budgetWidgetShowing = budgetRows.length > 0 && budgetRows[0].pct > 0.7;

  // Regla 1: presupuesto superado
  if (!budgetWidgetShowing) {
    const over = budgetRows.find(r => r.pct > 1);
    if (over) {
      return {
        icon: 'alert-circle',
        iconColor: '#EF4444',
        bg: '#FEEBEE',
        border: '#FFCDD2',
        label: 'PRESUPUESTO',
        title: `Te pasaste en ${over.catName}`,
        body: `Superaste tu límite por ${formatCurrency(Math.round(over.spent - over.monthly_limit))}.`,
        ctaLabel: 'Ver presupuesto',
        ctaRoute: '/(app)/expenses',
      };
    }

    // Regla 2: cerca del límite
    const near = budgetRows.find(r => r.pct > 0.7);
    if (near) {
      return {
        icon: 'warning',
        iconColor: '#F59E0B',
        bg: '#FFF8E1',
        border: '#FFE082',
        label: 'PRESUPUESTO',
        title: `Ojo con ${near.catName}`,
        body: `Ya usaste el ${Math.round(near.pct * 100)}% del presupuesto.`,
        ctaLabel: 'Ajustar gasto',
        ctaRoute: '/(app)/expenses',
      };
    }
  }

  // Regla 3: concentración > 35% en una categoría (mínimo 3 gastos clasificados)
  if (classifiedTotal > 0 && expenses.length >= 3) {
    const topEntry = Object.entries(spendByCat).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
      const [topCatId, topAmt] = topEntry;
      const pct = topAmt / classifiedTotal;
      if (pct > 0.35) {
        const matchExp = expenses.find(e => e.category_id === topCatId);
        const catName = (matchExp as any)?.category?.name_es ?? 'una categoría';
        return {
          icon: 'pie-chart-outline',
          iconColor: '#5C6BC0',
          bg: '#EDE7F6',
          border: '#D1C4E9',
          label: 'CONCENTRACIÓN',
          title: `Tu mayor concentración: ${catName}`,
          body: `Concentra el ${Math.round(pct * 100)}% de tu gasto clasificado.`,
          ctaLabel: 'Ver gastos',
          ctaRoute: '/(app)/expenses',
        };
      }
    }
  }

  // Regla 5: mejor que el mes pasado (proyección)
  if (prevMonthTotal > 0 && classifiedTotal > 0) {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // Proyectar usando totalThisMonth (todos los gastos, para comparar meses de igual forma)
    const projected = (classifiedTotal / dayOfMonth) * daysInMonth;
    if (projected < prevMonthTotal * 0.9) {
      return {
        icon: 'trending-down-outline',
        iconColor: '#2E7D32',
        bg: '#F1F8F2',
        border: '#C8E6C9',
        label: 'TENDENCIA',
        title: 'Venís mejor que el mes pasado',
        body: 'Vas camino a gastar menos que el mes anterior. Seguí así.',
        ctaLabel: 'Ver progreso',
        ctaRoute: '/(app)/reports',
      };
    }
  }

  // Regla 6: estado positivo por defecto
  return {
    icon: 'checkmark-circle-outline',
    iconColor: '#2E7D32',
    bg: '#F1F8F2',
    border: '#C8E6C9',
    label: 'INSIGHT DEL MES',
    title: 'Tu mes viene ordenado',
    body: expenses.length > 0
      ? 'Sin alertas activas. Todo dentro de lo esperado.'
      : 'Registrá gastos para ver tu análisis del mes.',
    ctaLabel: 'Ver resumen',
    ctaRoute: '/(app)/reports',
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MonthInsightCard({
  expenses, budgets, pendingCount, prevMonthTotal, onNavigate,
}: Props) {
  const insight = useMemo(
    () => computeInsight(expenses, budgets, pendingCount, prevMonthTotal),
    [expenses, budgets, pendingCount, prevMonthTotal],
  );

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: insight.bg, borderColor: insight.border }]}
      onPress={() => onNavigate(insight.ctaRoute)}
      activeOpacity={0.85}
    >
      {/* Ícono */}
      <View style={[s.iconBox, { backgroundColor: insight.iconColor + '20' }]}>
        <Ionicons name={insight.icon as any} size={20} color={insight.iconColor} />
      </View>

      {/* Contenido */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.label}>{insight.label}</Text>
        <Text style={s.title} numberOfLines={2}>{insight.title}</Text>
        <Text style={s.body} numberOfLines={2}>{insight.body}</Text>
      </View>

      {/* CTA */}
      <View style={s.cta}>
        <Text style={[s.ctaText, { color: insight.iconColor }]} numberOfLines={1}>
          {insight.ctaLabel}
        </Text>
        <Ionicons name="chevron-forward" size={13} color={insight.iconColor} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 9,
    color: '#9E9E9E',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 14,
    color: '#1A1A1A',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: 12,
    color: '#616161',
    lineHeight: 17,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  ctaText: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 11,
  },
});
