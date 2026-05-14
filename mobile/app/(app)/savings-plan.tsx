import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { spacing, layout } from '@/theme';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/store/authStore';
import { fetchBudgetPlan, type BudgetPlan, type CategoryBudget } from '@/lib/budgetPlan';
import { formatCurrency } from '@/utils/format';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:     '#F7F9FC',
  card:   '#FFFFFF',
  blue:   '#2563EB',
  green:  '#16A34A',
  violet: '#8B5CF6',
  red:    '#EF4444',
  amber:  '#F59E0B',
  text:   '#111827',
  sub:    '#6B7280',
  muted:  '#9CA3AF',
  border: '#E5E7EB',
  light:  '#F3F4F6',
} as const;

const shadow = {
  shadowColor: '#1F2937',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 3,
} as const;

// ─── Category Icon helper ─────────────────────────────────────────────────────
// DB stores Ionicons names (e.g. "musical-notes-outline"), not emojis.

function CategoryIcon({ icon, color, size = 20 }: {
  icon: string | null; color: string; size?: number;
}) {
  if (!icon) return <Ionicons name="pricetag-outline" size={size} color={color} />;
  // Ionicons names contain hyphens or are lowercase ASCII
  if (icon.includes('-') || /^[a-z]/.test(icon)) {
    return <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
  }
  return <Text style={{ fontSize: size - 2, lineHeight: size + 4 }}>{icon}</Text>;
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ plan }: { plan: BudgetPlan }) {
  const dayPct = plan.dayOfMonth / plan.daysInMonth;

  return (
    <View style={hc.card}>
      {/* Glow circles for depth */}
      <View style={hc.glow1} />
      <View style={hc.glow2} />

      {/* Top row */}
      <View style={hc.topRow}>
        <Ionicons name="sparkles" size={22} color="#E9D5FF" />
        <View style={hc.iaBadge}>
          <Text style={hc.iaBadgeText}>PLAN IA</Text>
        </View>
      </View>

      {/* Main content */}
      <View style={{ gap: spacing[1] }}>
        <Text style={hc.eyebrow}>Podrías ahorrar este mes</Text>
        <Text style={hc.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {formatCurrency(plan.potentialSavings)}
        </Text>
        <Text style={hc.sub}>Si mantenés tus hábitos actuales.</Text>
      </View>

      {/* Month progress */}
      <View style={{ gap: spacing[2] }}>
        <View style={hc.progressTrack}>
          <View style={[hc.progressFill, { width: `${Math.round(dayPct * 100)}%` as any }]} />
        </View>
        <Text style={hc.progressLabel}>
          Día {plan.dayOfMonth} de {plan.daysInMonth} · {plan.monthLabel}
        </Text>
      </View>
    </View>
  );
}

const hc = StyleSheet.create({
  card:          { backgroundColor: '#7C3AED', borderRadius: 24, padding: spacing[6], gap: spacing[4], overflow: 'hidden', position: 'relative' },
  glow1:         { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: '#A78BFA30' },
  glow2:         { position: 'absolute', bottom: -40, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: '#60A5FA18' },
  topRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iaBadge:       { backgroundColor: '#FFFFFF22', borderRadius: 20, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  iaBadgeText:   { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: '#EDE9FE', letterSpacing: 1.2 },
  eyebrow:       { fontFamily: 'Montserrat_500Medium', fontSize: 13, color: '#DDD6FE' },
  amount:        { fontFamily: 'Montserrat_800ExtraBold', fontSize: 48, color: '#FFFFFF', lineHeight: 58 },
  sub:           { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: '#C4B5FD' },
  progressTrack: { height: 4, backgroundColor: '#FFFFFF22', borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 2 },
  progressLabel: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: '#A78BFA', textAlign: 'right' },
});

// ─── Excess Summary ───────────────────────────────────────────────────────────

function ExcessSummary({ plan, onCategoryPress }: {
  plan: BudgetPlan; onCategoryPress: (cat: CategoryBudget) => void;
}) {
  const topOver = plan.categories.filter(c => c.status === 'over').slice(0, 3);
  if (topOver.length === 0) return null;

  return (
    <View style={ex.card}>
      <View style={ex.titleRow}>
        <Ionicons name="search-outline" size={15} color={C.red} />
        <Text style={ex.title}>Detectamos exceso en:</Text>
      </View>
      {topOver.map(c => {
        const excess = Math.max(0, c.projected - c.avgMonthly);
        return (
          <TouchableOpacity key={c.categoryId} style={ex.row} onPress={() => onCategoryPress(c)} activeOpacity={0.75}>
            <View style={ex.iconBox}>
              <CategoryIcon icon={c.icon} color={C.red} size={16} />
            </View>
            <Text style={ex.catName} numberOfLines={1}>{c.name}</Text>
            <Text style={ex.excess}>+{formatCurrency(excess)}</Text>
            <Ionicons name="chevron-forward" size={12} color={C.muted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ex = StyleSheet.create({
  card:     { backgroundColor: C.red + '08', borderWidth: 1, borderColor: C.red + '22', borderRadius: 16, padding: spacing[4], gap: spacing[3] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title:    { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text },
  row:      { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconBox:  { width: 28, height: 28, borderRadius: 14, backgroundColor: C.red + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catName:  { flex: 1, fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.sub },
  excess:   { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.red },
});

// ─── Stat Mini Card ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <View style={sc.card}>
      <Text style={sc.label}>{label}</Text>
      <Text style={[sc.value, accent ? { color: accent } : {}]}>{value}</Text>
      {sub ? <Text style={sc.sub}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: spacing[4], gap: spacing[1], ...shadow },
  label: { fontFamily: 'Montserrat_500Medium', fontSize: 10, color: C.muted, lineHeight: 14 },
  value: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 15, color: C.text, lineHeight: 20 },
  sub:   { fontFamily: 'Montserrat_500Medium', fontSize: 10, color: C.sub },
});

// ─── Category Progress Row ────────────────────────────────────────────────────

function CategoryRow({ cat, onPress }: { cat: CategoryBudget; onPress: () => void }) {
  const barColor =
    cat.status === 'over'    ? C.red   :
    cat.status === 'warning' ? C.amber :
    C.green;

  const fillPct = Math.min((cat.pct / 1.2) * 100, 100);

  return (
    <TouchableOpacity style={cr.row} onPress={onPress} activeOpacity={0.8}>
      <View style={[cr.iconBox, { backgroundColor: barColor + '14' }]}>
        <CategoryIcon icon={cat.icon} color={barColor} size={18} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={cr.nameRow}>
          <Text style={cr.name} numberOfLines={1}>{cat.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[cr.amounts, cat.status === 'over' && { color: C.red }]}>
              {formatCurrency(cat.currentSpend)}
            </Text>
            <Text style={cr.limit}>/ {formatCurrency(cat.avgMonthly)}</Text>
          </View>
        </View>
        <View style={cr.track}>
          <View style={[cr.fill, { width: `${fillPct}%` as any, backgroundColor: barColor }]} />
        </View>
        <View style={cr.bottomRow}>
          <View style={[cr.statusPill, { backgroundColor: barColor + '14', borderColor: barColor + '40' }]}>
            <Text style={[cr.statusText, { color: barColor }]}>
              {cat.status === 'over' ? 'Excedido' : cat.status === 'warning' ? 'Atención' : 'En límite'}
              {' '}{Math.round(cat.pct * 100)}%
            </Text>
          </View>
          <Text style={cr.proj}>Proyectado: {formatCurrency(cat.projected)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.muted} />
    </TouchableOpacity>
  );
}

const cr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: C.card, borderRadius: 16, padding: spacing[4], ...shadow },
  iconBox:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:       { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text, flex: 1, marginRight: spacing[2] },
  amounts:    { fontFamily: 'Montserrat_700Bold', fontSize: 12, color: C.text },
  limit:      { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted },
  track:      { height: 6, backgroundColor: C.light, borderRadius: 3, overflow: 'hidden' },
  fill:       { height: '100%', borderRadius: 3 },
  bottomRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing[2], paddingVertical: 2 },
  statusText: { fontFamily: 'Montserrat_700Bold', fontSize: 10 },
  proj:       { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SavingsPlanScreen() {
  const { user }    = useAuthStore();
  const [plan,        setPlan]         = useState<BudgetPlan | null>(null);
  const [loading,     setLoading]      = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAll,     setShowAll]      = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const data = await fetchBudgetPlan(user.id);
    setPlan(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const handleCategoryPress = (cat: CategoryBudget) => {
    router.push({
      pathname: '/(app)/category-detail' as any,
      params: { categoryJson: JSON.stringify(cat) },
    });
  };

  const visibleCategories = showAll
    ? (plan?.categories ?? [])
    : (plan?.categories ?? []).slice(0, 5);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Plan Inteligente</Text>
        <TouchableOpacity style={st.backBtn}>
          <Ionicons name="information-circle-outline" size={20} color={C.sub} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={C.violet} />
          <Text style={st.loadingText}>Analizando tus hábitos...</Text>
        </View>
      ) : !plan ? (
        <View style={st.centered}>
          <Text style={{ fontSize: 48 }}>📊</Text>
          <Text style={st.emptyTitle}>Sin datos suficientes</Text>
          <Text style={st.emptySub}>Registrá gastos durante al menos un mes para ver tu plan.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={C.violet} />}
        >
          {/* Hero card */}
          <HeroCard plan={plan} />

          {/* Why section: excess categories */}
          <ExcessSummary plan={plan} onCategoryPress={handleCategoryPress} />

          {/* 3 stat mini-cards */}
          <View style={st.statsRow}>
            <StatCard
              label="Gastaste"
              value={formatCurrency(plan.totalCurrentSpend)}
              sub={`${Math.round((plan.totalCurrentSpend / (plan.totalAvg || 1)) * 100)}% del prom.`}
              accent={plan.totalCurrentSpend > plan.totalAvg ? C.red : C.text}
            />
            <StatCard
              label={'Promedio\núltimos 3 meses'}
              value={formatCurrency(plan.totalAvg)}
            />
            <StatCard
              label={'Disponible para\nahorrar'}
              value={formatCurrency(plan.potentialSavings)}
              accent={C.green}
            />
          </View>

          {/* Category list */}
          <View style={st.sectionRow}>
            <Text style={st.sectionTitle}>Límites sugeridos por categoría</Text>
          </View>

          {visibleCategories.map(cat => (
            <CategoryRow key={cat.categoryId} cat={cat} onPress={() => handleCategoryPress(cat)} />
          ))}

          {!showAll && plan.categories.length > 5 && (
            <TouchableOpacity style={st.showAllBtn} onPress={() => setShowAll(true)} activeOpacity={0.8}>
              <Text style={st.showAllText}>Mostrar todas ({plan.categories.length})</Text>
              <Ionicons name="chevron-down" size={14} color={C.blue} />
            </TouchableOpacity>
          )}

          {/* Oportunidades CTA */}
          <TouchableOpacity
            style={st.opportunitiesBtn}
            onPress={() => router.push('/(app)/savings-opportunities' as any)}
            activeOpacity={0.85}
          >
            <View style={st.opportunitiesBtnIcon}>
              <Ionicons name="trending-down-outline" size={18} color={C.green} />
            </View>
            <Text style={st.opportunitiesBtnText}>Ver oportunidades de ahorro</Text>
            <Ionicons name="chevron-forward" size={14} color={C.green} />
          </TouchableOpacity>

          {/* Meta sugerida CTA */}
          {plan.potentialSavings > 500 && (
            <TouchableOpacity
              style={st.goalCta}
              onPress={() => router.push('/(app)/savings-goal' as any)}
              activeOpacity={0.85}
            >
              <View style={st.goalCtaIcon}>
                <Ionicons name="flag-outline" size={20} color={C.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.goalCtaTitle}>Crear meta automática</Text>
                <Text style={st.goalCtaSub}>Ahorrá {formatCurrency(plan.potentialSavings)} este mes</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.blue} />
            </TouchableOpacity>
          )}

          <Text style={st.footnote}>
            Basado en tus últimos 3 meses de gastos. Proyección estimada al día de hoy.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:                { flex: 1, backgroundColor: C.bg },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPadding, paddingTop: spacing[2], paddingBottom: spacing[4] },
  headerTitle:         { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: C.text },
  backBtn:             { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  centered:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingHorizontal: layout.screenPadding },
  loadingText:         { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.sub, marginTop: spacing[3] },
  emptyTitle:          { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text, textAlign: 'center' },
  emptySub:            { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20 },
  scroll:              { paddingHorizontal: layout.screenPadding, paddingBottom: layout.tabBarHeight + spacing[6], gap: spacing[4] },
  statsRow:            { flexDirection: 'row', gap: spacing[3] },
  sectionRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[2] },
  sectionTitle:        { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text },
  showAllBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: C.blue + '0D', borderWidth: 1, borderColor: C.blue + '30', borderRadius: 14, padding: spacing[4] },
  showAllText:         { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.blue },
  opportunitiesBtn:    { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: C.green + '0D', borderWidth: 1, borderColor: C.green + '30', borderRadius: 16, padding: spacing[4] },
  opportunitiesBtnIcon:{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.green + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  opportunitiesBtnText:{ flex: 1, fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.green },
  goalCta:             { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: C.card, borderWidth: 1.5, borderColor: C.blue + '30', borderRadius: 18, padding: spacing[4], ...shadow },
  goalCtaIcon:         { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  goalCtaTitle:        { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text, marginBottom: 2 },
  goalCtaSub:          { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.sub },
  footnote:            { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 16, paddingHorizontal: spacing[4] },
});
