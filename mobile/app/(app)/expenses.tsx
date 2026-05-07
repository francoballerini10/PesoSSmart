import React, { useEffect, useMemo, useState } from 'react';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { ExpensesSkeletonLoader, SmartLoadingState } from '@/components/ui/SkeletonLoader';
import { useRouter } from 'expo-router';
import {
  View,
  ScrollView,
  SectionList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useDolarRates, fetchDolarRateNow, DOLAR_LABELS, type DolarType } from '@/hooks/useDolarRates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { colors, spacing, layout } from '@/theme';
import { Text, Button, Input, Badge } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useExpensesStore } from '@/store/expensesStore';
import type { DetectedSubscription } from '@/store/expensesStore';
import { useRoundUpStore } from '@/store/roundUpStore';
import { useStreakStore } from '@/store/streakStore';
import { hapticMedium, hapticWarning, hapticSuccess } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/utils/format';
import type { PaymentMethod, Expense, ExpenseClassification } from '@/types';
import { PendingTransactions } from '@/components/PendingTransactions';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { FirstVisitSheet } from '@/components/FirstVisitSheet';
import { useSavingsStore } from '@/store/savingsStore';
import { InflationThermometer } from '@/components/InflationThermometer';
import { DecisionHistorySection, buildOpportunities } from '@/components/DecisionHistory';
import {
  MONTH_NAMES, PALETTE, type CategoryRow, type MonthSummary,
  buildComparacion, buildAhorroSugerencias, buildPlanProximoMes, buildObjetivo,
  ResumenCard, CategoryBreakdown, HistoryComparisonCard,
  PlanProximoMesCard, ObjetivoCard, AdvisorCTA,
} from '@/components/ReportCards';

const DONUT_R = 34;
const DONUT_CIRCUMF = 2 * Math.PI * DONUT_R;

function DonutChart({ necessary, disposable, investable, total }: {
  necessary: number; disposable: number; investable: number; total: number;
}) {
  const segs = [
    { value: necessary,  color: colors.accent },
    { value: disposable, color: colors.red    },
    { value: investable, color: colors.neon   },
  ].filter(s => s.value > 0);
  let offset = 0;
  return (
    <Svg width={84} height={84} viewBox="0 0 84 84">
      <SvgCircle cx="42" cy="42" r={DONUT_R} fill="none" stroke={colors.border.subtle} strokeWidth={9} />
      {segs.map((seg, i) => {
        const len = (seg.value / total) * DONUT_CIRCUMF;
        const dashArray = `${len} ${DONUT_CIRCUMF - len}`;
        const dashOffset = -offset;
        offset += len;
        return (
          <SvgCircle
            key={i} cx="42" cy="42" r={DONUT_R}
            fill="none" stroke={seg.color} strokeWidth={9}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            rotation="-90" origin="42,42"
          />
        );
      })}
    </Svg>
  );
}

const PM_LABELS: Record<string, string> = {
  cash: 'Efectivo', debit: 'Débito', credit: 'Crédito',
  transfer: 'Transferencia', digital_wallet: 'Billetera', other: 'Otro',
};

const expenseSchema = z.object({
  description: z.string().min(1, 'Describí el gasto.').max(100),
  amount: z.string().min(1, 'Ingresá el monto.').refine(
    (v) => !isNaN(parseFloat(v.replace(',', '.'))) && parseFloat(v.replace(',', '.')) > 0,
    'El monto debe ser mayor a 0.'
  ),
  date: z.string().min(1, 'Seleccioná una fecha.'),
  payment_method: z.string().min(1),
  notes: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

const paymentMethods: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Efectivo', icon: 'cash-outline' },
  { value: 'debit', label: 'Débito', icon: 'card-outline' },
  { value: 'credit', label: 'Crédito', icon: 'card-outline' },
  { value: 'transfer', label: 'Transferencia', icon: 'swap-horizontal-outline' },
  { value: 'digital_wallet', label: 'Billetera digital', icon: 'phone-portrait-outline' },
  { value: 'other', label: 'Otro', icon: 'ellipsis-horizontal-outline' },
];

// ─── BarChart — reemplaza al donut ────────────────────────────────────────────

function CategoryBarChart({ rows, total }: {
  rows: { name: string; color: string; amount: number; pct: number }[];
  total: number;
}) {
  const maxAmount = rows[0]?.amount ?? 1;
  return (
    <View style={detStyles.barChart}>
      {/* Resumen total */}
      <View style={detStyles.totalRow}>
        <Text variant="label" color={colors.text.tertiary}>TOTAL DEL MES</Text>
        <Text variant="labelMd" color={colors.text.primary}>{formatCurrency(total)}</Text>
      </View>

      {/* Barra stacked de composición */}
      <View style={detStyles.stackBar}>
        {rows.map((row, i) => (
          <View
            key={i}
            style={[
              detStyles.stackSlice,
              { flex: row.amount, backgroundColor: row.color },
              i === 0 && { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
              i === rows.length - 1 && { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
            ]}
          />
        ))}
      </View>

      {/* Filas de barras horizontales */}
      <View style={detStyles.barList}>
        {rows.map((row, i) => (
          <View key={i} style={detStyles.barRow}>
            {/* Label row */}
            <View style={detStyles.barLabelRow}>
              <View style={[detStyles.barDot, { backgroundColor: row.color }]} />
              <Text style={detStyles.barName} numberOfLines={2} ellipsizeMode="tail">{row.name}</Text>
              <Text style={[detStyles.barPct, { color: row.color }]}>
                {Math.round(row.pct * 100)}%
              </Text>
              <Text style={detStyles.barAmount}>{formatCurrency(row.amount)}</Text>
            </View>
            {/* Barra proporcional al máximo */}
            <View style={detStyles.barTrack}>
              <View style={[
                detStyles.barFill,
                { width: `${(row.amount / maxAmount) * 100}%`, backgroundColor: row.color },
              ]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Estilos del card de detalles ─────────────────────────────────────────────

const detStyles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenPadding,
    marginTop:        spacing[1],
    marginBottom:     spacing[2],
    paddingVertical:  spacing[5],
    paddingHorizontal: spacing[5],
    backgroundColor:  colors.bg.card,
    borderWidth:      1,
    borderColor:      colors.border.default,
    borderRadius:     12,
    gap:              spacing[5],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  barChart:   { gap: spacing[4] },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Stacked bar
  stackBar:   { height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border.subtle },
  stackSlice: { height: '100%' },

  // Bar list
  barList:   { gap: spacing[4] },
  barRow:    { gap: spacing[1] },
  barLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: 4 },
  barDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  barName:   { flex: 1, fontFamily: 'Montserrat_500Medium', fontSize: 13, color: colors.text.primary },
  barPct:    { fontFamily: 'Montserrat_700Bold', fontSize: 12, minWidth: 32, textAlign: 'right' },
  barAmount: { fontFamily: 'Montserrat_600SemiBold', fontSize: 12, color: colors.text.secondary, textAlign: 'right', flexShrink: 0 },
  barTrack:  { height: 6, backgroundColor: colors.border.subtle, borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3 },

  // Reports CTA
  reportCta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '40',
    borderRadius: 12, paddingVertical: spacing[4],
    backgroundColor: colors.primary + '0A',
  },
});

// ─── MonthSelector ────────────────────────────────────────────────────────────

function buildMonthList(): { month: number; year: number; label: string }[] {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      month: d.getMonth() + 1,
      year:  d.getFullYear(),
      label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
               .replace('.', '').replace(' ', " '"),
    });
  }
  return result;
}

const MONTH_LIST = buildMonthList();

function MonthSelector({
  selected,
  onSelect,
}: {
  selected: { month: number; year: number };
  onSelect: (month: number, year: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={msStyles.row}
      style={msStyles.container}
    >
      {MONTH_LIST.map((m) => {
        const isActive = m.month === selected.month && m.year === selected.year;
        return (
          <TouchableOpacity
            key={`${m.year}-${m.month}`}
            style={[msStyles.chip, isActive && msStyles.chipActive]}
            onPress={() => onSelect(m.month, m.year)}
          >
            <Text
              variant="label"
              style={{ fontSize: 10, color: isActive ? colors.white : colors.text.secondary }}
            >
              {m.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const msStyles = StyleSheet.create({
  container: { marginHorizontal: -layout.screenPadding },
  row:       { paddingHorizontal: layout.screenPadding, gap: spacing[2], paddingVertical: spacing[2] },
  chip:      {
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderRadius: 20, borderWidth: 1, borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
  },
  chipActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
});

// ─── AnalysisTeaser ────────────────────────────────────────────────────────────

function AnalysisTeaser({ recuperable, onPress }: { recuperable: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={teaserS.card} onPress={onPress} activeOpacity={0.85}>
      <View style={teaserS.iconWrap}>
        <Ionicons name="analytics-outline" size={22} color="#2E7D32" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={teaserS.title}>Tu análisis ya está listo</Text>
        {recuperable > 0 && (
          <Text style={teaserS.amount}>Encontramos {formatCurrency(recuperable)} para recuperar</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#757575" />
    </TouchableOpacity>
  );
}

const teaserS = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8F5E9', borderRadius: 16, padding: 14, marginTop: 8, marginBottom: 8 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C8E6C9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:    { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: '#212121' },
  amount:   { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: '#2E7D32' },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const router = useRouter();
  const { isFirstVisit, markVisited } = useFirstVisit('expenses');
  const { user } = useAuthStore();
  const {
    expenses,
    categories,
    totalThisMonth,
    totalNecessary,
    totalDisposable,
    totalInvestable,
    estimatedIncome,
    fetchExpenses,
    fetchMoreExpenses,
    fetchCategories,
    fetchSubscriptionsAndProjection,
    addExpense,
    updateExpense,
    deleteExpense,
    isLoading,
    isLoadingMore,
    hasMore,
    filter,
    setFilter,
    subscriptions,
  } = useExpensesStore();

  const { rates, labels: dolarLabels } = useDolarRates();
  // dolarLabels viene del hook pero también exportamos DOLAR_LABELS directamente

  const roundUpStore  = useRoundUpStore();
  const streakStore   = useStreakStore();
  const { fetchAll: loadSavings } = useSavingsStore();

  useEffect(() => {
    roundUpStore.load();
    roundUpStore.checkReset();
    streakStore.load();
  }, []);

  const [showSubscriptions, setShowSubscriptions] = useState(false);

  const expenseSections = useMemo(() => {
    const grouped: Record<string, { date: string; items: Expense[]; total: number }> = {};
    for (const e of expenses) {
      if (!grouped[e.date]) grouped[e.date] = { date: e.date, items: [], total: 0 };
      grouped[e.date].items.push(e);
      grouped[e.date].total += e.amount;
    }
    return Object.values(grouped)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(g => ({ title: g.date, data: g.items, total: g.total }));
  }, [expenses]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');

  // Multi-moneda
  const [currency,      setCurrency]      = useState<'ARS' | 'USD'>('ARS');
  const [dolarType,     setDolarType]     = useState<DolarType>('blue');

  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para editar un gasto confirmado
  const [editingExpense,     setEditingExpense]     = useState<Expense | null>(null);
  const [editExpenseValues,  setEditExpenseValues]  = useState<{
    description: string;
    amount: string;
    date: string;
    classification: ExpenseClassification;
    category_id: string | null;
  } | null>(null);
  const [isSavingEdit,       setIsSavingEdit]       = useState(false);

  const pickAndProcessScreenshot = async () => {
    if (!user?.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus fotos para importar el screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: false,
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setIsProcessing(true);
    try {
      // Redimensionar a 900px de ancho para que el modelo pueda leer el texto
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 900 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!resized.base64) throw new Error('No se pudo procesar la imagen');

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-screenshot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            image_base64: resized.base64,
            image_type: 'image/jpeg',
          }),
        }
      );
      const data = await response.json();
      if (data.expenses && data.expenses.length > 0) {
        // Auto-guardar todos los gastos detectados sin pedir confirmación
        for (const e of data.expenses) {
          await addExpense(user.id, {
            description: e.description,
            amount: e.amount,
            date: e.date,
            payment_method: 'digital_wallet',
            notes: null,
            is_recurring: false,
          });
        }
        fetchExpenses(user.id);
        Alert.alert(
          'Gastos registrados',
          `${data.expenses.length} gasto${data.expenses.length > 1 ? 's' : ''} guardado${data.expenses.length > 1 ? 's' : ''} automáticamente.`
        );
      } else {
        Alert.alert('Sin resultados', data.debug ?? data.error ?? 'El modelo no detectó gastos. Probá con una captura más clara.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo procesar la imagen. Intentá de nuevo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setEditExpenseValues({
      description:    expense.description,
      amount:         String(expense.amount),
      date:           expense.date,
      classification: expense.classification ?? 'necessary',
      category_id:    expense.category_id,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingExpense || !editExpenseValues) return;
    const amount = parseFloat(editExpenseValues.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.');
      return;
    }
    setIsSavingEdit(true);
    try {
      await updateExpense(editingExpense.id, {
        description:    editExpenseValues.description,
        amount,
        date:           editExpenseValues.date,
        classification: editExpenseValues.classification,
        category_id:    editExpenseValues.category_id,
      });
      setEditingExpense(null);
      setEditExpenseValues(null);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el cambio.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    Alert.alert('Eliminar gasto', '¿Estás seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(id);
            setEditingExpense(null);
            setEditExpenseValues(null);
          } catch {
            Alert.alert('Error', 'No se pudo eliminar el gasto.');
          }
        },
      },
    ]);
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      notes: '',
    },
  });

  const [pendingTxs,        setPendingTxs]        = useState<any[]>([]);
  const [isPolling,         setIsPolling]         = useState(false);
  const [gmailTokenExpired, setGmailTokenExpired] = useState(false);
  const [inCoupleMode,  setInCoupleMode]  = useState(false);
  const [isShared,      setIsShared]      = useState(false);

  // ── Análisis integrado ──
  const now = new Date();
  const [activeView,      setActiveView]      = useState<'gastos' | 'analisis'>('gastos');
  const [reportTab,       setReportTab]       = useState<'resumen' | 'categorias' | 'inflacion' | 'oportunidades'>('resumen');
  const [reportRows,      setReportRows]      = useState<CategoryRow[]>([]);
  const [reportTotal,     setReportTotal]     = useState(0);
  const [history,         setHistory]         = useState<MonthSummary[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [inflationRate,   setInflationRate]   = useState(3.4);
  const [pastOppData,     setPastOppData]     = useState<{ monthKey: string; disposable: number; categories: Record<string, number> }[]>([]);

  useEffect(() => {
    if (user?.id) {
      fetchExpenses(user.id);
      fetchCategories();
      fetchSubscriptionsAndProjection(user.id);
      pollGmail();
      checkCoupleMode(user.id);
    }
  }, [user?.id, filter]);

  const reportMonth    = filter.month ?? (now.getMonth() + 1);
  const reportYear     = filter.year  ?? now.getFullYear();
  const isCurrentMonth = reportMonth === now.getMonth() + 1 && reportYear === now.getFullYear();

  useEffect(() => {
    if (!user?.id) return;
    const rStart = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`;
    const nm = reportMonth === 12 ? 1 : reportMonth + 1;
    const ny = reportMonth === 12 ? reportYear + 1 : reportYear;
    const rEnd = `${ny}-${String(nm).padStart(2, '0')}-01`;
    const oppStart = (() => {
      const d = new Date(reportYear, reportMonth - 4, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    })();
    setIsReportLoading(true);
    Promise.all([
      supabase.from('expenses').select('amount, category:expense_categories(id, name_es, color), classification').eq('user_id', user.id).is('deleted_at', null).gte('date', rStart).lt('date', rEnd),
      supabase.from('expenses').select('amount, date, classification').eq('user_id', user.id).is('deleted_at', null).gte('date', oppStart).lt('date', rStart),
      supabase.from('expenses').select('amount, date, classification, category:expense_categories(name_es)').eq('user_id', user.id).is('deleted_at', null).eq('classification', 'disposable').gte('date', oppStart).lt('date', rStart),
    ]).then(([mainRes, histRes, oppRes]) => {
      const map: Record<string, CategoryRow> = {};
      let sum = 0;
      for (const exp of mainRes.data ?? []) {
        const cat = (exp as any).category;
        const catId = cat?.id ?? 'none';
        if (!map[catId]) map[catId] = { id: catId, name: cat?.name_es ?? 'Sin categoría', color: cat?.color ?? PALETTE[Object.keys(map).length % PALETTE.length], amount: 0, pct: 0 };
        map[catId].amount += (exp as any).amount;
        sum += (exp as any).amount;
      }
      setReportTotal(sum);
      setReportRows(Object.values(map).map(r => ({ ...r, pct: sum > 0 ? r.amount / sum : 0 })).sort((a, b) => b.amount - a.amount));

      const histMap: Record<string, MonthSummary> = {};
      for (const exp of (histRes.data ?? []) as any[]) {
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
        const mk = exp.date.slice(0, 7);
        const catName = exp.category?.name_es ?? 'Prescindibles';
        if (!oppMap[mk]) oppMap[mk] = { monthKey: mk, disposable: 0, categories: {} };
        oppMap[mk].disposable += exp.amount;
        oppMap[mk].categories[catName] = (oppMap[mk].categories[catName] ?? 0) + exp.amount;
      }
      setPastOppData(Object.values(oppMap));

      supabase.from('market_rates').select('instrument, rate_monthly').in('instrument', ['inflation', 'fci_mm']).then(({ data }) => {
        if (!data) return;
        for (const row of data) {
          if (row.instrument === 'inflation') setInflationRate(Number(row.rate_monthly));
        }
      });
    }).catch(err => console.error('[Gastos/Análisis]', err)).finally(() => setIsReportLoading(false));
  }, [user?.id, reportMonth, reportYear]);

  useEffect(() => { if (user?.id) loadSavings(user.id); }, [user?.id]);

  const checkCoupleMode = async (userId: string) => {
    const { data } = await (supabase as any)
      .from('family_members')
      .select('role, family_groups!inner(group_type)')
      .eq('user_id', userId)
      .single();
    setInCoupleMode((data as any)?.family_groups?.group_type === 'couple');
  };

  const pollGmail = async () => {
    setIsPolling(true);
    const { data: { session: cachedSession } } = await supabase.auth.getSession();
    const token = cachedSession?.access_token;
    console.log('[pollGmail] token:', token ? 'ok' : 'null', '| expires_at:', cachedSession?.expires_at);
    if (!token) { setIsPolling(false); return; }

    const status = await pollGmailWithToken(token);

    // Si el JWT venció, forzar refresh y reintentar una sola vez
    if (status === 401) {
      console.log('[pollGmail] JWT rechazado, forzando refreshSession...');
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        console.log('[pollGmail] Sesión inválida, no se puede refrescar:', refreshError?.message);
        setIsPolling(false);
        return;
      }
      console.log('[pollGmail] Sesión refrescada OK, reintentando...');
      await pollGmailWithToken(refreshed.session.access_token);
    }
    setIsPolling(false);
  };

  const pollGmailWithToken = async (token: string): Promise<number | undefined> => {
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/gmail-poll`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[pollGmail] status:', res.status);
      if (!res.ok) {
        const errBody = await res.text();
        console.log('[pollGmail] error body:', errBody);
        return res.status;
      }
      const data = await res.json();
      // Token de Gmail vencido — la función devuelve 200 con code GMAIL_TOKEN_EXPIRED
      if (data?.code === 'GMAIL_TOKEN_EXPIRED') {
        console.log('[pollGmail] Token Gmail expirado, mostrando aviso.');
        setGmailTokenExpired(true);
        return;
      }
      setGmailTokenExpired(false);
      console.log('[pollGmail] gmail_connected:', data?.gmail_connected, '| new_found:', data?.new_found, '| pending:', data?.pending?.length ?? 0);
      setPendingTxs(data?.pending ?? []);
    } catch (e) {
      console.log('[pollGmail] fetch error:', e);
    }
  };

  const onSubmit = async (data: ExpenseFormData) => {
    if (!user?.id) return;
    try {
      const rawAmount = parseFloat(data.amount.replace(',', '.'));

      let finalAmount = rawAmount;
      let notesWithFx = data.notes || null;

      if (currency === 'USD') {
        let rate: number;
        try {
          // Fetch fresco en el momento exacto de guardar
          rate = await fetchDolarRateNow(dolarType);
        } catch {
          Alert.alert(
            'Sin cotización',
            'No se pudo obtener la cotización del dólar en este momento. Verificá tu conexión e intentá de nuevo.',
          );
          return;
        }
        finalAmount = Math.round(rawAmount * rate);
        const fxNote = `USD ${rawAmount.toLocaleString('es-AR')} × $${rate.toLocaleString('es-AR')} (${DOLAR_LABELS[dolarType]})`;
        notesWithFx = data.notes ? `${data.notes} | ${fxNote}` : fxNote;
      }

      const savedExpense = await addExpense(user.id, {
        description:    data.description,
        amount:         finalAmount,
        date:           data.date,
        payment_method: selectedPayment,
        category_id:    selectedCategory ?? undefined,
        notes:          notesWithFx,
        is_recurring:   false,
      });

      // Gamificación — racha
      const classification = (savedExpense as any).classification ?? 'necessary';
      streakStore.recordExpense(data.date, classification as any);

      // Haptic según clasificación
      if (classification === 'disposable') {
        hapticWarning();   // vibración de alerta — es prescindible
      } else {
        hapticMedium();    // confirmación estándar
      }

      // Redondeo automático
      const roundedUp = await roundUpStore.recordExpense(finalAmount);
      if (roundedUp > 0) {
        hapticSuccess();   // logro — acumulaste más ahorro
        const dest = roundUpStore.destination === 'fci' ? 'FCI Money Market' : 'Ahorro en efectivo';
        Alert.alert(
          '🪙 Redondeo automático',
          `+$${roundedUp.toLocaleString('es-AR')} acumulados en ${dest}.`,
          [{ text: 'OK' }],
          { cancelable: true },
        );
      }

      reset();
      setShowAddModal(false);
      setSelectedCategory(null);
      setCurrency('ARS');
      setIsShared(false);
      // Si el filtro activo no coincide con el mes del nuevo gasto, sincronizarlo
      // para que el gasto recién agregado sea visible inmediatamente.
      const [ey, em] = data.date.split('-').map(Number);
      if (filter.month !== em || filter.year !== ey) {
        setFilter({ month: em, year: ey });
      }
    } catch {
      Alert.alert('Error', 'No se pudo guardar el gasto. Intentá de nuevo.');
    }
  };

  const classificationFilter = filter.classification;

  const displayTotal      = isCurrentMonth ? totalThisMonth  : reportTotal;
  const displayNecessary  = isCurrentMonth ? totalNecessary  : 0;
  const displayDisposable = isCurrentMonth ? totalDisposable : 0;
  const displayInvestable = isCurrentMonth ? totalInvestable : 0;
  const displayIncome     = isCurrentMonth ? estimatedIncome : null;

  const ahorroSugerencias = useMemo(() => buildAhorroSugerencias({
    rows: reportRows, disposable: displayDisposable, total: displayTotal, estimatedIncome: displayIncome,
  }), [reportRows, displayDisposable, displayTotal, displayIncome]);
  const totalRecuperable = ahorroSugerencias.reduce((s, sg) => s + sg.saving, 0);
  const comparacion      = useMemo(() => buildComparacion(history, displayTotal, displayDisposable), [history, displayTotal, displayDisposable]);
  const planItems        = useMemo(() => buildPlanProximoMes({ rows: reportRows, disposable: displayDisposable, total: displayTotal, estimatedIncome: displayIncome, history }), [reportRows, displayDisposable, displayTotal, displayIncome, history]);
  const objetivo         = useMemo(() => buildObjetivo({ disposable: displayDisposable, total: displayTotal }), [displayDisposable, displayTotal]);

  const listHeader = (
    <>
      {/* Filtros de clasificación */}
      <View style={styles.filters}>
        {[
          { key: null, label: 'Todos' },
          { key: 'necessary', label: 'Necesarios' },
          { key: 'disposable', label: 'Prescindibles' },
          { key: 'investable', label: 'Invertibles' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key ?? 'all'}
            style={[
              styles.filterChip,
              classificationFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setFilter({ classification: f.key })}
          >
            <Text
              variant="label"
              style={{ fontSize: 9, letterSpacing: 0 }}
              color={classificationFilter === f.key ? colors.primary : colors.text.secondary}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Resumen del mes */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryBody}>
          {/* Columna izquierda — total */}
          <View style={{ flex: 1, gap: spacing[1] }}>
            <Text variant="caption" color={colors.text.tertiary}>TOTAL ESTE MES</Text>
            <Text style={styles.summaryTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCurrency(totalThisMonth)}</Text>
          </View>
          {/* Columna derecha — donut + leyenda */}
          {totalThisMonth > 0 && (
            <View style={{ alignItems: 'flex-end', gap: spacing[2] }}>
              <DonutChart
                necessary={totalNecessary}
                disposable={totalDisposable}
                investable={totalInvestable}
                total={totalThisMonth}
              />
              <View style={{ gap: spacing[1] }}>
                {[
                  { label: 'Necesario',    amount: totalNecessary,  color: colors.accent },
                  { label: 'Prescindible', amount: totalDisposable, color: colors.red    },
                  { label: 'Invertible',   amount: totalInvestable, color: colors.neon   },
                ].map((m) => (
                  <View key={m.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: m.color }]} />
                    <Text variant="caption" color={colors.text.secondary}>{m.label} </Text>
                    <Text variant="caption" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
                      {formatCurrency(m.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Aviso: token de Gmail vencido */}
      {gmailTokenExpired && (
        <View style={{ paddingHorizontal: layout.screenPadding, marginBottom: spacing[3] }}>
          <View style={styles.gmailExpiredBanner}>
            <Ionicons name="mail-unread-outline" size={16} color={colors.yellow} />
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
                Gmail desconectado
              </Text>
              <Text variant="caption" color={colors.text.secondary}>
                Tu conexión con Gmail venció. Reconectá tu cuenta para seguir importando gastos automáticamente.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Transacciones detectadas en Gmail */}
      {isPolling && (
        <View style={{ paddingHorizontal: layout.screenPadding, marginBottom: spacing[2] }}>
          <SmartLoadingState text="Buscando gastos en Gmail..." />
        </View>
      )}
      {(pendingTxs.length > 0 || isPolling) && (
        <View style={{ paddingHorizontal: layout.screenPadding, marginBottom: spacing[4] }}>
          <PendingTransactions
            transactions={pendingTxs}
            userId={user!.id}
            isPolling={isPolling}
            categories={categories}
            onConfirmed={() => {
              pollGmail();
              fetchExpenses(user!.id);
            }}
          />
        </View>
      )}

      {/* Búsqueda por texto */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar gastos..."
          placeholderTextColor={colors.text.tertiary}
          value={filter.search}
          onChangeText={(v) => setFilter({ search: v })}
          returnKeyType="search"
          autoCorrect={false}
        />
        {!!filter.search && (
          <TouchableOpacity onPress={() => setFilter({ search: '' })}>
            <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Suscripciones detectadas — banner compacto */}
      {subscriptions.length > 0 && (
        <TouchableOpacity
          style={styles.subsBanner}
          onPress={() => setShowSubscriptions(true)}
          activeOpacity={0.85}
        >
          <View style={styles.subsBannerLeft}>
            <View style={styles.subsBannerIcon}>
              <Ionicons name="repeat-outline" size={16} color={colors.yellow} />
            </View>
            <View style={{ gap: 2 }}>
              <Text variant="label" color={colors.yellow}>
                {subscriptions.length} SUSCRIPCIÓN{subscriptions.length > 1 ? 'ES' : ''} DETECTADA{subscriptions.length > 1 ? 'S' : ''}
              </Text>
              <Text variant="caption" color={colors.text.secondary}>
                {formatCurrency(subscriptions.reduce((s, sub) => s + sub.averageAmount, 0))} / mes · Tocá para ver el detalle
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top bar fijo ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <Text variant="h4">Gastos</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <TouchableOpacity
              style={styles.screenshotBtn}
              onPress={pickAndProcessScreenshot}
              disabled={isProcessing}
            >
              {isProcessing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="image-outline" size={20} color={colors.text.secondary} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.screenshotBtn}
              onPress={() => setFilter({ classification: undefined })}
            >
              <Ionicons name="options-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de mes */}
        <MonthSelector
          selected={{ month: filter.month ?? new Date().getMonth() + 1, year: filter.year ?? new Date().getFullYear() }}
          onSelect={(m, y) => setFilter({ month: m, year: y })}
        />

        {/* Segmented control — Gastos / Análisis */}
        <View style={styles.segControl}>
          {(['gastos', 'analisis'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.segBtn, activeView === v && styles.segBtnActive]}
              onPress={() => setActiveView(v)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segBtnText, activeView === v && styles.segBtnTextActive]}>
                {v === 'gastos' ? 'Gastos' : 'Análisis'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeView === 'gastos' ? (
      <SectionList
        style={styles.flatList}
        sections={expenseSections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ExpenseItem expense={item} onPress={() => openEditExpense(item)} />}
        renderSectionHeader={({ section }) => <DayHeader date={section.title} total={section.total} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        stickySectionHeadersEnabled={false}
        onEndReached={() => { if (user?.id && hasMore) fetchMoreExpenses(user.id); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          <View>
            {isLoadingMore && <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing[4] }} />}
            {totalThisMonth > 0 && (
              <AnalysisTeaser recuperable={totalRecuperable} onPress={() => setActiveView('analisis')} />
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingHorizontal: layout.screenPadding, paddingTop: spacing[2] }}>
              <ExpensesSkeletonLoader />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={48} color={colors.text.tertiary} />
              <Text variant="body" color={colors.text.secondary} align="center">
                No hay gastos este mes.
              </Text>
            </View>
          )
        }
      />
      ) : (
        <ScrollView
          style={styles.flatList}
          contentContainerStyle={styles.analysisList}
          showsVerticalScrollIndicator={false}
        >
          {/* Sub-tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.reportTabsScroll}
            contentContainerStyle={styles.reportTabsRow}
          >
            {(['resumen', 'categorias', 'inflacion', 'oportunidades'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.reportTabPill, reportTab === tab && styles.reportTabPillActive]}
                onPress={() => setReportTab(tab)}
                activeOpacity={0.75}
              >
                <Text style={[styles.reportTabText, reportTab === tab && styles.reportTabTextActive]}>
                  {tab === 'resumen' ? 'Resumen' : tab === 'categorias' ? 'Categorías' : tab === 'inflacion' ? 'Inflación' : 'Oportunidades'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isReportLoading ? (
            <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : displayTotal === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing[10], gap: spacing[4] }}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.text.tertiary} />
              <Text variant="body" color={colors.text.secondary} align="center">
                Sin datos para analizar este mes.
              </Text>
            </View>
          ) : (
            <>
              {reportTab === 'resumen' && (() => {
                const DOT_COLORS = [colors.red, '#F59E0B', colors.accent, colors.primary];
                return (
                  <>
                    <View style={reportS.heroCard}>
                      <Text variant="label" color={colors.text.tertiary}>TU POTENCIAL DE INVERSIÓN</Text>
                      <Text style={reportS.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCurrency(totalRecuperable)}</Text>
                      <Text variant="bodySmall" color={colors.text.secondary}>
                        Ajustando estos gastos podés invertir esta plata
                      </Text>
                      {ahorroSugerencias.slice(0, 4).map((sg, i) => (
                        <View key={i} style={reportS.investRow}>
                          <View style={[reportS.investDot, { backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }]} />
                          <Text variant="bodySmall" color={colors.text.secondary} style={{ flex: 1 }}>{sg.text}</Text>
                          <Text variant="bodySmall" style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.primary }}>
                            {formatCurrency(sg.saving)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <InflationThermometer userId={user!.id} year={reportYear} month={reportMonth} />
                    <AdvisorCTA context={`Informe de ${MONTH_NAMES[reportMonth - 1]} ${reportYear}. Gasté ${formatCurrency(displayTotal)}.`} />
                  </>
                );
              })()}

              {reportTab === 'categorias' && (
                <>
                  <ResumenCard
                    total={displayTotal} necessary={displayNecessary}
                    disposable={displayDisposable} investable={displayInvestable}
                    estimatedIncome={displayIncome}
                  />
                  <CategoryBreakdown rows={reportRows} total={reportTotal || displayTotal} />
                </>
              )}

              {reportTab === 'inflacion' && (
                <InflationThermometer userId={user!.id} year={reportYear} month={reportMonth} />
              )}

              {reportTab === 'oportunidades' && (
                <>
                  <DecisionHistorySection opportunities={buildOpportunities(pastOppData)} />
                  <HistoryComparisonCard history={history} comparacion={comparacion} currentTotal={displayTotal} />
                  <PlanProximoMesCard items={planItems} />
                  {objetivo && <ObjetivoCard objetivo={objetivo} />}
                  <AdvisorCTA context={`Informe de ${MONTH_NAMES[reportMonth - 1]} ${reportYear}. Gasté ${formatCurrency(displayTotal)}.`} />
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── FAB agregar gasto ── */}
      {activeView === 'gastos' && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={26} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Bottom sheet — Suscripciones detectadas */}
      <Modal
        visible={showSubscriptions}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowSubscriptions(false)}
      >
        <SafeAreaView style={styles.modal}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ gap: 2 }}>
              <Text variant="h4">Suscripciones detectadas</Text>
              <Text variant="caption" color={colors.text.secondary}>
                Débitos recurrentes en los últimos 90 días
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowSubscriptions(false)}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: layout.screenPadding, gap: spacing[4] }} showsVerticalScrollIndicator={false}>

            {/* Total mensual destacado */}
            <View style={subsSheetStyles.totalCard}>
              <Ionicons name="repeat-outline" size={20} color={colors.yellow} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" color={colors.text.secondary}>Total mensual en suscripciones</Text>
                <Text style={subsSheetStyles.totalAmount}>
                  {formatCurrency(subscriptions.reduce((s, sub) => s + sub.averageAmount, 0))}
                </Text>
              </View>
              <View style={subsSheetStyles.countBadge}>
                <Text style={subsSheetStyles.countText}>{subscriptions.length}</Text>
              </View>
            </View>

            {/* Lista */}
            {subscriptions.map((sub, idx) => (
              <View key={sub.description} style={subsSheetStyles.card}>
                <View style={subsSheetStyles.cardHeader}>
                  <View style={subsSheetStyles.cardIcon}>
                    <Ionicons
                      name={sub.category === 'Entretenimiento' ? 'play-circle-outline' : sub.category === 'Salud' ? 'fitness-outline' : 'card-outline'}
                      size={18}
                      color={colors.yellow}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
                      {sub.description}
                    </Text>
                    {sub.category && (
                      <Text variant="caption" color={colors.text.tertiary}>{sub.category}</Text>
                    )}
                  </View>
                  <View style={subsSheetStyles.amountCol}>
                    <Text style={subsSheetStyles.subAmount}>{formatCurrency(sub.averageAmount)}</Text>
                    <Text variant="caption" color={colors.text.tertiary}>/mes</Text>
                  </View>
                </View>

                <View style={subsSheetStyles.metaRow}>
                  <View style={subsSheetStyles.metaChip}>
                    <Ionicons name="calendar-outline" size={11} color={colors.text.tertiary} />
                    <Text variant="caption" color={colors.text.tertiary}>
                      {sub.occurrences} veces en 90 días
                    </Text>
                  </View>
                  <View style={subsSheetStyles.metaChip}>
                    <Ionicons name="time-outline" size={11} color={colors.text.tertiary} />
                    <Text variant="caption" color={colors.text.tertiary}>
                      Último: {sub.lastDate}
                    </Text>
                  </View>
                </View>

                {/* Tip de ahorro anual */}
                <View style={subsSheetStyles.tipRow}>
                  <Ionicons name="bulb-outline" size={12} color={colors.text.tertiary} />
                  <Text variant="caption" color={colors.text.tertiary} style={{ flex: 1 }}>
                    Son {formatCurrency(sub.averageAmount * 12)} al año
                  </Text>
                </View>
              </View>
            ))}

            {/* Disclaimer */}
            <View style={subsSheetStyles.disclaimer}>
              <Ionicons name="information-circle-outline" size={13} color={colors.text.tertiary} />
              <Text variant="caption" color={colors.text.tertiary} style={{ flex: 1, lineHeight: 17 }}>
                Detectamos estos débitos automáticamente a partir de tus gastos registrados. Pueden incluir suscripciones, servicios o pagos recurrentes.
              </Text>
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal agregar gasto */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modal}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text variant="h4">Nuevo gasto</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Monto prominente ── */}
              <Controller
                control={control}
                name="amount"
                render={({ field: { onChange, onBlur, value } }) => {
                  const raw  = parseFloat(value.replace(',', '.'));
                  const rate = rates[dolarType];
                  const ars  = currency === 'USD' && rate && !isNaN(raw)
                    ? Math.round(raw * rate)
                    : null;
                  return (
                    <View style={styles.amountBlock}>
                      <View style={styles.amountRow}>
                        <Text style={styles.amountPrefix}>{currency === 'USD' ? 'U$D' : '$'}</Text>
                        <TextInput
                          style={styles.amountInput}
                          placeholder="0"
                          placeholderTextColor={colors.text.tertiary}
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                      </View>
                      {errors.amount?.message && (
                        <Text variant="caption" color={colors.red}>{errors.amount.message}</Text>
                      )}
                      {ars !== null && (
                        <View style={styles.fxPreview}>
                          <Ionicons name="swap-horizontal" size={12} color={colors.text.tertiary} />
                          <Text variant="caption" color={colors.text.tertiary}>
                            = ${ars.toLocaleString('es-AR')} ARS al {dolarLabels[dolarType]}
                          </Text>
                        </View>
                      )}
                      {/* Moneda inline */}
                      <View style={[styles.currencyRow, { marginTop: spacing[2] }]}>
                        {(['ARS', 'USD'] as const).map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
                            onPress={() => setCurrency(c)}
                          >
                            <Text variant="label" color={currency === c ? colors.neon : colors.text.secondary}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {currency === 'USD' && (
                        <View style={styles.dolarRow}>
                          {(['oficial', 'blue', 'mep'] as DolarType[]).map((t) => {
                            const r = rates[t];
                            return (
                              <TouchableOpacity
                                key={t}
                                style={[styles.dolarChip, dolarType === t && styles.dolarChipActive]}
                                onPress={() => setDolarType(t)}
                              >
                                <Text variant="caption" color={dolarType === t ? colors.white : colors.text.secondary}>{dolarLabels[t]}</Text>
                                <Text variant="caption" color={dolarType === t ? colors.white : colors.text.tertiary}>{r ? `$${r.toLocaleString('es-AR')}` : '...'}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                }}
              />

              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="¿EN QUÉ GASTASTE?"
                    placeholder="Ej: Almuerzo en el trabajo"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.description?.message}
                    autoCapitalize="sentences"
                  />
                )}
              />

              {/* Categorías */}
              <View>
                <Text variant="label" color={colors.text.secondary} style={styles.inputLabel}>
                  CATEGORÍA
                </Text>
                <View style={styles.categoryGrid}>
                  {categories.map((cat) => {
                    const isActive = selectedCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.categoryGridItem, isActive && { borderColor: cat.color, backgroundColor: cat.color + '1A' }]}
                        onPress={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={20}
                          color={isActive ? cat.color : colors.text.tertiary}
                        />
                        <Text
                          variant="caption"
                          color={isActive ? colors.text.primary : colors.text.tertiary}
                          style={{ fontSize: 9, textAlign: 'center', lineHeight: 12 }}
                          numberOfLines={2}
                        >
                          {cat.name_es}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Medio de pago */}
              <View>
                <Text variant="label" color={colors.text.secondary} style={styles.inputLabel}>
                  MEDIO DE PAGO
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.paymentList}
                >
                  {paymentMethods.map((pm) => (
                    <TouchableOpacity
                      key={pm.value}
                      style={[
                        styles.paymentChip,
                        selectedPayment === pm.value && styles.paymentChipActive,
                      ]}
                      onPress={() => setSelectedPayment(pm.value)}
                    >
                      <Text
                        variant="caption"
                        color={selectedPayment === pm.value ? colors.white : colors.text.secondary}
                      >
                        {pm.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Controller
                control={control}
                name="notes"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="NOTA (opcional)"
                    placeholder="Cualquier detalle que quieras recordar"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                    numberOfLines={2}
                    style={{ height: 80 }}
                  />
                )}
              />

              {/* Toggle gasto compartido — solo si está en modo pareja */}
              {inCoupleMode && (
                <TouchableOpacity
                  style={[styles.sharedToggle, isShared && styles.sharedToggleActive]}
                  onPress={() => setIsShared(!isShared)}
                >
                  <Ionicons
                    name={isShared ? 'heart' : 'heart-outline'}
                    size={18}
                    color={isShared ? colors.neon : colors.text.secondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" color={isShared ? colors.neon : colors.text.primary}>
                      GASTO COMPARTIDO
                    </Text>
                    <Text variant="caption" color={colors.text.secondary}>
                      Visible para tu pareja en el resumen conjunto
                    </Text>
                  </View>
                  <View style={[styles.toggleDot, isShared && styles.toggleDotActive]} />
                </TouchableOpacity>
              )}

              <Button
                label="GUARDAR GASTO"
                variant="neon"
                size="lg"
                fullWidth
                isLoading={isLoading}
                onPress={handleSubmit(onSubmit)}
                style={{ marginTop: spacing[4] }}
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal editar gasto confirmado */}
      <Modal
        visible={!!editingExpense}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => { setEditingExpense(null); setEditExpenseValues(null); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text variant="h4">Editar gasto</Text>
              <TouchableOpacity onPress={() => { setEditingExpense(null); setEditExpenseValues(null); }}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {editExpenseValues && (
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Input
                  label="DESCRIPCIÓN"
                  value={editExpenseValues.description}
                  onChangeText={(v) => setEditExpenseValues((p) => p ? { ...p, description: v } : p)}
                  autoCapitalize="sentences"
                />

                <Input
                  label="MONTO (ARS)"
                  value={editExpenseValues.amount}
                  onChangeText={(v) => setEditExpenseValues((p) => p ? { ...p, amount: v } : p)}
                  keyboardType="decimal-pad"
                  leftIcon={<Text variant="body" color={colors.text.secondary}>$</Text>}
                />

                <Input
                  label="FECHA (YYYY-MM-DD)"
                  value={editExpenseValues.date}
                  onChangeText={(v) => setEditExpenseValues((p) => p ? { ...p, date: v } : p)}
                  keyboardType="numbers-and-punctuation"
                />

                {/* Clasificación */}
                <View>
                  <Text variant="label" color={colors.text.secondary} style={styles.inputLabel}>
                    CLASIFICACIÓN
                  </Text>
                  <View style={styles.classRow}>
                    {(['necessary', 'disposable', 'investable'] as ExpenseClassification[]).map((cls) => {
                      const active = editExpenseValues.classification === cls;
                      const label = cls === 'necessary' ? 'Necesario' : cls === 'disposable' ? 'Prescindible' : 'Invertible';
                      return (
                        <TouchableOpacity
                          key={cls}
                          style={[styles.classChip, active && styles.classChipActive]}
                          onPress={() => setEditExpenseValues((p) => p ? { ...p, classification: cls } : p)}
                        >
                          <Text variant="caption" color={active ? colors.neon : colors.text.secondary}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Categoría */}
                <View>
                  <Text variant="label" color={colors.text.secondary} style={styles.inputLabel}>
                    CATEGORÍA
                  </Text>
                  <View style={styles.categoryGrid}>
                    {categories.map((cat) => {
                      const isActive = editExpenseValues.category_id === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.categoryGridItem, isActive && { borderColor: cat.color, backgroundColor: cat.color + '1A' }]}
                          onPress={() => setEditExpenseValues((p) => p ? {
                            ...p,
                            category_id: p.category_id === cat.id ? null : cat.id,
                          } : p)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={cat.icon as any}
                            size={20}
                            color={isActive ? cat.color : colors.text.tertiary}
                          />
                          <Text
                            variant="caption"
                            color={isActive ? colors.text.primary : colors.text.tertiary}
                            style={{ fontSize: 9, textAlign: 'center', lineHeight: 12 }}
                            numberOfLines={2}
                          >
                            {cat.name_es}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <Button
                  label="GUARDAR CAMBIOS"
                  variant="neon"
                  size="lg"
                  fullWidth
                  isLoading={isSavingEdit}
                  onPress={handleSaveEdit}
                  style={{ marginTop: spacing[4] }}
                />

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteExpense(editingExpense!.id)}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.red} />
                  <Text variant="label" color={colors.red}>ELIMINAR GASTO</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <FirstVisitSheet
        visible={isFirstVisit}
        screenTitle="Tus gastos"
        screenIcon="wallet-outline"
        iconColor={colors.yellow}
        features={[
          { icon: 'add-circle-outline', color: colors.neon, title: 'Cargá gastos fácil y rápido', body: 'Tocá el botón "+" para registrar un gasto manual, o usá la cámara para procesar tickets y resúmenes.' },
          { icon: 'mail-outline', color: colors.primary, title: 'Gmail detecta automático', body: 'Conectando tu Gmail, escaneamos tus resúmenes y billeteras para detectar gastos sin que tengas que cargarlos.' },
          { icon: 'pricetag-outline', color: colors.yellow, title: 'Categorizá y clasificá', body: 'Cada gasto puede ser Necesario, Prescindible o Invertible — eso alimenta tu salud financiera y tus reportes.' },
        ]}
        onDismiss={markVisited}
      />
    </SafeAreaView>
  );
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  necessary:  colors.accent,
  disposable: colors.red,
  investable: colors.neon,
};

function DayHeader({ date, total }: { date: string; total: number }) {
  const d = new Date(date + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const label = isToday ? 'Hoy'
    : isYesterday ? 'Ayer'
    : d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={styles.dayHeader}>
      <Text variant="label" color={colors.text.tertiary} style={{ textTransform: 'capitalize' }}>{label}</Text>
      <Text variant="label" color={colors.text.tertiary}>{formatCurrency(total)}</Text>
    </View>
  );
}

function ExpenseItem({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  const catColor =
    (expense.category as any)?.color ??
    (expense.classification ? CLASSIFICATION_COLOR[expense.classification] : colors.border.default);
  const catIcon = (expense.category as any)?.icon ?? 'receipt-outline';

  return (
    <TouchableOpacity style={styles.expenseItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.expenseIconCircle, { backgroundColor: catColor + '22' }]}>
        <Ionicons name={catIcon as any} size={18} color={catColor} />
      </View>
      <View style={styles.expenseLeft}>
        <Text variant="bodySmall" color={colors.text.primary} numberOfLines={1}>
          {expense.description}
        </Text>
        <View style={styles.expenseMeta}>
          {expense.category && (
            <Text variant="caption" color={colors.text.tertiary}>{expense.category.name_es}</Text>
          )}
          {expense.payment_method && (
            <Text variant="caption" color={colors.text.tertiary}>
              {expense.category ? ' · ' : ''}{PM_LABELS[expense.payment_method] ?? expense.payment_method}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.expenseRight}>
        <Text variant="labelMd" color={colors.text.primary}>
          -{formatCurrency(expense.amount)}
        </Text>
        {expense.classification && (
          <Badge classification={expense.classification} label={expense.classification} small animated />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: colors.bg.primary },
  flatList: { flex: 1 },

  // ── Top bar fijo ──
  topBar: {
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[3],
    paddingBottom:     spacing[3],
    gap:               spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor:   colors.bg.primary,
  },
  topBarRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  screenshotBtn: {
    width:          36,
    height:         36,
    borderWidth:    1,
    borderColor:    colors.border.default,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // ── FAB ──
  fab: {
    position:        'absolute',
    bottom:          80,
    right:           16,
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: '#2E7D32',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     '#2E7D32',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    8,
    elevation:       6,
  },

  // ── Summary card ──
  summaryTotal: {
    fontFamily: 'Montserrat_700Bold',
    fontSize:   28,
    lineHeight: 34,
    color:      colors.text.primary,
  },
  summaryCard: {
    marginHorizontal: layout.screenPadding,
    marginTop:        spacing[3],
    marginBottom:     spacing[2],
    padding:          spacing[4],
    backgroundColor:  colors.bg.card,
    borderWidth:      1,
    borderColor:      colors.border.default,
    borderRadius:     16,
    gap:              spacing[3],
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.06,
    shadowRadius:     8,
    elevation:        3,
  },
  gmailExpiredBanner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing[3],
    backgroundColor: colors.yellow + '12',
    borderWidth:     1,
    borderColor:     colors.yellow + '30',
    borderRadius:    10,
    padding:         spacing[3],
  },
  compositionBar: {
    flexDirection: 'row',
    height:        6,
    borderRadius:  3,
    overflow:      'hidden',
    gap:           2,
  },
  barSlice: { height: '100%', borderRadius: 3 },
  summaryMetrics: {
    flexDirection: 'row',
    gap:           spacing[4],
  },
  metricItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  metricDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  summaryBody: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            spacing[3],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  legendDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    flexShrink:   0,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing[3],
    gap: spacing[1],
  },
  searchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[2],
    marginHorizontal:  layout.screenPadding,
    marginBottom:      spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[2],
    borderWidth:       1,
    borderColor:       colors.border.default,
    backgroundColor:   colors.bg.elevated,
    borderRadius:      10,
  },
  searchInput: {
    flex:       1,
    color:      colors.text.primary,
    fontSize:   14,
    fontFamily: 'Montserrat_400Regular',
    paddingVertical: spacing[1],
  },
  filterChip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 20,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '1A',
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + spacing[4],
    gap: spacing[1],
  },
  empty: {
    paddingVertical: spacing[16],
    alignItems: 'center',
    gap: spacing[4],
  },
  // Day header
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[1],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  // Expense item
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    padding: spacing[4],
  },
  expenseIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expenseLeft: { flex: 1, gap: spacing[1] },
  expenseMeta: { flexDirection: 'row', alignItems: 'center' },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  // Amount block (add modal)
  amountBlock: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 16,
    padding: spacing[5],
    gap: spacing[1],
    alignItems: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  amountPrefix: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 32,
    color: colors.text.tertiary,
  },
  amountInput: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 40,
    color: colors.text.primary,
    minWidth: 80,
    textAlign: 'center',
  },
  subsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.yellow + '33',
    backgroundColor: colors.yellow + '0A',
  },
  subsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  subsContainer: {
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.yellow + '33',
    backgroundColor: colors.bg.card,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  subsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  // Modal
  modal: { flex: 1, backgroundColor: colors.bg.primary },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalScroll: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[6],
    gap: spacing[5],
    paddingBottom: spacing[12],
  },
  inputLabel: { marginBottom: spacing[2] },
  categoryList: { gap: spacing[2] },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  categoryGridItem: {
    width: '22%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
  },
  categoryChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 20,
  },
  categoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '1A',
  },
  paymentList: { gap: spacing[2] },
  paymentChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 20,
  },
  paymentChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },

  // Multi-moneda
  currencyRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  currencyChip: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  currencyChipActive: {
    borderColor: colors.neon,
    backgroundColor: colors.neon + '15',
  },
  dolarRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  dolarChip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dolarChipActive: {
    borderColor: colors.neon,
    backgroundColor: colors.neon,
  },
  fxPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
    paddingHorizontal: spacing[1],
  },
  classRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  classChip: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: spacing[2],
    borderWidth:     1,
    borderColor:     colors.border.default,
  },
  classChipActive: {
    borderColor:     colors.neon,
    backgroundColor: colors.neon + '15',
  },
  deleteBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing[2],
    paddingVertical: spacing[3],
    borderWidth:     1,
    borderColor:     colors.red,
    borderRadius:    8,
  },
  sharedToggle: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing[3],
    padding:         spacing[4],
    borderWidth:     1,
    borderColor:     colors.border.default,
    backgroundColor: colors.bg.elevated,
  },
  sharedToggleActive: {
    borderColor:     colors.neon,
    backgroundColor: colors.neon + '11',
  },
  toggleDot: {
    width:           20,
    height:          20,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     colors.border.default,
    backgroundColor: colors.bg.primary,
  },
  toggleDotActive: {
    backgroundColor: colors.neon,
    borderColor:     colors.neon,
  },
  // Segmented control — Gastos / Análisis
  segControl: {
    flexDirection:   'row',
    backgroundColor: '#F2F2F2',
    borderRadius:    16,
    padding:         4,
    marginTop:       spacing[2],
  },
  segBtn: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: 10,
    borderRadius:    12,
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       2,
  },
  segBtnText: {
    fontFamily: 'Montserrat_500Medium',
    fontSize:   14,
    color:      '#757575',
  },
  segBtnTextActive: {
    fontFamily: 'Montserrat_600SemiBold',
    color:      '#212121',
  },
  // Analysis scroll container
  analysisList: {
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[4],
    paddingBottom:     layout.tabBarHeight + spacing[8],
    gap:               spacing[4],
  },
  // Analysis sub-tabs
  reportTabsScroll: {
    marginHorizontal: -layout.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  reportTabsRow: {
    flexDirection:     'row',
    paddingHorizontal: layout.screenPadding,
  },
  reportTabPill: {
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom:      -1,
  },
  reportTabPillActive: {
    borderBottomColor: colors.primary,
  },
  reportTabText: {
    fontFamily: 'Montserrat_500Medium',
    fontSize:   13,
    color:      colors.text.tertiary,
  },
  reportTabTextActive: {
    fontFamily: 'Montserrat_600SemiBold',
    color:      colors.primary,
  },
  // Subscriptions banner (list header)
  subsBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: layout.screenPadding, marginBottom: spacing[2],
    backgroundColor: colors.yellow + '0D', borderWidth: 1, borderColor: colors.yellow + '33',
    borderRadius: 12, padding: spacing[3],
  },
  subsBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
  subsBannerIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.yellow + '20',
    alignItems: 'center', justifyContent: 'center',
  },
});

const subsSheetStyles = StyleSheet.create({
  totalCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    backgroundColor: colors.yellow + '10', borderWidth: 1, borderColor: colors.yellow + '30',
    borderRadius: 14, padding: spacing[4],
  },
  totalAmount: { fontFamily: 'Montserrat_700Bold', fontSize: 22, color: colors.yellow, flexShrink: 1 },
  countBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.yellow + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: colors.yellow },
  card: {
    backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 14, padding: spacing[4], gap: spacing[2],
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  cardIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.yellow + '15',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  amountCol: { alignItems: 'flex-end', gap: 1 },
  subAmount: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: colors.yellow },
  metaRow: { flexDirection: 'row', gap: spacing[2] },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    backgroundColor: colors.bg.elevated, borderRadius: 6,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
  },
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: colors.border.subtle + '60', borderRadius: 6,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
  },
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2],
    paddingTop: spacing[2],
  },
});

const reportS = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.bg.card,
    borderWidth:     1,
    borderColor:     colors.border.default,
    borderRadius:    16,
    padding:         spacing[4],
    gap:             spacing[3],
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       3,
  },
  heroAmount: {
    fontFamily: 'Montserrat_700Bold',
    fontSize:   34,
    lineHeight: 40,
    color:      colors.text.primary,
  },
  investRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing[3],
    paddingTop:     spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  investDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
