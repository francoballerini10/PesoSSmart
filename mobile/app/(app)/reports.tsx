/**
 * ReportsScreen — "Informe"
 *
 * Bloques: Estado del mes · Dato clave · Resumen ·
 *          Termómetro · Distribución · Comparación histórica ·
 *          Dinero recuperable · Plan próximo mes ·
 *          Objetivo automático · CTA Asesor IA
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, layout } from '@/theme';
import { Text, Card } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useExpensesStore } from '@/store/expensesStore';
import { useSavingsStore } from '@/store/savingsStore';
import { usePlanStore } from '@/store/planStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/format';
import { InflationThermometer } from '@/components/InflationThermometer';
import { DecisionHistorySection, buildOpportunities } from '@/components/DecisionHistory';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { FirstVisitSheet } from '@/components/FirstVisitSheet';

import {
  MONTH_NAMES,
  PALETTE,
  type CategoryRow,
  type MonthSummary,
  computeMonthStatus,
  buildKeyInsight,
  buildComparacion,
  buildAhorroSugerencias,
  buildPlanProximoMes,
  buildObjetivo,
  MonthStatusBanner,
  KeyInsightCard,
  ResumenCard,
  CategoryBreakdown,
  HistoryComparisonCard,
  DineroRecuperableCard,
  PlanProximoMesCard,
  ObjetivoCard,
  AdvisorCTA,
} from '@/components/ReportCards';

// ─── MonthSelector ────────────────────────────────────────────────────────────

function MonthSelector({ month, year, onPrev, onNext, disableNext }: {
  month: number; year: number; onPrev: () => void; onNext: () => void; disableNext: boolean;
}) {
  return (
    <View style={msStyles.row}>
      <TouchableOpacity style={msStyles.btn} onPress={onPrev}>
        <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
      </TouchableOpacity>
      <Text variant="subtitle" color={colors.text.primary}>{MONTH_NAMES[month - 1]} {year}</Text>
      <TouchableOpacity style={[msStyles.btn, disableNext && { opacity: 0.3 }]} onPress={onNext} disabled={disableNext}>
        <Ionicons name="chevron-forward" size={20} color={colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
}
const msStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border.subtle },
  btn: { padding: spacing[2] },
});

// ─── PDF Builder ─────────────────────────────────────────────────────────────

function buildPdfHtml({
  userName, monthLabel, total, necessary, disposable, investable,
  estimatedIncome, inflationRate, fciRate, rows, totalInvested,
}: {
  userName:       string;
  monthLabel:     string;
  total:          number;
  necessary:      number;
  disposable:     number;
  investable:     number;
  estimatedIncome: number | null;
  inflationRate:  number;
  fciRate:        number;
  rows:           CategoryRow[];
  totalInvested:  number;
}): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
  const incomePct = estimatedIncome && estimatedIncome > 0
    ? `${Math.round((total / estimatedIncome) * 100)}% del ingreso`
    : '';

  const catRows = rows.slice(0, 6).map(r => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #222;">${r.name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #222;text-align:right;">${fmt(r.amount)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #222;text-align:right;">${Math.round(r.pct * 100)}%</td>
    </tr>`).join('');

  const ganancia   = totalInvested * (fciRate / 100);
  const perdida    = totalInvested * (inflationRate / 100);
  const netoPct    = fciRate - inflationRate;
  const patrimonioSection = totalInvested > 0 ? `
    <div class="section">
      <h2>Patrimonio vs Inflación</h2>
      <table width="100%">
        <tr>
          <td class="kpi"><div class="kpi-label">INVERTIDO</div><div class="kpi-val">${fmt(totalInvested)}</div></td>
          <td class="kpi"><div class="kpi-label">RENDIMIENTO (~${fciRate}%)</div><div class="kpi-val neon">+${fmt(ganancia)}</div></td>
          <td class="kpi"><div class="kpi-label">INFLACIÓN (${inflationRate}%)</div><div class="kpi-val red">-${fmt(perdida)}</div></td>
          <td class="kpi"><div class="kpi-label">REAL NETO</div><div class="kpi-val ${netoPct >= 0 ? 'neon' : 'red'}">${netoPct >= 0 ? '+' : ''}${netoPct.toFixed(1)}%</div></td>
        </tr>
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background:#0D0D0D; color:#F0F0F0; padding:32px; }
  .header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #C6F135; padding-bottom:16px; margin-bottom:24px; }
  .logo { font-size:22px; font-weight:800; color:#C6F135; letter-spacing:-0.5px; }
  .meta { text-align:right; font-size:12px; color:#888; }
  .meta strong { color:#F0F0F0; display:block; font-size:15px; }
  .section { background:#1A1A1A; border-radius:10px; padding:20px; margin-bottom:16px; }
  h2 { font-size:11px; color:#888; letter-spacing:1px; text-transform:uppercase; margin-bottom:12px; }
  .kpis { display:flex; gap:12px; }
  .kpi { flex:1; background:#111; border-radius:8px; padding:14px; border-top:2px solid #333; }
  .kpi-label { font-size:9px; color:#666; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; }
  .kpi-val { font-size:22px; font-weight:800; color:#F0F0F0; }
  .neon { color:#C6F135; }
  .red  { color:#FF5252; }
  .yellow { color:#FFD740; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th { text-align:left; padding:8px 12px; font-size:10px; color:#888; letter-spacing:1px; border-bottom:1px solid #333; }
  tr:last-child td { border-bottom:none; }
  .footer { margin-top:24px; text-align:center; font-size:11px; color:#444; }
  .footer span { color:#C6F135; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">PesoSmart</div>
  <div class="meta">
    <strong>${userName}</strong>
    Informe de ${monthLabel}
  </div>
</div>

<div class="section">
  <h2>Resumen del mes</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">TOTAL GASTADO</div><div class="kpi-val">${fmt(total)}</div></div>
    <div class="kpi"><div class="kpi-label">NECESARIO</div><div class="kpi-val">${fmt(necessary)}</div></div>
    <div class="kpi"><div class="kpi-label">PRESCINDIBLE</div><div class="kpi-val red">${fmt(disposable)}</div></div>
    <div class="kpi"><div class="kpi-label">INVERTIBLE</div><div class="kpi-val neon">${fmt(investable)}</div></div>
  </div>
  ${incomePct ? `<p style="margin-top:12px;font-size:12px;color:#888;">Representa el <strong style="color:#F0F0F0">${incomePct}</strong> · Inflación del mes: <strong style="color:#FFD740">${inflationRate}%</strong></p>` : ''}
</div>

<div class="section">
  <h2>Top categorías de gasto</h2>
  <table>
    <tr><th>Categoría</th><th style="text-align:right">Monto</th><th style="text-align:right">% del total</th></tr>
    ${catRows}
  </table>
</div>

${patrimonioSection}

<div class="footer">
  Generado por la <span>Inteligencia Financiera de PesoSmart</span> · ${new Date().toLocaleDateString('es-AR')}
</div>

</body>
</html>`;
}

// ─── Screen principal ─────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { user, profile } = useAuthStore();
  const { totalThisMonth, totalNecessary, totalDisposable, totalInvestable, estimatedIncome } = useExpensesStore();
  const { investments, fetchAll: loadSavings } = useSavingsStore();
  const { effectivePlan, isTrialActive } = usePlanStore();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [rows,  setRows]  = useState<CategoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [history,       setHistory]       = useState<MonthSummary[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [inflationRate, setInflationRate] = useState(3.4);
  const [fciRate,       setFciRate]       = useState(3.0);
  const [pastOppData,   setPastOppData]   = useState<{ monthKey: string; disposable: number; categories: Record<string, number> }[]>([]);
  const [activeTab, setActiveTab] = useState<'resumen' | 'categorias' | 'inflacion' | 'oportunidades'>('resumen');

  const { isFirstVisit, markVisited } = useFirstVisit('reports');

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const { startDate, endDate } = useMemo(() => {
    const s  = `${year}-${String(month).padStart(2, '0')}-01`;
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const e  = `${ny}-${String(nm).padStart(2, '0')}-01`;
    return { startDate: s, endDate: e };
  }, [month, year]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const oppStart = (() => {
        const d = new Date(year, month - 4, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      })();

      const [mainRes, histRes, oppRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('amount, category:expense_categories(id, name_es, color), classification')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .gte('date', startDate)
          .lt('date', endDate),
        supabase
          .from('expenses')
          .select('amount, date, classification')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .gte('date', (() => {
            const d = new Date(year, month - 4, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
          })())
          .lt('date', startDate),
        supabase
          .from('expenses')
          .select('amount, date, classification, category:expense_categories(name_es)')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .eq('classification', 'disposable')
          .gte('date', oppStart)
          .lt('date', startDate),
      ]);

      const map: Record<string, CategoryRow> = {};
      let sum = 0;
      for (const exp of mainRes.data ?? []) {
        const cat   = (exp as any).category;
        const catId = cat?.id ?? 'none';
        if (!map[catId]) {
          map[catId] = { id: catId, name: cat?.name_es ?? 'Sin categoría', color: cat?.color ?? PALETTE[Object.keys(map).length % PALETTE.length], amount: 0, pct: 0 };
        }
        map[catId].amount += (exp as any).amount;
        sum += (exp as any).amount;
      }
      const result = Object.values(map).map(r => ({ ...r, pct: sum > 0 ? r.amount / sum : 0 })).sort((a, b) => b.amount - a.amount);
      setTotal(sum);
      setRows(result);

      const histMap: Record<string, MonthSummary> = {};
      type HistRow = { amount: number; date: string; classification: string | null };
      for (const exp of (histRes.data ?? []) as HistRow[]) {
        const key = exp.date.slice(0, 7);
        if (!histMap[key]) {
          const [y, m] = key.split('-').map(Number);
          histMap[key] = { monthKey: key, label: MONTH_NAMES[m - 1].slice(0, 3), total: 0, disposable: 0, necessary: 0, investable: 0 };
        }
        histMap[key].total += exp.amount;
        if (exp.classification === 'disposable') histMap[key].disposable += exp.amount;
        if (exp.classification === 'necessary')  histMap[key].necessary  += exp.amount;
        if (exp.classification === 'investable') histMap[key].investable += exp.amount;
      }
      setHistory(Object.values(histMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey)).slice(-3));

      const oppMap: Record<string, { monthKey: string; disposable: number; categories: Record<string, number> }> = {};
      for (const exp of (oppRes.data ?? []) as any[]) {
        const mk      = exp.date.slice(0, 7);
        const catName = exp.category?.name_es ?? 'Prescindibles';
        if (!oppMap[mk]) oppMap[mk] = { monthKey: mk, disposable: 0, categories: {} };
        oppMap[mk].disposable += exp.amount;
        oppMap[mk].categories[catName] = (oppMap[mk].categories[catName] ?? 0) + exp.amount;
      }
      setPastOppData(Object.values(oppMap));
    } catch (err) {
      console.error('[Informe] loadData error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (user?.id) loadSavings(user.id);
    supabase
      .from('market_rates')
      .select('instrument, rate_monthly')
      .in('instrument', ['inflation', 'fci_mm'])
      .then(({ data }) => {
        if (!data) return;
        for (const row of data) {
          if (row.instrument === 'inflation') setInflationRate(Number(row.rate_monthly));
          if (row.instrument === 'fci_mm')    setFciRate(Number(row.rate_monthly));
        }
      });
  }, [user?.id]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (isCurrentMonth) return; if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const displayTotal      = isCurrentMonth ? totalThisMonth  : total;
  const displayNecessary  = isCurrentMonth ? totalNecessary  : 0;
  const displayDisposable = isCurrentMonth ? totalDisposable : 0;
  const displayInvestable = isCurrentMonth ? totalInvestable : 0;
  const displayIncome     = isCurrentMonth ? estimatedIncome : null;

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    const isPro = effectivePlan === 'pro' || effectivePlan === 'premium';
    if (!isPro || isTrialActive()) {
      Alert.alert(
        '⚡ Función Pro',
        'El reporte en PDF es exclusivo de PesoSmart Pro. Mejorá tu plan para exportar y compartir tus informes.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: '⚡ Ver planes', onPress: () => router.push('/(app)/plans' as any) },
        ],
      );
      return;
    }

    setExporting(true);
    try {
      const totalInvested = investments.reduce((s, inv) => s + inv.amount, 0);
      const monthLabel    = `${MONTH_NAMES[month - 1]} ${year}`;
      const html = buildPdfHtml({
        userName:        profile?.full_name ?? 'Usuario',
        monthLabel,
        total:           displayTotal,
        necessary:       displayNecessary,
        disposable:      displayDisposable,
        investable:      displayInvestable,
        estimatedIncome: displayIncome,
        inflationRate,
        fciRate,
        rows,
        totalInvested,
      });

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Informe ${monthLabel} — PesoSmart`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF generado', 'El archivo fue creado pero tu dispositivo no soporta compartir directamente.');
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo generar el PDF. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  }, [effectivePlan, isTrialActive, investments, month, year, profile, displayTotal, displayNecessary, displayDisposable, displayInvestable, displayIncome, inflationRate, fciRate, rows]);

  const statusData = useMemo(() => computeMonthStatus({
    total: displayTotal, disposable: displayDisposable, estimatedIncome: displayIncome,
  }), [displayTotal, displayDisposable, displayIncome]);

  const keyInsight = useMemo(() => buildKeyInsight({
    total: displayTotal, disposable: displayDisposable, estimatedIncome: displayIncome, rows, history,
  }), [displayTotal, displayDisposable, displayIncome, rows, history]);

  const comparacion = useMemo(() => buildComparacion(history, displayTotal, displayDisposable),
    [history, displayTotal, displayDisposable]);

  const ahorroSugerencias = useMemo(() => buildAhorroSugerencias({
    rows, disposable: displayDisposable, total: displayTotal, estimatedIncome: displayIncome,
  }), [rows, displayDisposable, displayTotal, displayIncome]);

  const planItems = useMemo(() => buildPlanProximoMes({
    rows, disposable: displayDisposable, total: displayTotal, estimatedIncome: displayIncome, history,
  }), [rows, displayDisposable, displayTotal, displayIncome, history]);

  const objetivo = useMemo(() => buildObjetivo({ disposable: displayDisposable, total: displayTotal }),
    [displayDisposable, displayTotal]);

  const advisorContext = useMemo(() => {
    const totalSaving = ahorroSugerencias.reduce((s, sg) => s + sg.saving, 0);
    return [
      `Informe de ${MONTH_NAMES[month - 1]} ${year}.`,
      `Gasté ${formatCurrency(displayTotal)}.`,
      `Estado del mes: ${statusData.label}.`,
      displayDisposable > 0 ? `Tengo ${formatCurrency(displayDisposable)} en prescindibles.` : '',
      displayIncome ? `Eso es el ${Math.round((displayTotal / displayIncome) * 100)}% de mi ingreso.` : '',
      rows[0] ? `Mi categoría más alta: "${rows[0].name}" (${Math.round(rows[0].pct * 100)}%).` : '',
      comparacion.vsPrev ? `Cambio vs mes pasado: ${comparacion.vsPrev.changePct > 0 ? '+' : ''}${comparacion.vsPrev.changePct}%.` : '',
      totalSaving > 0 ? `Podría ahorrar ${formatCurrency(totalSaving)}/mes.` : '',
      '¿Qué me recomendás hacer el próximo mes?',
    ].filter(Boolean).join(' ');
  }, [month, year, displayTotal, statusData, displayDisposable, displayIncome, rows, comparacion, ahorroSugerencias]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.screenHeader}>
          <Text variant="h4">Análisis</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <TouchableOpacity onPress={prevMonth} style={{ padding: spacing[1] }}>
              <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
            </TouchableOpacity>
            <Text variant="bodySmall" color={colors.text.secondary}>
              {MONTH_NAMES[month - 1]} {year}
            </Text>
            <TouchableOpacity
              onPress={nextMonth}
              disabled={isCurrentMonth}
              style={{ padding: spacing[1], opacity: isCurrentMonth ? 0.3 : 1 }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.exportBtn} onPress={handleExportPdf} disabled={exporting} activeOpacity={0.8}>
              {exporting
                ? <ActivityIndicator size="small" color={colors.bg.primary} />
                : <Ionicons name="download-outline" size={15} color={colors.bg.primary} />
              }
              <Text style={s.exportBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tabs ── */}
        <View style={s.tabsRow}>
          {(['resumen', 'categorias', 'inflacion', 'oportunidades'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tabPill, activeTab === tab && s.tabPillActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.75}
            >
              <Text style={[s.tabPillText, activeTab === tab && s.tabPillTextActive]}>
                {tab === 'resumen' ? 'Resumen' : tab === 'categorias' ? 'Categorías' : tab === 'inflacion' ? 'Inflación' : 'Oportunidades'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : displayTotal === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="bar-chart-outline" size={40} color={colors.text.tertiary} />
            </View>
            <Text variant="subtitle" color={colors.text.primary} align="center">
              Sin datos para {MONTH_NAMES[month - 1]} {year}
            </Text>
            <Text variant="body" color={colors.text.secondary} align="center" style={{ lineHeight: 22 }}>
              Cargá gastos para ver tu análisis, estado del mes y oportunidades de ahorro.
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/(app)/expenses')} activeOpacity={0.8}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: colors.white }}>
                Ir a cargar gastos
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── TAB: Resumen ── */}
            {activeTab === 'resumen' && (() => {
              const totalRecuperable = ahorroSugerencias.reduce((s, sg) => s + sg.saving, 0);
              const othersRow = rows.find(r => r.name.toLowerCase() === 'otros');
              const othersPct = othersRow && displayTotal > 0 ? othersRow.pct * 100 : 0;
              const DOT_COLORS = [colors.red, '#F59E0B', colors.accent, colors.primary];
              return (
                <>
                  {/* Card principal — Dinero recuperable */}
                  <View style={s.investHeroCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Text variant="label" color={colors.text.tertiary}>TU POTENCIAL DE INVERSIÓN ESTE MES</Text>
                      <Ionicons name="information-circle-outline" size={14} color={colors.text.tertiary} />
                    </View>
                    <Text style={s.investHeroAmount}>{formatCurrency(totalRecuperable)}</Text>
                    <Text variant="bodySmall" color={colors.text.secondary}>
                      Ajustando estos gastos podés invertir esta plata
                    </Text>
                    {ahorroSugerencias.slice(0, 4).map((sg, i) => (
                      <View key={i} style={s.investRow}>
                        <View style={[s.investDot, { backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }]} />
                        <Text variant="bodySmall" color={colors.text.secondary} style={{ flex: 1 }}>{sg.text}</Text>
                        <Text variant="bodySmall" style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.primary }}>
                          {formatCurrency(sg.saving)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Alerta "Otros" */}
                  {othersPct > 15 && (
                    <View style={s.othersAlert}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                        <Ionicons name="warning-outline" size={18} color='#F59E0B' />
                        <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold', flex: 1 }}>
                          Tenés {Math.round(othersPct)}% de gastos en "Otros"
                        </Text>
                      </View>
                      <Text variant="caption" color={colors.text.secondary} style={{ lineHeight: 18 }}>
                        Supera el 15% recomendado. Recategorizá estos gastos para que la IA te dé mejores recomendaciones.
                      </Text>
                      <TouchableOpacity onPress={() => router.push('/(app)/expenses' as any)} style={s.othersAlertCta}>
                        <Text variant="caption" style={{ fontFamily: 'Montserrat_700Bold', color: '#F59E0B' }}>
                          Recategorizar ahora →
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Termómetro de inflación */}
                  <InflationThermometer userId={user!.id} year={year} month={month} />

                  <AdvisorCTA context={advisorContext} />
                </>
              );
            })()}

            {/* ── TAB: Categorías ── */}
            {activeTab === 'categorias' && (
              <>
                <ResumenCard
                  total={displayTotal} necessary={displayNecessary}
                  disposable={displayDisposable} investable={displayInvestable}
                  estimatedIncome={displayIncome}
                />
                <CategoryBreakdown rows={rows} total={total || displayTotal} />
              </>
            )}

            {/* ── TAB: Inflación ── */}
            {activeTab === 'inflacion' && (
              <>
                <InflationThermometer userId={user!.id} year={year} month={month} />
                {investments.length > 0 && (() => {
                  const totalInvested = investments.reduce((s, inv) => s + inv.amount, 0);
                  const ganancia      = totalInvested * (fciRate / 100);
                  const perdidaInfl   = totalInvested * (inflationRate / 100);
                  const netoPct       = fciRate - inflationRate;
                  const ganó          = netoPct >= 0;
                  return (
                    <Card style={s.patrimonioCard}>
                      <View style={s.patrimonioHeader}>
                        <Ionicons name={ganó ? 'trending-up-outline' : 'trending-down-outline'} size={20} color={ganó ? colors.neon : colors.red} />
                        <Text variant="label" color={colors.text.secondary}>PATRIMONIO VS INFLACIÓN</Text>
                      </View>
                      <Text variant="h4" color={ganó ? colors.neon : colors.red}>{ganó ? '+' : ''}{netoPct.toFixed(1)}% real este mes</Text>
                      <Text variant="caption" color={colors.text.secondary} style={{ lineHeight: 18 }}>
                        Tu inversión de {formatCurrency(totalInvested)} rindió ~{formatCurrency(Math.round(ganancia))} ({fciRate.toFixed(1)}%), pero la inflación consumió ~{formatCurrency(Math.round(perdidaInfl))} ({inflationRate.toFixed(1)}%).
                      </Text>
                      <View style={s.patrimonioRow}>
                        <View style={s.patrimonioItem}>
                          <Text variant="caption" color={colors.text.tertiary} style={{ fontSize: 9 }}>RENDIMIENTO</Text>
                          <Text variant="labelMd" color={colors.neon}>+{formatCurrency(Math.round(ganancia))}</Text>
                        </View>
                        <View style={s.patrimonioDivider} />
                        <View style={s.patrimonioItem}>
                          <Text variant="caption" color={colors.text.tertiary} style={{ fontSize: 9 }}>INFLACIÓN</Text>
                          <Text variant="labelMd" color={colors.red}>-{formatCurrency(Math.round(perdidaInfl))}</Text>
                        </View>
                        <View style={s.patrimonioDivider} />
                        <View style={s.patrimonioItem}>
                          <Text variant="caption" color={colors.text.tertiary} style={{ fontSize: 9 }}>NETO</Text>
                          <Text variant="labelMd" color={ganó ? colors.neon : colors.red}>{ganó ? '+' : ''}{formatCurrency(Math.round(ganancia - perdidaInfl))}</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={s.patrimonioBtn} onPress={() => router.push('/(app)/simulator' as any)} activeOpacity={0.85}>
                        <Text variant="label" color={colors.primary}>Ver simulador →</Text>
                      </TouchableOpacity>
                    </Card>
                  );
                })()}
              </>
            )}

            {/* ── TAB: Oportunidades ── */}
            {activeTab === 'oportunidades' && (
              <>
                <DecisionHistorySection opportunities={buildOpportunities(pastOppData)} />
                <HistoryComparisonCard history={history} comparacion={comparacion} currentTotal={displayTotal} />
                <PlanProximoMesCard items={planItems} />
                {objetivo && <ObjetivoCard objetivo={objetivo} />}
                <AdvisorCTA context={advisorContext} />
              </>
            )}
          </>
        )}

      </ScrollView>

      <FirstVisitSheet
        visible={isFirstVisit}
        screenTitle="Tu informe mensual"
        screenIcon="bar-chart-outline"
        iconColor={colors.primary}
        features={[
          { icon: 'calendar-outline', color: colors.primary, title: 'Navegá mes por mes', body: 'Usá las flechas del selector para revisar cualquier mes anterior y ver cómo evolucionaron tus gastos.' },
          { icon: 'pie-chart-outline', color: colors.yellow, title: 'Desglose por categoría', body: 'Ves exactamente en qué gastás más y cómo se compara con meses anteriores.' },
          { icon: 'trending-up-outline', color: colors.neon, title: 'Oportunidades de inversión', body: 'La sección "Oportunidades pasadas" te muestra cuánto podrías haber ganado invirtiendo en lugar de gastar.' },
        ]}
        onDismiss={markVisited}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.bg.primary },
  scroll:       { paddingHorizontal: layout.screenPadding, paddingTop: spacing[4], paddingBottom: layout.tabBarHeight + spacing[8], gap: spacing[4] },
  loading:      { height: 280, alignItems: 'center', justifyContent: 'center' },
  empty:        { alignItems: 'center', justifyContent: 'center', gap: spacing[4], paddingVertical: spacing[10] },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: colors.neon, borderRadius: 10, paddingHorizontal: spacing[5], paddingVertical: spacing[3] },
  section:      { padding: spacing[5] },

  screenHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  exportBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 12, color: colors.white },

  tabsRow:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border.subtle, marginHorizontal: -layout.screenPadding, paddingHorizontal: layout.screenPadding },
  tabPill:           { paddingHorizontal: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabPillActive:     { borderBottomColor: colors.primary },
  tabPillText:       { fontFamily: 'Montserrat_500Medium', fontSize: 13, color: colors.text.tertiary },
  tabPillTextActive: { color: colors.primary, fontFamily: 'Montserrat_600SemiBold' },

  // Resumen tab - investment hero
  investHeroCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 16,
    padding: spacing[4],
    gap: spacing[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  investHeroAmount: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 34,
    lineHeight: 40,
    color: colors.text.primary,
  },
  investRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  investDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  othersAlert: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F59E0B' + '40',
    borderRadius: 16,
    padding: spacing[4],
    gap: spacing[2],
  },
  othersAlertCta: { alignSelf: 'flex-start', paddingTop: spacing[1] },

  patrimonioCard:    { padding: spacing[5], gap: spacing[4] },
  patrimonioHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  patrimonioRow:     { flexDirection: 'row', alignItems: 'center', paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border.subtle },
  patrimonioItem:    { flex: 1, gap: spacing[1] },
  patrimonioDivider: { width: 1, height: 28, backgroundColor: colors.border.subtle, marginHorizontal: spacing[2] },
  patrimonioBtn:     { alignSelf: 'flex-start' },
});
