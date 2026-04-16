/**
 * DecisionHistory — Historial de oportunidades pasadas y su resultado hipotético.
 *
 * Por cada mes anterior con gastos prescindibles significativos, muestra:
 *  - Cuánto había disponible
 *  - Qué hubiera pasado si lo invertía en FCI CER / Plazo Fijo UVA
 *  - Diferencia real vs hipotética
 *
 * Los datos se generan desde el historial de gastos (últimos 3 meses).
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text, Card } from '@/components/ui';
import { formatCurrency } from '@/utils/format';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MonthOpportunity {
  monthKey:    string;   // YYYY-MM
  monthLabel:  string;   // "Febrero 2026"
  disposable:  number;   // gastos prescindibles de ese mes
  halfAmount:  number;   // mitad → lo "recuperable"
  fciReturn:   number;   // rendimiento FCI MM al 3% mensual compuesto
  pfReturn:    number;   // rendimiento Plazo Fijo UVA ~4.5% mensual
  monthsAgo:   number;   // hace cuántos meses
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/** Rendimiento compuesto de n meses a tasa mensual r */
function compound(principal: number, monthlyRate: number, months: number): number {
  return Math.round(principal * (Math.pow(1 + monthlyRate, months) - 1));
}

export function buildOpportunities(
  history: { monthKey: string; disposable: number }[],
): MonthOpportunity[] {
  const now     = new Date();
  const results: MonthOpportunity[] = [];

  for (const entry of history) {
    if (entry.disposable < 10_000) continue; // umbral mínimo
    const [y, m] = entry.monthKey.split('-').map(Number);
    const monthDate  = new Date(y, m - 1, 1);
    const monthsAgo  = Math.max(1,
      (now.getFullYear() - monthDate.getFullYear()) * 12 +
      (now.getMonth() - monthDate.getMonth())
    );

    const half     = Math.round(entry.disposable * 0.5);
    const fciRet   = compound(half, 0.03,  monthsAgo);
    const pfRet    = compound(half, 0.045, monthsAgo);
    const label    = `${MONTH_NAMES_ES[m - 1]} ${y}`;

    results.push({ monthKey: entry.monthKey, monthLabel: label, disposable: entry.disposable, halfAmount: half, fciReturn: fciRet, pfReturn: pfRet, monthsAgo });
  }

  return results.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

// ─── OpportunityCard ─────────────────────────────────────────────────────────

function OpportunityCard({ opp }: { opp: MonthOpportunity }) {
  const bestReturn = Math.max(opp.fciReturn, opp.pfReturn);
  const bestLabel  = opp.pfReturn >= opp.fciReturn ? 'PF UVA' : 'FCI MM';

  return (
    <View style={cardStyles.card}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={[cardStyles.monthBadge, { backgroundColor: colors.primary + '15' }]}>
          <Text variant="caption" color={colors.primary} style={{ fontFamily: 'Montserrat_700Bold' }}>
            {opp.monthLabel}
          </Text>
        </View>
        <View style={cardStyles.agoTag}>
          <Ionicons name="time-outline" size={11} color={colors.text.tertiary} />
          <Text style={cardStyles.agoText}>
            Hace {opp.monthsAgo} {opp.monthsAgo === 1 ? 'mes' : 'meses'}
          </Text>
        </View>
      </View>

      {/* Dato principal */}
      <Text variant="caption" color={colors.text.secondary} style={{ lineHeight: 18 }}>
        Tenías{' '}
        <Text variant="caption" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
          {formatCurrency(opp.disposable)}
        </Text>{' '}
        en prescindibles. Si hubieras invertido la mitad ({formatCurrency(opp.halfAmount)}):
      </Text>

      {/* Comparativa */}
      <View style={cardStyles.comparison}>
        <CompareRow
          label="FCI Money Market"
          icon="trending-up-outline"
          color={colors.neon}
          gain={opp.fciReturn}
          total={opp.halfAmount + opp.fciReturn}
          months={opp.monthsAgo}
        />
        <View style={cardStyles.divider} />
        <CompareRow
          label="Plazo Fijo UVA"
          icon="timer-outline"
          color="#A78BFA"
          gain={opp.pfReturn}
          total={opp.halfAmount + opp.pfReturn}
          months={opp.monthsAgo}
          isBest={opp.pfReturn >= opp.fciReturn}
        />
      </View>

      {/* Conclusión */}
      <View style={cardStyles.conclusionRow}>
        <Ionicons name="bulb-outline" size={13} color={colors.yellow} />
        <Text variant="caption" color={colors.text.secondary} style={{ flex: 1, lineHeight: 17 }}>
          Con {bestLabel} hoy tendrías{' '}
          <Text variant="caption" color={colors.primary} style={{ fontFamily: 'Montserrat_700Bold' }}>
            +{formatCurrency(bestReturn)}
          </Text>{' '}
          más. Dato para reflexionar, no para culparte.
        </Text>
      </View>
    </View>
  );
}

function CompareRow({
  label, icon, color, gain, total, months, isBest = false,
}: {
  label: string; icon: string; color: string; gain: number;
  total: number; months: number; isBest?: boolean;
}) {
  return (
    <View style={[crStyles.row, isBest && { backgroundColor: color + '08', borderRadius: 8, padding: spacing[2] }]}>
      <View style={[crStyles.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <View style={crStyles.textCol}>
        <View style={crStyles.labelRow}>
          <Text variant="caption" color={colors.text.secondary}>{label}</Text>
          {isBest && (
            <View style={[crStyles.bestBadge, { backgroundColor: color + '25' }]}>
              <Text style={[crStyles.bestText, { color }]}>MEJOR</Text>
            </View>
          )}
        </View>
        <Text variant="caption" color={colors.text.tertiary}>
          {months} {months === 1 ? 'mes' : 'meses'} compuesto
        </Text>
      </View>
      <View style={crStyles.right}>
        <Text style={[crStyles.gain, { color }]}>+{formatCurrency(gain)}</Text>
        <Text variant="caption" color={colors.text.tertiary}>{formatCurrency(total)} total</Text>
      </View>
    </View>
  );
}

const crStyles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconWrap:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textCol:   { flex: 1, gap: 2 },
  labelRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  bestBadge: { paddingHorizontal: spacing[2], paddingVertical: 1, borderRadius: 4 },
  bestText:  { fontFamily: 'Montserrat_700Bold', fontSize: 8 },
  right:     { alignItems: 'flex-end', gap: 1 },
  gain:      { fontFamily: 'Montserrat_700Bold', fontSize: 14 },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 14, padding: spacing[4], gap: spacing[3],
  },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBadge:    { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: 20 },
  agoTag:        { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  agoText:       { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: colors.text.tertiary },
  comparison:    { gap: spacing[2] },
  divider:       { height: 1, backgroundColor: colors.border.subtle, marginVertical: spacing[1] },
  conclusionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], backgroundColor: colors.yellow + '0C', borderRadius: 8, padding: spacing[3] },
});

// ─── DecisionHistorySection ───────────────────────────────────────────────────

interface Props {
  opportunities: MonthOpportunity[];
}

export function DecisionHistorySection({ opportunities }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (opportunities.length === 0) return null;

  const totalPotential = opportunities.reduce((s, o) => s + Math.max(o.fciReturn, o.pfReturn), 0);

  return (
    <View style={sectionStyles.container}>
      {/* Header tappable */}
      <TouchableOpacity style={sectionStyles.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={sectionStyles.headerLeft}>
          <View style={sectionStyles.iconWrap}>
            <Ionicons name="hourglass-outline" size={16} color={colors.yellow} />
          </View>
          <View>
            <Text variant="label" color={colors.text.secondary}>OPORTUNIDADES PASADAS</Text>
            <Text variant="caption" color={colors.text.tertiary}>
              Podrías haber tenido +{formatCurrency(totalPotential)} extra
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.tertiary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={sectionStyles.list}>
          {opportunities.map(opp => (
            <OpportunityCard key={opp.monthKey} opp={opp} />
          ))}
          <View style={sectionStyles.disclaimer}>
            <Ionicons name="information-circle-outline" size={13} color={colors.text.tertiary} />
            <Text variant="caption" color={colors.text.tertiary} style={{ flex: 1, lineHeight: 17 }}>
              Rendimientos estimados con tasas históricas de FCI MM (3%/mes) y PF UVA (4.5%/mes). No son garantía de resultados futuros.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 16, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing[4],
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
  iconWrap:   { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.yellow + '15', alignItems: 'center', justifyContent: 'center' },
  list:       { borderTopWidth: 1, borderTopColor: colors.border.subtle, padding: spacing[4], gap: spacing[3] },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], paddingTop: spacing[2] },
});
