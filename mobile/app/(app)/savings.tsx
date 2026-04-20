import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import Svg, { Circle, Path, Rect, Ellipse } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, layout } from '@/theme';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/store/authStore';
import {
  useSavingsStore,
  type Saving,
  type Investment,
  type InstrumentType,
  type SavingCurrency,
} from '@/store/savingsStore';
import { useGoalsStore, type SavingsGoal } from '@/store/goalsStore';
import { fetchDolarRateNow } from '@/hooks/useDolarRates';
import { formatCurrency } from '@/utils/format';

// ─── Empty State ──────────────────────────────────────────────────────────────

function SavingsEmptyIllustration() {
  return (
    <Svg width={160} height={140} viewBox="0 0 160 140">
      <Circle cx="80" cy="75" r="60" fill={colors.primary + '12'} />
      <Ellipse cx="80" cy="82" rx="38" ry="32" fill={colors.primary + '30'} />
      <Ellipse cx="80" cy="82" rx="38" ry="32" fill="none" stroke={colors.primary} strokeWidth="2" />
      <Ellipse cx="112" cy="86" rx="10" ry="8" fill={colors.primary + '40'} stroke={colors.primary} strokeWidth="1.5" />
      <Circle cx="97" cy="74" r="3" fill={colors.primary} />
      <Ellipse cx="62" cy="56" rx="8" ry="10" fill={colors.primary + '40'} stroke={colors.primary} strokeWidth="1.5" />
      <Rect x="70" y="52" width="20" height="4" rx="2" fill={colors.primary} />
      <Rect x="60" y="110" width="10" height="14" rx="5" fill={colors.primary + '50'} />
      <Rect x="76" y="112" width="10" height="12" rx="5" fill={colors.primary + '50'} />
      <Rect x="92" y="110" width="10" height="14" rx="5" fill={colors.primary + '50'} />
      <Circle cx="36" cy="44" r="10" fill={colors.yellow + '60'} />
      <Circle cx="36" cy="44" r="10" fill="none" stroke={colors.yellow} strokeWidth="1.5" />
      <Path d="M33 44 Q36 40 39 44 Q36 48 33 44Z" fill={colors.yellow} />
      <Circle cx="128" cy="38" r="8" fill={colors.yellow + '60'} />
      <Circle cx="128" cy="38" r="8" fill="none" stroke={colors.yellow} strokeWidth="1.5" />
      <Path d="M125.5 38 Q128 34.5 130.5 38 Q128 41.5 125.5 38Z" fill={colors.yellow} />
      <Circle cx="50" cy="24" r="6" fill={colors.yellow + '40'} />
    </Svg>
  );
}

function SavingsEmptyState({ onAddCash, onAddInvestment, onAddGoal }: { onAddCash: () => void; onAddInvestment: () => void; onAddGoal: () => void }) {
  return (
    <View style={emptyStyles.container}>
      <SavingsEmptyIllustration />
      <View style={emptyStyles.textBlock}>
        <Text variant="subtitle" color={colors.text.primary} align="center">Tu capital hoy es $0</Text>
        <Text variant="body" color={colors.text.secondary} align="center" style={{ lineHeight: 22 }}>
          Cada peso que registres acá empieza a trabajar para vos.
        </Text>
      </View>
      <View style={emptyStyles.buttons}>
        <TouchableOpacity style={[emptyStyles.btn, { backgroundColor: colors.neon }]} onPress={onAddGoal} activeOpacity={0.85}>
          <Text style={{ fontSize: 18 }}>🎯</Text>
          <Text style={[emptyStyles.btnText, { color: colors.bg.primary }]}>Crear meta de ahorro</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[emptyStyles.btn, { backgroundColor: colors.primary }]} onPress={onAddCash} activeOpacity={0.85}>
          <Ionicons name="cash-outline" size={18} color={colors.white} />
          <Text style={emptyStyles.btnText}>Agregar efectivo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[emptyStyles.btn, { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default }]} onPress={onAddInvestment} activeOpacity={0.85}>
          <Ionicons name="trending-up-outline" size={18} color={colors.primary} />
          <Text style={[emptyStyles.btnText, { color: colors.primary }]}>Agregar inversión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing[5], paddingVertical: spacing[6] },
  textBlock:  { gap: spacing[2], paddingHorizontal: spacing[4] },
  buttons:    { gap: spacing[3], width: '100%' },
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: 12, paddingVertical: spacing[4] },
  btnText:    { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: colors.white },
});

// ─── Config ───────────────────────────────────────────────────────────────────

const INSTRUMENT_CONFIG: Record<InstrumentType, { label: string; icon: string; color: string }> = {
  fci:        { label: 'FCI Money Market', icon: 'trending-up-outline',  color: colors.neon    },
  cedear:     { label: 'Cedears',          icon: 'business-outline',      color: colors.primary },
  plazo_fijo: { label: 'Plazo Fijo UVA',   icon: 'timer-outline',         color: colors.yellow  },
  crypto:     { label: 'Criptomonedas',    icon: 'cube-outline',          color: '#F7931A'      },
  bonds:      { label: 'Bonos / Letras',   icon: 'document-text-outline', color: '#A78BFA'      },
  acciones:   { label: 'Acciones',         icon: 'stats-chart-outline',   color: '#22D3EE'      },
  other:      { label: 'Otro',             icon: 'wallet-outline',        color: colors.text.secondary },
};

const INSTRUMENT_TYPES = Object.keys(INSTRUMENT_CONFIG) as InstrumentType[];

const GOAL_EMOJIS = ['🎯', '🏖️', '🚗', '🏠', '✈️', '📱', '👶', '💍', '🎓', '💪', '🐕', '🌱', '💻', '🎸', '🏋️', '🍕'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcEstimatedGain(inv: Investment): number | null {
  if (!inv.annual_return || !inv.start_date) return null;
  const start  = new Date(inv.start_date);
  const now    = new Date();
  const months = Math.max(
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()), 0,
  );
  if (months === 0) return null;
  const monthly = Math.pow(1 + inv.annual_return / 100, 1 / 12) - 1;
  return Math.round(inv.amount * (Math.pow(1 + monthly, months) - 1));
}

function buildInsights(totalARS: number, totalUSDInARS: number, totalInvested: number, investments: Investment[]): string[] {
  const total = totalARS + totalUSDInARS + totalInvested;
  if (total === 0) return ['Cargá tus ahorros e inversiones para ver cómo está tu capital.'];
  const insights: string[] = [];
  const cashPct     = total > 0 ? ((totalARS + totalUSDInARS) / total) * 100 : 0;
  const usdPct      = total > 0 ? (totalUSDInARS / total) * 100 : 0;
  const investedPct = total > 0 ? (totalInvested / total) * 100 : 0;
  if (cashPct > 60) insights.push(`El ${Math.round(cashPct)}% de tu capital está sin invertir — esos pesos pierden valor contra la inflación.`);
  if (usdPct < 15 && total > 100000) insights.push('Poca dolarización: tu cartera es vulnerable a la inflación en pesos.');
  if (investments.length === 0) insights.push('No tenés inversiones registradas. Empezar con FCI Money Market es lo más simple.');
  else {
    const types = new Set(investments.map(i => i.instrument_type));
    if (types.size === 1 && types.has('fci')) insights.push('Tu cartera es conservadora — todo en FCI. Podrías sumar Cedears para más rendimiento.');
    if (investedPct > 80) insights.push(`Buen nivel de inversión (${Math.round(investedPct)}%). Mantené siempre algo líquido para emergencias.`);
  }
  return insights.slice(0, 2);
}

// ─── TotalCapitalCard ─────────────────────────────────────────────────────────

function TotalCapitalCard({ totalARS, totalUSDInARS, totalInvested, totalGain, usdRate }: {
  totalARS: number; totalUSDInARS: number; totalInvested: number; totalGain: number; usdRate: number | null;
}) {
  const total = totalARS + totalUSDInARS + totalInvested;
  const arsW  = total > 0 ? (totalARS / total) * 100 : 0;
  const usdW  = total > 0 ? (totalUSDInARS / total) * 100 : 0;
  const invW  = total > 0 ? (totalInvested / total) * 100 : 0;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        <Text variant="label" color={colors.text.tertiary}>CAPITAL TOTAL</Text>
        {totalGain > 0 && (
          <View style={cardStyles.gainBadge}>
            <Ionicons name="trending-up-outline" size={11} color={colors.neon} />
            <Text style={cardStyles.gainText}>+{formatCurrency(totalGain)} ganados</Text>
          </View>
        )}
      </View>
      <Text style={cardStyles.total}>{formatCurrency(total)}</Text>

      {total > 0 && (
        <View style={cardStyles.stackBar}>
          {arsW > 0 && <View style={[cardStyles.stackSlice, { flex: arsW, backgroundColor: colors.neon }]} />}
          {usdW > 0 && <View style={[cardStyles.stackSlice, { flex: usdW, backgroundColor: colors.primary }]} />}
          {invW > 0 && <View style={[cardStyles.stackSlice, { flex: invW, backgroundColor: '#A78BFA' }]} />}
        </View>
      )}

      <View style={cardStyles.legend}>
        <View style={cardStyles.legendItem}>
          <View style={[cardStyles.legendDot, { backgroundColor: colors.neon }]} />
          <View>
            <Text variant="caption" color={colors.text.tertiary}>Pesos</Text>
            <Text variant="labelMd" color={colors.text.primary}>{formatCurrency(totalARS)}</Text>
          </View>
        </View>
        <View style={cardStyles.legendDivider} />
        <View style={cardStyles.legendItem}>
          <View style={[cardStyles.legendDot, { backgroundColor: colors.primary }]} />
          <View>
            <Text variant="caption" color={colors.text.tertiary}>USD{usdRate ? ` · $${usdRate.toLocaleString('es-AR')}` : ''}</Text>
            <Text variant="labelMd" color={colors.text.primary}>{formatCurrency(totalUSDInARS)}</Text>
          </View>
        </View>
        <View style={cardStyles.legendDivider} />
        <View style={cardStyles.legendItem}>
          <View style={[cardStyles.legendDot, { backgroundColor: '#A78BFA' }]} />
          <View>
            <Text variant="caption" color={colors.text.tertiary}>Invertido</Text>
            <Text variant="labelMd" color={colors.text.primary}>{formatCurrency(totalInvested)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card:       { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, borderRadius: 20, padding: spacing[5], gap: spacing[4] },
  topRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gainBadge:  { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.neon + '15', borderRadius: 20, paddingHorizontal: spacing[2], paddingVertical: 3 },
  gainText:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 10, color: colors.neon },
  total:      { fontFamily: 'Montserrat_700Bold', fontSize: 34, color: colors.text.primary, lineHeight: 44 },
  stackBar:   { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border.subtle, gap: 2 },
  stackSlice: { borderRadius: 4 },
  legend:     { flexDirection: 'row', alignItems: 'center' },
  legendItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendDivider: { width: 1, height: 32, backgroundColor: colors.border.subtle, marginHorizontal: spacing[2] },
});

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onEdit, onDelete, onAportar }: {
  goal: SavingsGoal; onEdit: (g: SavingsGoal) => void; onDelete: (id: string) => void; onAportar: (g: SavingsGoal) => void;
}) {
  const pct  = goal.target_amount > 0 ? Math.min(goal.current_amount / goal.target_amount, 1) : 0;
  const done = pct >= 1;
  const daysLeft = goal.deadline
    ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000)
    : null;
  const accentColor = done ? colors.neon
    : pct >= 0.7 ? colors.primary
    : pct >= 0.4 ? colors.yellow
    : '#FF6D00';

  return (
    <TouchableOpacity style={goalStyles.card} onPress={() => onEdit(goal)} activeOpacity={0.85}>
      {/* Barra de acento izquierda */}
      <View style={[goalStyles.leftBar, { backgroundColor: accentColor }]} />

      <View style={goalStyles.inner}>
        {/* Fila superior: emoji + título + % + trash */}
        <View style={goalStyles.topRow}>
          <Text style={goalStyles.emoji}>{goal.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }} numberOfLines={1}>
              {goal.title}
            </Text>
            {daysLeft !== null && (
              <Text variant="caption" color={colors.text.tertiary}>
                {daysLeft > 0 ? `${daysLeft} días restantes` : daysLeft === 0 ? 'Vence hoy' : 'Vencida'}
              </Text>
            )}
          </View>
          <Text style={[goalStyles.pctText, { color: accentColor }]}>
            {Math.round(pct * 100)}%
          </Text>
          <TouchableOpacity onPress={() => onDelete(goal.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={15} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Barra de progreso gruesa */}
        <View style={goalStyles.progressTrack}>
          <View style={[goalStyles.progressFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: accentColor }]} />
        </View>

        {/* Footer: montos + botón aportar */}
        <View style={goalStyles.footer}>
          <View style={{ gap: 1 }}>
            <Text variant="labelMd" color={colors.text.primary}>{formatCurrency(goal.current_amount)}</Text>
            <Text variant="caption" color={colors.text.tertiary}>de {formatCurrency(goal.target_amount)}</Text>
          </View>
          {done ? (
            <View style={goalStyles.doneBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.neon} />
              <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 11, color: colors.neon }}>CUMPLIDA</Text>
            </View>
          ) : (
            <TouchableOpacity style={[goalStyles.aportarBtn, { backgroundColor: accentColor }]} onPress={() => onAportar(goal)} activeOpacity={0.8}>
              <Ionicons name="add" size={14} color={colors.bg.primary} />
              <Text style={goalStyles.aportarText}>Aportar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const goalStyles = StyleSheet.create({
  card:         { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 16, overflow: 'hidden', flexDirection: 'row' },
  leftBar:      { width: 4, alignSelf: 'stretch' },
  inner:        { flex: 1, padding: spacing[4], gap: spacing[3] },
  topRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  emoji:        { fontSize: 26, lineHeight: 32 },
  pctText:      { fontFamily: 'Montserrat_800ExtraBold', fontSize: 22, lineHeight: 28 },
  doneBadge:    { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.neon + '15', borderRadius: 20, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  progressTrack: { height: 10, backgroundColor: colors.border.subtle, borderRadius: 5, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 5 },
  footer:       { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  aportarBtn:   { flexDirection: 'row', alignItems: 'center', gap: spacing[1], borderRadius: 20, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  aportarText:  { fontFamily: 'Montserrat_700Bold', fontSize: 12, color: colors.bg.primary },
});

// ─── SavingCard ───────────────────────────────────────────────────────────────

function SavingCard({ saving, usdRate, onEdit, onDelete }: {
  saving: Saving; usdRate: number | null; onEdit: (s: Saving) => void; onDelete: (id: string) => void;
}) {
  const arsValue = saving.currency === 'USD' && usdRate ? saving.amount * usdRate : saving.amount;
  const color    = saving.currency === 'USD' ? colors.primary : colors.neon;

  return (
    <TouchableOpacity style={savingCardStyles.card} onPress={() => onEdit(saving)} activeOpacity={0.75}>
      <View style={[savingCardStyles.leftBar, { backgroundColor: color }]} />
      <View style={[savingCardStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={saving.currency === 'USD' ? 'card-outline' : 'cash-outline'} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodySmall" color={colors.text.primary} numberOfLines={1}>{saving.label}</Text>
        <Text variant="caption" color={colors.text.tertiary}>
          {saving.currency === 'USD'
            ? `${saving.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} USD`
            : 'Pesos ARS'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={savingCardStyles.amount}>{formatCurrency(arsValue)}</Text>
        {saving.currency === 'USD' && !usdRate && (
          <Text variant="caption" color={colors.text.tertiary}>sin cotiz.</Text>
        )}
      </View>
      <TouchableOpacity onPress={() => onDelete(saving.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="trash-outline" size={15} color={colors.text.tertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const savingCardStyles = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 14, overflow: 'hidden' },
  leftBar: { width: 4, alignSelf: 'stretch' },
  iconBox: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: spacing[3], marginVertical: spacing[4] },
  amount:  { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: colors.text.primary },
});

// ─── InvestmentCard ───────────────────────────────────────────────────────────

function InvestmentCard({ inv, usdRate, onEdit, onDelete }: {
  inv: Investment; usdRate: number | null; onEdit: (i: Investment) => void; onDelete: (id: string) => void;
}) {
  const cfg      = INSTRUMENT_CONFIG[inv.instrument_type];
  const arsValue = inv.currency === 'USD' && usdRate ? inv.amount * usdRate : inv.amount;
  const gain     = calcEstimatedGain(inv);

  return (
    <TouchableOpacity style={invStyles.card} onPress={() => onEdit(inv)} activeOpacity={0.8}>
      <View style={[invStyles.leftBar, { backgroundColor: cfg.color }]} />
      <View style={[invStyles.iconBox, { backgroundColor: cfg.color + '18' }]}>
        <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodySmall" color={colors.text.primary} numberOfLines={1}>{inv.name}</Text>
        <View style={invStyles.tagRow}>
          <View style={[invStyles.tag, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '40' }]}>
            <Text style={[invStyles.tagText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {inv.annual_return != null && (
            <Text variant="caption" color={colors.text.tertiary}>{inv.annual_return}% anual</Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={invStyles.amount}>{formatCurrency(arsValue)}</Text>
        {gain != null && gain > 0 && (
          <View style={invStyles.gainPill}>
            <Text style={invStyles.gainText}>+{formatCurrency(gain)}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={() => onDelete(inv.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingRight: spacing[4] }}>
        <Ionicons name="trash-outline" size={15} color={colors.text.tertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const invStyles = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 14, overflow: 'hidden' },
  leftBar:  { width: 4, alignSelf: 'stretch' },
  iconBox:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: spacing[3], marginVertical: spacing[4] },
  tagRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  tag:      { borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing[2], paddingVertical: 2 },
  tagText:  { fontFamily: 'Montserrat_600SemiBold', fontSize: 10 },
  amount:   { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: colors.text.primary },
  gainPill: { backgroundColor: colors.neon + '18', borderRadius: 20, paddingHorizontal: spacing[2], paddingVertical: 2 },
  gainText: { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: colors.neon },
});

// ─── AddGoalModal ─────────────────────────────────────────────────────────────

function AddGoalModal({ visible, initial, onClose, onSave }: {
  visible: boolean; initial: Partial<SavingsGoal> | null;
  onClose: () => void; onSave: (data: Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
}) {
  const [title,        setTitle]        = useState('');
  const [emoji,        setEmoji]        = useState('🎯');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline,     setDeadline]     = useState('');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setEmoji(initial?.emoji ?? '🎯');
      setTargetAmount(initial?.target_amount?.toString() ?? '');
      setDeadline(initial?.deadline ?? '');
    }
  }, [visible, initial]);

  const handleSave = async () => {
    const amt = parseFloat(targetAmount.replace(',', '.'));
    if (!title.trim()) { Alert.alert('', 'Ingresá un nombre para la meta.'); return; }
    if (isNaN(amt) || amt <= 0) { Alert.alert('', 'Ingresá un monto objetivo.'); return; }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), emoji, target_amount: amt, current_amount: initial?.current_amount ?? 0, deadline: deadline || null });
      onClose();
    } catch {
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text variant="subtitle">{initial?.id ? 'Editar meta' : 'Nueva meta'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
            <Text variant="label" color={colors.text.secondary}>EMOJI</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {GOAL_EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[goalModalStyles.emojiBtn, emoji === e && goalModalStyles.emojiBtnActive]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text variant="label" color={colors.text.secondary}>NOMBRE DE LA META</Text>
            <TextInput
              style={modalStyles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ej: Vacaciones, Auto, Emergencias..."
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="sentences"
              maxLength={60}
            />

            <Text variant="label" color={colors.text.secondary}>MONTO OBJETIVO (ARS)</Text>
            <TextInput
              style={modalStyles.input}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="1000000"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="decimal-pad"
            />

            <Text variant="label" color={colors.text.secondary}>
              FECHA LÍMITE{'  '}
              <Text variant="caption" color={colors.text.tertiary}>(YYYY-MM-DD, opcional)</Text>
            </Text>
            <TextInput
              style={modalStyles.input}
              value={deadline}
              onChangeText={setDeadline}
              placeholder="2025-12-31"
              placeholderTextColor={colors.text.tertiary}
            />

            <TouchableOpacity style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.bg.primary} /> : <Text style={modalStyles.saveBtnText}>Guardar meta</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const goalModalStyles = StyleSheet.create({
  emojiBtn:       { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.card },
  emojiBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
});

// ─── AportarModal ─────────────────────────────────────────────────────────────

function AportarModal({ goal, onClose, onSave }: {
  goal: SavingsGoal | null; onClose: () => void; onSave: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (goal) setAmount(''); }, [goal]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) { Alert.alert('', 'Ingresá un monto válido.'); return; }
    setSaving(true);
    try {
      await onSave(amt);
      onClose();
    } catch {
      Alert.alert('Error', 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!goal) return null;
  const remaining = goal.target_amount - goal.current_amount;

  return (
    <Modal visible={!!goal} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <View style={{ gap: 2 }}>
              <Text variant="subtitle">Aportar a meta</Text>
              <Text variant="caption" color={colors.text.tertiary}>
                {goal.emoji} {goal.title} · faltan {formatCurrency(remaining)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: spacing[5], gap: spacing[4] }}>
            <View style={aportarStyles.amountBox}>
              <Text style={aportarStyles.prefix}>$</Text>
              <TextInput
                style={aportarStyles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <TouchableOpacity style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.bg.primary} /> : <Text style={modalStyles.saveBtnText}>Aportar</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const aportarStyles = StyleSheet.create({
  amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, borderRadius: 16, padding: spacing[5] },
  prefix:    { fontFamily: 'Montserrat_700Bold', fontSize: 32, color: colors.text.tertiary },
  input:     { fontFamily: 'Montserrat_700Bold', fontSize: 40, color: colors.text.primary, minWidth: 80, textAlign: 'center' },
});

// ─── AddSavingModal ───────────────────────────────────────────────────────────

function AddSavingModal({ visible, initial, onClose, onSave }: {
  visible: boolean; initial: Partial<Saving> | null; onClose: () => void;
  onSave: (data: Omit<Saving, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const [label,    setLabel]    = useState('');
  const [amount,   setAmount]   = useState('');
  const [currency, setCurrency] = useState<SavingCurrency>('ARS');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (visible) {
      setLabel(initial?.label ?? '');
      setAmount(initial?.amount?.toString() ?? '');
      setCurrency(initial?.currency ?? 'ARS');
    }
  }, [visible, initial]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!label.trim()) { Alert.alert('', 'Ingresá una descripción.'); return; }
    if (isNaN(amt) || amt <= 0) { Alert.alert('', 'Ingresá un monto válido.'); return; }
    setSaving(true);
    try {
      await onSave({ label: label.trim(), amount: amt, currency, type: 'cash' });
      onClose();
    } catch {
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text variant="subtitle">{initial?.id ? 'Editar ahorro' : 'Agregar ahorro'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
            <Text variant="label" color={colors.text.secondary}>MONEDA</Text>
            <View style={modalStyles.segRow}>
              {(['ARS', 'USD'] as SavingCurrency[]).map(c => (
                <TouchableOpacity key={c} style={[modalStyles.seg, currency === c && modalStyles.segActive]} onPress={() => setCurrency(c)}>
                  <Text variant="label" style={{ color: currency === c ? colors.white : colors.text.secondary }}>
                    {c === 'ARS' ? '🇦🇷 Pesos' : '💵 Dólares'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text variant="label" color={colors.text.secondary}>DESCRIPCIÓN</Text>
            <TextInput
              style={modalStyles.input}
              value={label}
              onChangeText={setLabel}
              placeholder={currency === 'USD' ? 'Ej: Dólares billete...' : 'Ej: Cuenta bancaria, Efectivo...'}
              placeholderTextColor={colors.text.tertiary}
              maxLength={60}
            />
            <Text variant="label" color={colors.text.secondary}>MONTO ({currency})</Text>
            <TextInput
              style={modalStyles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder={currency === 'USD' ? '500' : '200000'}
              placeholderTextColor={colors.text.tertiary}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.bg.primary} /> : <Text style={modalStyles.saveBtnText}>Guardar</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── AddInvestmentModal ───────────────────────────────────────────────────────

function AddInvestmentModal({ visible, initial, onClose, onSave }: {
  visible: boolean; initial: Partial<Investment> | null; onClose: () => void;
  onSave: (data: Omit<Investment, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const [name,      setName]      = useState('');
  const [instrType, setInstrType] = useState<InstrumentType>('fci');
  const [amount,    setAmount]    = useState('');
  const [currency,  setCurrency]  = useState<SavingCurrency>('ARS');
  const [annReturn, setAnnReturn] = useState('');
  const [startDate, setStartDate] = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setInstrType(initial?.instrument_type ?? 'fci');
      setAmount(initial?.amount?.toString() ?? '');
      setCurrency(initial?.currency ?? 'ARS');
      setAnnReturn(initial?.annual_return?.toString() ?? '');
      setStartDate(initial?.start_date ?? '');
    }
  }, [visible, initial]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!name.trim()) { Alert.alert('', 'Ingresá un nombre.'); return; }
    if (isNaN(amt) || amt <= 0) { Alert.alert('', 'Ingresá un monto válido.'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), instrument_type: instrType, amount: amt, currency, annual_return: annReturn ? parseFloat(annReturn) : null, start_date: startDate || null, notes: null });
      onClose();
    } catch {
      Alert.alert('Error', 'No se pudo guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text variant="subtitle">{initial?.id ? 'Editar inversión' : 'Agregar inversión'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
            <Text variant="label" color={colors.text.secondary}>TIPO DE INSTRUMENTO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing[5] }}>
              <View style={{ flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[2] }}>
                {INSTRUMENT_TYPES.map(t => {
                  const cfg    = INSTRUMENT_CONFIG[t];
                  const active = instrType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setInstrType(t)}
                      style={[modalStyles.instrChip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                    >
                      <Ionicons name={cfg.icon as any} size={14} color={active ? colors.white : cfg.color} />
                      <Text style={[modalStyles.instrChipText, { color: active ? colors.white : colors.text.secondary }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <Text variant="label" color={colors.text.secondary}>MONEDA</Text>
            <View style={modalStyles.segRow}>
              {(['ARS', 'USD'] as SavingCurrency[]).map(c => (
                <TouchableOpacity key={c} style={[modalStyles.seg, currency === c && modalStyles.segActive]} onPress={() => setCurrency(c)}>
                  <Text variant="label" style={{ color: currency === c ? colors.white : colors.text.secondary }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text variant="label" color={colors.text.secondary}>NOMBRE / DESCRIPCIÓN</Text>
            <TextInput style={modalStyles.input} value={name} onChangeText={setName} placeholder={INSTRUMENT_CONFIG[instrType].label} placeholderTextColor={colors.text.tertiary} maxLength={80} />
            <Text variant="label" color={colors.text.secondary}>MONTO ({currency})</Text>
            <TextInput style={modalStyles.input} value={amount} onChangeText={setAmount} placeholder={currency === 'USD' ? '1000' : '500000'} placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" />
            <Text variant="label" color={colors.text.secondary}>
              RENDIMIENTO ANUAL %{'  '}
              <Text variant="caption" color={colors.text.tertiary}>(opcional)</Text>
            </Text>
            <TextInput style={modalStyles.input} value={annReturn} onChangeText={setAnnReturn} placeholder="Ej: 36" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" />
            <Text variant="label" color={colors.text.secondary}>
              FECHA DE INICIO{'  '}
              <Text variant="caption" color={colors.text.tertiary}>(YYYY-MM-DD, opcional)</Text>
            </Text>
            <TextInput style={modalStyles.input} value={startDate} onChangeText={setStartDate} placeholder={new Date().toISOString().split('T')[0]} placeholderTextColor={colors.text.tertiary} />
            <TouchableOpacity style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.bg.primary} /> : <Text style={modalStyles.saveBtnText}>Guardar</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  sheet:       { flex: 1, backgroundColor: colors.bg.primary },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: 'center', marginTop: spacing[3] },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing[5], paddingTop: spacing[3] },
  body:        { padding: spacing[5], gap: spacing[3], paddingBottom: spacing[10] },
  segRow:      { flexDirection: 'row', gap: spacing[2] },
  seg:         { flex: 1, paddingVertical: spacing[3], borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.card, alignItems: 'center' },
  segActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  input:       { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default, borderRadius: 10, paddingHorizontal: spacing[4], paddingVertical: spacing[4], color: colors.text.primary, fontFamily: 'Montserrat_400Regular', fontSize: 14 },
  instrChip:   { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: 20, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.card },
  instrChipText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 11 },
  saveBtn:     { marginTop: spacing[4], backgroundColor: colors.neon, borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: colors.bg.primary },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SavingsScreen() {
  const { user } = useAuthStore();
  const { savings, investments, isLoading: isSavingsLoading, fetchAll, addSaving, updateSaving, deleteSaving, addInvestment, updateInvestment, deleteInvestment } = useSavingsStore();
  const { goals, fetchGoals, addGoal, updateGoal, deleteGoal, addToGoal } = useGoalsStore();

  const [usdRate,          setUsdRate]          = useState<number | null>(null);
  const [showGoalModal,    setShowGoalModal]     = useState(false);
  const [showSavingModal,  setShowSavingModal]   = useState(false);
  const [showInvModal,     setShowInvModal]      = useState(false);
  const [editingGoal,      setEditingGoal]       = useState<Partial<SavingsGoal> | null>(null);
  const [editingSaving,    setEditingSaving]      = useState<Partial<Saving> | null>(null);
  const [editingInv,       setEditingInv]        = useState<Partial<Investment> | null>(null);
  const [aportarGoal,      setAportarGoal]       = useState<SavingsGoal | null>(null);
  const [isRefreshing,     setIsRefreshing]      = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    fetchAll(user.id);
    fetchGoals(user.id);
    try {
      const rate = await fetchDolarRateNow('blue');
      setUsdRate(rate);
    } catch { /* sin cotización */ }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalARS      = savings.filter(s => s.currency === 'ARS').reduce((s, v) => s + v.amount, 0);
  const totalUSDInARS = savings.filter(s => s.currency === 'USD').reduce((s, v) => s + (usdRate ? v.amount * usdRate : 0), 0);
  const totalInvested = investments.reduce((s, i) => s + (i.currency === 'USD' && usdRate ? i.amount * usdRate : i.amount), 0);
  const totalGain     = investments.reduce((s, i) => s + (calcEstimatedGain(i) ?? 0), 0);
  const hasData       = totalARS + totalUSDInARS + totalInvested > 0 || goals.length > 0;

  const insights     = buildInsights(totalARS, totalUSDInARS, totalInvested, investments);
  const advisorCtx   = [
    `Tengo un capital total de ${formatCurrency(totalARS + totalUSDInARS + totalInvested)}.`,
    `Distribución: ${formatCurrency(totalARS)} en pesos, ${formatCurrency(totalUSDInARS)} en dólares (en pesos), ${formatCurrency(totalInvested)} invertidos.`,
    investments.length > 0
      ? `Mis inversiones: ${investments.map(i => `${i.name} (${INSTRUMENT_CONFIG[i.instrument_type].label}) por ${formatCurrency(i.amount)}`).join(', ')}.`
      : 'No tengo inversiones registradas.',
    goals.length > 0
      ? `Mis metas de ahorro: ${goals.map(g => `"${g.title}" — ${formatCurrency(g.current_amount)} de ${formatCurrency(g.target_amount)}`).join(', ')}.`
      : '',
    '¿Cómo podría mejorar mi distribución de capital y rendimiento en Argentina hoy?',
  ].filter(Boolean).join(' ');

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAddGoal    = () => { setEditingGoal(null);    setShowGoalModal(true); };
  const openEditGoal   = (g: SavingsGoal) => { setEditingGoal(g); setShowGoalModal(true); };
  const openAddSaving  = () => { setEditingSaving(null);  setShowSavingModal(true); };
  const openEditSaving = (s: Saving) => { setEditingSaving(s); setShowSavingModal(true); };
  const openAddInv     = () => { setEditingInv(null);     setShowInvModal(true); };
  const openEditInv    = (i: Investment) => { setEditingInv(i); setShowInvModal(true); };

  const handleSaveGoal = async (data: Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>) => {
    if (!user?.id) return;
    if (editingGoal?.id) await updateGoal(editingGoal.id, data);
    else await addGoal(user.id, data);
  };

  const handleSaveSaving = async (data: Omit<Saving, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return;
    if (editingSaving?.id) await updateSaving(editingSaving.id, data);
    else await addSaving(user.id, data);
  };

  const handleSaveInv = async (data: Omit<Investment, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return;
    if (editingInv?.id) await updateInvestment(editingInv.id, data);
    else await addInvestment(user.id, data);
  };

  const confirmDeleteGoal    = (id: string) => Alert.alert('Eliminar meta', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => deleteGoal(id) }]);
  const confirmDeleteSaving  = (id: string) => Alert.alert('Eliminar ahorro', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => deleteSaving(id) }]);
  const confirmDeleteInv     = (id: string) => Alert.alert('Eliminar inversión', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => deleteInvestment(id) }]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text variant="h4">Mi Capital</Text>
            <Text variant="caption" color={colors.text.tertiary}>Ahorros, metas e inversiones</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── Empty State ──────────────────────────────────────────────────── */}
        {!hasData && !isSavingsLoading ? (
          <SavingsEmptyState onAddCash={openAddSaving} onAddInvestment={openAddInv} onAddGoal={openAddGoal} />
        ) : (<>

          {/* ── Capital total ────────────────────────────────────────────── */}
          {(totalARS + totalUSDInARS + totalInvested) > 0 && (
            <TotalCapitalCard
              totalARS={totalARS}
              totalUSDInARS={totalUSDInARS}
              totalInvested={totalInvested}
              totalGain={totalGain}
              usdRate={usdRate}
            />
          )}

          {/* ── Metas de ahorro ──────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text variant="label" color={colors.text.tertiary}>METAS DE AHORRO</Text>
            <TouchableOpacity onPress={openAddGoal} style={styles.addBtn}>
              <Ionicons name="add" size={15} color={colors.neon} />
              <Text variant="label" color={colors.neon}>Nueva meta</Text>
            </TouchableOpacity>
          </View>

          {goals.length === 0 ? (
            <TouchableOpacity style={styles.emptySection} onPress={openAddGoal} activeOpacity={0.8}>
              <View style={styles.emptySectionIcon}>
                <Text style={{ fontSize: 22 }}>🎯</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>Creá tu primera meta</Text>
                <Text variant="caption" color={colors.text.tertiary}>Vacaciones, auto, fondo de emergencia...</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          ) : (
            goals.map(g => (
              <GoalCard key={g.id} goal={g} onEdit={openEditGoal} onDelete={confirmDeleteGoal} onAportar={(goal) => setAportarGoal(goal)} />
            ))
          )}

          {/* ── Efectivo y reservas ──────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text variant="label" color={colors.text.tertiary}>EFECTIVO Y RESERVAS</Text>
            <TouchableOpacity onPress={openAddSaving} style={styles.addBtn}>
              <Ionicons name="add" size={15} color={colors.neon} />
              <Text variant="label" color={colors.neon}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {savings.length === 0 ? (
            <TouchableOpacity style={styles.emptySection} onPress={openAddSaving} activeOpacity={0.8}>
              <View style={[styles.emptySectionIcon, { backgroundColor: colors.neon + '15' }]}>
                <Ionicons name="cash-outline" size={20} color={colors.neon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>Agregar efectivo</Text>
                <Text variant="caption" color={colors.text.tertiary}>Pesos, dólares, cuenta bancaria...</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          ) : (
            savings.map(s => (
              <SavingCard key={s.id} saving={s} usdRate={usdRate} onEdit={openEditSaving} onDelete={confirmDeleteSaving} />
            ))
          )}

          {/* ── Inversiones ──────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text variant="label" color={colors.text.tertiary}>INVERSIONES</Text>
            <TouchableOpacity onPress={openAddInv} style={styles.addBtn}>
              <Ionicons name="add" size={15} color={colors.neon} />
              <Text variant="label" color={colors.neon}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {investments.length === 0 ? (
            <TouchableOpacity style={styles.emptySection} onPress={openAddInv} activeOpacity={0.8}>
              <View style={[styles.emptySectionIcon, { backgroundColor: '#A78BFA18' }]}>
                <Ionicons name="trending-up-outline" size={20} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall" color={colors.text.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>Agregar inversión</Text>
                <Text variant="caption" color={colors.text.tertiary}>FCI, Cedears, Plazo Fijo, Cripto...</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          ) : (
            investments.map(i => (
              <InvestmentCard key={i.id} inv={i} usdRate={usdRate} onEdit={openEditInv} onDelete={confirmDeleteInv} />
            ))
          )}

          {/* ── Insights ─────────────────────────────────────────────────── */}
          {insights.map((insight, idx) => (
            <View key={idx} style={styles.insightCard}>
              <Ionicons name="bulb-outline" size={16} color={colors.yellow} />
              <Text variant="caption" color={colors.text.secondary} style={{ flex: 1, lineHeight: 18 }}>{insight}</Text>
            </View>
          ))}

          {/* ── CTAs ─────────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.advisorBtn}
            onPress={() => router.push({ pathname: '/(app)/advisor', params: { initialContext: advisorCtx } } as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.bg.primary} />
            <Text style={styles.advisorBtnText}>Hablar con el asesor sobre mi capital</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.bg.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.simBtn} onPress={() => router.push('/(app)/simulator' as any)} activeOpacity={0.85}>
            <Ionicons name="trending-up-outline" size={16} color={colors.primary} />
            <Text variant="label" color={colors.primary}>Simular rendimientos</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>

        </>)}
      </ScrollView>

      <AddGoalModal
        visible={showGoalModal}
        initial={editingGoal}
        onClose={() => setShowGoalModal(false)}
        onSave={handleSaveGoal}
      />
      <AddSavingModal
        visible={showSavingModal}
        initial={editingSaving}
        onClose={() => setShowSavingModal(false)}
        onSave={handleSaveSaving}
      />
      <AddInvestmentModal
        visible={showInvModal}
        initial={editingInv}
        onClose={() => setShowInvModal(false)}
        onSave={handleSaveInv}
      />
      <AportarModal
        goal={aportarGoal}
        onClose={() => setAportarGoal(null)}
        onSave={(amount) => addToGoal(aportarGoal!.id, amount)}
      />
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { flexGrow: 1, paddingHorizontal: layout.screenPadding, paddingTop: spacing[4], paddingBottom: layout.tabBarHeight + spacing[6], gap: spacing[4] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border.default, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[2] },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: 8, borderWidth: 1, borderColor: colors.neon + '40', backgroundColor: colors.neon + '0A' },
  emptySection: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default, borderRadius: 14, padding: spacing[4] },
  emptySectionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg.elevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  insightCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], backgroundColor: colors.yellow + '0A', borderWidth: 1, borderColor: colors.yellow + '25', borderRadius: 12, padding: spacing[4] },
  advisorBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.neon, borderRadius: 14, paddingHorizontal: spacing[5], paddingVertical: spacing[4] },
  advisorBtnText: { flex: 1, fontFamily: 'Montserrat_700Bold', fontSize: 13, color: colors.bg.primary },
  simBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderWidth: 1, borderColor: colors.primary + '40', borderRadius: 12, paddingVertical: spacing[4] },
});
