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

// ─── Alert types ──────────────────────────────────────────────────────────────

type AlertType = 'danger' | 'warning' | 'success' | 'tip';

interface SmartAlert {
  id:     string;
  type:   AlertType;
  icon:   keyof typeof Ionicons.glyphMap;
  title:  string;
  detail: string;
  time:   string;
  action?: () => void;
}

const ALERT_COLORS: Record<AlertType, { bg: string; border: string; icon: string }> = {
  danger:  { bg: C.red    + '0E', border: C.red    + '35', icon: C.red    },
  warning: { bg: C.amber  + '0E', border: C.amber  + '35', icon: C.amber  },
  success: { bg: C.green  + '0E', border: C.green  + '35', icon: C.green  },
  tip:     { bg: C.violet + '0E', border: C.violet + '35', icon: C.violet },
};

// ─── Generate alerts from budget plan ────────────────────────────────────────

function buildAlerts(plan: BudgetPlan, onCategoryPress: (cat: CategoryBudget) => void): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // Over-budget (danger)
  plan.categories
    .filter(c => c.status === 'over')
    .slice(0, 2)
    .forEach(c => {
      const excess = Math.max(c.projected - c.avgMonthly, 0);
      alerts.push({
        id:     `over-${c.categoryId}`,
        type:   'danger',
        icon:   'warning',
        title:  `Ya superaste tu promedio en ${c.name}`,
        detail: `Gastaste ${formatCurrency(c.currentSpend)} y tu promedio mensual es ${formatCurrency(c.avgMonthly)}. Podrías reducir hasta ${formatCurrency(excess)}.`,
        time:   'Ahora',
        action: () => onCategoryPress(c),
      });
    });

  // Warning (amber)
  plan.categories
    .filter(c => c.status === 'warning')
    .slice(0, 2)
    .forEach(c => {
      alerts.push({
        id:     `warn-${c.categoryId}`,
        type:   'warning',
        icon:   'alert-circle',
        title:  `Estás por llegar al límite en ${c.name}`,
        detail: `Llevás gastado el ${Math.round(c.pct * 100)}% de tu promedio mensual. Faltan ${formatCurrency(c.avgMonthly - c.currentSpend)} para superarlo.`,
        time:   'Hace 1d',
        action: () => onCategoryPress(c),
      });
    });

  // Positive / on track (success)
  plan.categories
    .filter(c => c.status === 'ok' && c.pct < 0.65 && c.avgMonthly > 0)
    .slice(0, 2)
    .forEach(c => {
      const saving = c.avgMonthly - c.currentSpend;
      alerts.push({
        id:     `ok-${c.categoryId}`,
        type:   'success',
        icon:   'checkmark-circle',
        title:  `Vas por debajo de tu promedio en ${c.name}`,
        detail: `En ${c.name} llevás ${formatCurrency(saving)} menos que lo habitual. ¡Bien!`,
        time:   'Hace 1d',
        action: () => onCategoryPress(c),
      });
    });

  // Savings tip (violet)
  if (plan.potentialSavings > 0) {
    alerts.push({
      id:     'tip-savings',
      type:   'tip',
      icon:   'bulb',
      title:  `Si seguís así podrías ahorrar ${formatCurrency(plan.potentialSavings)}`,
      detail: `Mantené tu ritmo actual de gastos para llegar a esta meta a fin de mes.`,
      time:   'Ahora',
      action: () => router.push('/(app)/savings-goal' as any),
    });
  }

  // Sort: danger → warning → success → tip
  const order: Record<AlertType, number> = { danger: 0, warning: 1, success: 2, tip: 3 };
  return alerts.sort((a, b) => order[a.type] - order[b.type]);
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: SmartAlert }) {
  const theme = ALERT_COLORS[alert.type];

  return (
    <TouchableOpacity
      style={[ac.card, { backgroundColor: theme.bg, borderColor: theme.border }]}
      onPress={alert.action}
      activeOpacity={alert.action ? 0.8 : 1}
    >
      <View style={[ac.iconBox, { backgroundColor: theme.icon + '18' }]}>
        <Ionicons name={alert.icon} size={20} color={theme.icon} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={ac.title}>{alert.title}</Text>
        <Text style={ac.detail}>{alert.detail}</Text>
        <Text style={ac.time}>{alert.time}</Text>
      </View>
      {alert.action && (
        <Ionicons name="chevron-forward" size={14} color={theme.icon} style={{ marginTop: 2 }} />
      )}
    </TouchableOpacity>
  );
}

const ac = StyleSheet.create({
  card:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], borderWidth: 1, borderRadius: 18, padding: spacing[4] },
  iconBox:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  title:  { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.text, lineHeight: 18 },
  detail: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.sub, lineHeight: 18 },
  time:   { fontFamily: 'Montserrat_500Medium', fontSize: 10, color: C.muted },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing[10], gap: spacing[3] }}>
      <Text style={{ fontSize: 52 }}>✅</Text>
      <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text }}>
        Todo en orden
      </Text>
      <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing[6] }}>
        No hay alertas por ahora. Tus gastos están dentro de los parámetros normales.
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SmartAlertsScreen() {
  const { user } = useAuthStore();
  const [plan,        setPlan]         = useState<BudgetPlan | null>(null);
  const [loading,     setLoading]      = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const alerts = plan ? buildAlerts(plan, handleCategoryPress) : [];
  const dangerCount  = alerts.filter(a => a.type === 'danger').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Alertas inteligentes</Text>
        </View>
        {(dangerCount + warningCount) > 0 && (
          <View style={st.badge}>
            <Text style={st.badgeText}>{dangerCount + warningCount}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={C.red} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={C.red} />}
        >
          {/* Sub-header */}
          <View style={st.subHeader}>
            <Ionicons name="notifications-outline" size={18} color={C.sub} />
            <Text style={st.subHeaderText}>
              Te avisamos a tiempo para que puedas tomar mejores decisiones.
            </Text>
          </View>

          {alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Danger / Warning */}
              {alerts.filter(a => a.type === 'danger' || a.type === 'warning').length > 0 && (
                <>
                  <View style={st.sectionRow}>
                    <Text style={st.sectionTitle}>Requieren atención</Text>
                    <View style={st.redPill}>
                      <Text style={st.redPillText}>{dangerCount + warningCount}</Text>
                    </View>
                  </View>
                  {alerts
                    .filter(a => a.type === 'danger' || a.type === 'warning')
                    .map(a => <AlertCard key={a.id} alert={a} />)}
                </>
              )}

              {/* Positive */}
              {alerts.filter(a => a.type === 'success').length > 0 && (
                <>
                  <View style={st.sectionRow}>
                    <Text style={st.sectionTitle}>Positivos</Text>
                  </View>
                  {alerts
                    .filter(a => a.type === 'success')
                    .map(a => <AlertCard key={a.id} alert={a} />)}
                </>
              )}

              {/* Tips */}
              {alerts.filter(a => a.type === 'tip').length > 0 && (
                <>
                  <View style={st.sectionRow}>
                    <Text style={st.sectionTitle}>Tips</Text>
                  </View>
                  {alerts
                    .filter(a => a.type === 'tip')
                    .map(a => <AlertCard key={a.id} alert={a} />)}
                </>
              )}
            </>
          )}

          {/* CTA to plan */}
          {alerts.length > 0 && (
            <TouchableOpacity
              style={st.planBtn}
              onPress={() => router.push('/(app)/savings-plan' as any)}
              activeOpacity={0.85}
            >
              <View style={st.planBtnIcon}>
                <Ionicons name="analytics-outline" size={20} color={C.violet} />
              </View>
              <Text style={st.planBtnText}>Ver plan inteligente completo</Text>
              <Ionicons name="arrow-forward" size={14} color={C.violet} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: layout.screenPadding, paddingTop: spacing[2], paddingBottom: spacing[3] },
  headerTitle:  { fontFamily: 'Montserrat_700Bold', fontSize: 20, color: C.text },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  badge:        { width: 24, height: 24, borderRadius: 12, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontFamily: 'Montserrat_700Bold', fontSize: 11, color: '#FFF' },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:       { paddingHorizontal: layout.screenPadding, paddingBottom: layout.tabBarHeight + spacing[6], gap: spacing[4] },
  subHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  subHeaderText:{ flex: 1, fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.sub, lineHeight: 20 },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  sectionTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text },
  redPill:      { width: 22, height: 22, borderRadius: 11, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  redPillText:  { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: '#FFF' },
  planBtn:      { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: C.violet + '10', borderWidth: 1, borderColor: C.violet + '30', borderRadius: 16, padding: spacing[4] },
  planBtnIcon:  { width: 38, height: 38, borderRadius: 19, backgroundColor: C.violet + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planBtnText:  { flex: 1, fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.violet },
});
