import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text } from '@/components/ui';
import { supabase as _supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/format';
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptics';
import type { Expense, ExpenseCategory } from '@/types';

const supabase = _supabase as any;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Budget {
  id: string;
  category_id: string;
  monthly_limit: number;
}

export interface BudgetRow {
  budget: Budget;
  category: ExpenseCategory;
  spent: number;
  pct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBudgetStatus(pct: number, spent: number, limit: number): { label: string; color: string } {
  if (pct > 1)   return { label: `Te pasaste por ${formatCurrency(Math.round(spent - limit))}`, color: '#EF4444' };
  if (pct > 0.9) return { label: 'Al límite',          color: '#EF4444' };
  if (pct > 0.7) return { label: 'Cerca del límite',   color: '#F59E0B' };
  return           { label: 'Vas bien',                 color: '#2E7D32' };
}

function getBarColor(pct: number): string {
  if (pct > 0.9) return '#EF4444';
  if (pct > 0.7) return '#F59E0B';
  return '#2E7D32';
}

// ─── Alerta crítica interna ───────────────────────────────────────────────────

function CriticalAlert({ row }: { row: BudgetRow }) {
  const isOver  = row.pct > 1;
  const bg      = isOver ? '#FEEBEE' : '#FFF8E1';
  const border  = isOver ? '#FFCDD2' : '#FFE082';
  const icon    = isOver ? 'alert-circle' : 'warning';
  const color   = isOver ? '#C62828' : '#F57F17';

  const body = isOver
    ? `Superaste el presupuesto de ${row.category.name_es} por ${formatCurrency(Math.round(row.spent - row.budget.monthly_limit))}.`
    : `Ya usaste el ${Math.round(row.pct * 100)}% del presupuesto de ${row.category.name_es}.`;

  return (
    <View style={[alertS.wrap, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={icon as any} size={14} color={color} style={{ flexShrink: 0 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[alertS.title, { color }]}>
          {isOver ? `Te pasaste en ${row.category.name_es}` : `Ojo con ${row.category.name_es}`}
        </Text>
        <Text style={[alertS.body, { color }]}>{body}</Text>
      </View>
    </View>
  );
}

const alertS = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: 14, padding: 12, borderWidth: 1 },
  title: { fontFamily: 'Montserrat_700Bold', fontSize: 12 },
  body:  { fontFamily: 'Montserrat_400Regular', fontSize: 11, lineHeight: 15, opacity: 0.85 },
});

// ─── BudgetRowItem ────────────────────────────────────────────────────────────

function BudgetRowItem({ row, onEdit }: { row: BudgetRow; onEdit: (row: BudgetRow) => void }) {
  const clampedPct = Math.min(row.pct, 1);
  const barColor   = getBarColor(row.pct);
  const status     = getBudgetStatus(row.pct, row.spent, row.budget.monthly_limit);
  const pctInt     = Math.round(row.pct * 100);

  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => { hapticLight(); onEdit(row); }}
      activeOpacity={0.75}
    >
      {/* Icon */}
      <View style={[s.iconBox, { backgroundColor: (row.category.color ?? colors.primary) + '20' }]}>
        <Ionicons name={row.category.icon as any} size={18} color={row.category.color ?? colors.primary} />
      </View>

      {/* Body */}
      <View style={{ flex: 1, gap: 5 }}>
        {/* Row 1: name + pct badge */}
        <View style={s.rowHeader}>
          <Text style={s.catName} numberOfLines={1}>{row.category.name_es}</Text>
          <View style={[s.pctBadge, { backgroundColor: barColor + '18', borderColor: barColor + '40' }]}>
            <Text style={[s.pctText, { color: barColor }]}>{pctInt}%</Text>
          </View>
        </View>

        {/* Row 2: progress bar */}
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${Math.round(clampedPct * 100)}%` as any, backgroundColor: barColor }]} />
        </View>

        {/* Row 3: amounts + status */}
        <View style={s.rowFooter}>
          <Text style={s.statusLabel} numberOfLines={1}>{status.label}</Text>
          <View style={s.amountGroup}>
            <Text style={[s.spentAmt, { color: barColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {formatCurrency(row.spent)}
            </Text>
            <Text style={s.limitAmt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {' / '}{formatCurrency(row.budget.monthly_limit)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── SetBudgetModal ───────────────────────────────────────────────────────────

function SetBudgetModal({
  visible,
  categories,
  existingBudgets,
  editingRow,
  onClose,
  onSave,
  onDelete,
}: {
  visible:         boolean;
  categories:      ExpenseCategory[];
  existingBudgets: Budget[];
  editingRow:      BudgetRow | null;
  onClose:         () => void;
  onSave:          (categoryId: string, limit: number) => Promise<void>;
  onDelete:        (budgetId: string) => Promise<void>;
}) {
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [limitText,     setLimitText]     = useState('');
  const [isSaving,      setIsSaving]      = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedCatId(editingRow?.category.id ?? null);
      setLimitText(editingRow ? String(editingRow.budget.monthly_limit) : '');
      setIsSaving(false);
    }
  }, [visible, editingRow]);

  const availableCategories = useMemo(() => {
    const usedIds = new Set(existingBudgets.map(b => b.category_id));
    if (editingRow) usedIds.delete(editingRow.category.id);
    return categories.filter(c => !usedIds.has(c.id));
  }, [categories, existingBudgets, editingRow]);

  const handleSave = async () => {
    if (!selectedCatId) { Alert.alert('Elegí una categoría'); return; }
    const limit = parseFloat(limitText.replace(',', '.'));
    if (isNaN(limit) || limit <= 0) { Alert.alert('Ingresá un monto válido'); return; }
    setIsSaving(true);
    try { await onSave(selectedCatId, limit); onClose(); }
    catch { Alert.alert('Error', 'No se pudo guardar el presupuesto.'); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!editingRow) return;
    Alert.alert('Eliminar presupuesto', '¿Querés eliminar este presupuesto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setIsSaving(true);
          try { await onDelete(editingRow.budget.id); onClose(); }
          catch { Alert.alert('Error', 'No se pudo eliminar.'); }
          finally { setIsSaving(false); }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={ms.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
          <View style={ms.sheet}>
            <View style={ms.dragBar} />

            <View style={ms.header}>
              <Text style={ms.title}>{editingRow ? 'Editar presupuesto' : 'Nuevo presupuesto'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {!editingRow && (
              <View style={{ gap: spacing[2] }}>
                <Text style={ms.sectionLabel}>CATEGORÍA</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing[2], paddingBottom: spacing[1] }}
                >
                  {availableCategories.map(cat => {
                    const active = selectedCatId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[ms.catChip, active && { borderColor: cat.color ?? colors.primary, backgroundColor: (cat.color ?? colors.primary) + '18' }]}
                        onPress={() => { setSelectedCatId(cat.id); hapticLight(); }}
                        activeOpacity={0.75}
                      >
                        <Ionicons name={cat.icon as any} size={14} color={active ? (cat.color ?? colors.primary) : colors.text.tertiary} />
                        <Text style={[ms.catChipText, active && { color: cat.color ?? colors.primary, fontFamily: 'Montserrat_700Bold' }]}>
                          {cat.name_es}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {editingRow && (
              <View style={ms.editingCat}>
                <View style={[ms.editCatIcon, { backgroundColor: (editingRow.category.color ?? colors.primary) + '22' }]}>
                  <Ionicons name={editingRow.category.icon as any} size={18} color={editingRow.category.color ?? colors.primary} />
                </View>
                <Text style={ms.editCatName}>{editingRow.category.name_es}</Text>
              </View>
            )}

            <View style={{ gap: spacing[2] }}>
              <Text style={ms.sectionLabel}>LÍMITE MENSUAL (ARS)</Text>
              <View style={ms.inputRow}>
                <Text style={ms.inputPrefix}>$</Text>
                <TextInput
                  style={ms.input}
                  value={limitText}
                  onChangeText={setLimitText}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.text.tertiary}
                  returnKeyType="done"
                />
              </View>
            </View>

            <Text style={ms.microcopy}>Solo cuentan los gastos clasificados.</Text>

            <TouchableOpacity
              style={[ms.saveBtn, (!selectedCatId || !limitText) && { opacity: 0.4 }]}
              onPress={() => { hapticMedium(); handleSave(); }}
              disabled={isSaving || !selectedCatId || !limitText}
              activeOpacity={0.85}
            >
              {isSaving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                    <Text style={ms.saveBtnText}>Guardar presupuesto</Text>
                  </>
              }
            </TouchableOpacity>

            {editingRow && (
              <TouchableOpacity style={ms.deleteBtn} onPress={handleDelete} disabled={isSaving} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={15} color={colors.red} />
                <Text style={ms.deleteBtnText}>Eliminar presupuesto</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#FAFAFA', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing[5], gap: spacing[4], paddingBottom: spacing[10] },
  dragBar:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: spacing[1] },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: '#212121', letterSpacing: -0.3 },
  sectionLabel: { fontFamily: 'Montserrat_600SemiBold', fontSize: 10, color: '#9E9E9E', letterSpacing: 0.5 },
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: 20, borderWidth: 1.5, borderColor: colors.border.default, backgroundColor: colors.bg.card },
  catChipText:  { fontFamily: 'Montserrat_500Medium', fontSize: 12, color: colors.text.secondary },
  editingCat:   { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: '#F5F5F5', borderRadius: 12, padding: spacing[3] },
  editCatIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editCatName:  { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: '#212121' },
  inputRow:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border.default, borderRadius: 12, backgroundColor: '#FFF', paddingHorizontal: spacing[4] },
  inputPrefix:  { fontFamily: 'Montserrat_700Bold', fontSize: 22, color: '#212121', marginRight: spacing[1] },
  input:        { flex: 1, fontFamily: 'Montserrat_600SemiBold', fontSize: 22, color: '#212121', paddingVertical: spacing[4] },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.primary, borderRadius: 14, paddingVertical: spacing[4], shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  saveBtnText:  { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: colors.white },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: 12, borderWidth: 1, borderColor: colors.red + '40', backgroundColor: colors.red + '08' },
  deleteBtnText:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: colors.red },
  microcopy:    { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: '#9E9E9E', textAlign: 'center' },
});

// ─── Shared fetch hook ────────────────────────────────────────────────────────

function useSpendingByCategory(expenses: Expense[]): Record<string, number> {
  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      if (e.category_id) map[e.category_id] = (map[e.category_id] ?? 0) + e.amount;
    }
    return map;
  }, [expenses]);
}

function useBudgets(userId: string): [Budget[], boolean, () => Promise<void>] {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('category_budgets')
      .select('id, category_id, monthly_limit')
      .eq('user_id', userId);
    setBudgets(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  return [budgets, loading, fetchBudgets];
}

function buildRows(budgets: Budget[], categories: ExpenseCategory[], spendingByCat: Record<string, number>): BudgetRow[] {
  return budgets
    .map(b => {
      const category = categories.find(c => c.id === b.category_id);
      if (!category) return null;
      const spent = spendingByCat[b.category_id] ?? 0;
      const pct   = b.monthly_limit > 0 ? spent / b.monthly_limit : 0;
      return { budget: b, category, spent, pct };
    })
    .filter(Boolean)
    .sort((a, b) => b!.pct - a!.pct) as BudgetRow[];
}

// ─── BudgetCard (full — in expenses.tsx) ─────────────────────────────────────

interface BudgetCardProps {
  userId:     string;
  expenses:   Expense[];
  categories: ExpenseCategory[];
}

export function BudgetCard({ userId, expenses, categories }: BudgetCardProps) {
  const [budgets, loading, fetchBudgets] = useBudgets(userId);
  const [showModal,  setShowModal]  = useState(false);
  const [editingRow, setEditingRow] = useState<BudgetRow | null>(null);

  const spendingByCat = useSpendingByCategory(expenses);
  const rows          = useMemo(() => buildRows(budgets, categories, spendingByCat), [budgets, categories, spendingByCat]);

  // Most critical row (highest pct > 0.9)
  const criticalRow = rows.find(r => r.pct > 0.9) ?? null;

  const handleOpenNew  = () => { hapticLight(); setEditingRow(null); setShowModal(true); };
  const handleOpenEdit = (row: BudgetRow) => { setEditingRow(row); setShowModal(true); };

  const handleSave = async (categoryId: string, limit: number) => {
    await supabase.from('category_budgets').upsert(
      { user_id: userId, category_id: categoryId, monthly_limit: limit, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category_id' }
    );
    hapticSuccess();
    await fetchBudgets();
  };

  const handleDelete = async (budgetId: string) => {
    await supabase.from('category_budgets').delete().eq('id', budgetId);
    await fetchBudgets();
  };

  if (loading) return null;

  return (
    <>
      <View style={s.card}>
        {/* Header */}
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            <Ionicons name="bar-chart-outline" size={15} color={colors.primary} />
            <Text style={s.cardTitle}>Presupuestos del mes</Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={handleOpenNew}
            disabled={categories.length > 0 && budgets.length >= categories.length}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={15} color={colors.primary} />
            <Text style={s.addBtnText}>Agregar</Text>
          </TouchableOpacity>
        </View>

        {/* Critical alert — most overrun category */}
        {criticalRow && <CriticalAlert row={criticalRow} />}

        {/* Rows or empty state */}
        {rows.length === 0 ? (
          <TouchableOpacity style={s.emptyState} onPress={handleOpenNew} activeOpacity={0.8}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="wallet-outline" size={26} color={colors.text.tertiary} />
            </View>
            <Text style={s.emptyTitle}>Definí límites por categoría</Text>
            <Text style={s.emptySubtext}>
              Para saber cuándo estás cerca de pasarte y mantener el control mes a mes.
            </Text>
            <View style={s.createBtn}>
              <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
              <Text style={s.createBtnText}>Crear mi primer presupuesto</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.rowList}>
            {rows.map((row, i) => (
              <React.Fragment key={row.budget.id}>
                {i > 0 && <View style={s.divider} />}
                <BudgetRowItem row={row} onEdit={handleOpenEdit} />
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      <SetBudgetModal
        visible={showModal}
        categories={categories}
        existingBudgets={budgets}
        editingRow={editingRow}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}

// ─── BudgetHomeWidget (compact — in home.tsx) ─────────────────────────────────

interface BudgetHomeWidgetProps {
  userId:   string;
  expenses: Expense[];
  budgets:  Budget[];   // fetched by parent (home.tsx) to avoid duplicate queries
  onPress:  () => void;
}

export function BudgetHomeWidget({ expenses, budgets, onPress }: BudgetHomeWidgetProps) {
  const spendingByCat = useSpendingByCategory(expenses);

  // Build rows without full category list — only for budgets that have matching expense data
  const rows: BudgetRow[] = useMemo(() => {
    return budgets
      .map(b => {
        // Derive category from any expense that matches
        const matchingExpense = expenses.find(e => e.category_id === b.category_id);
        const category = matchingExpense?.category as ExpenseCategory | undefined;
        if (!category) return null;
        const spent = spendingByCat[b.category_id] ?? 0;
        const pct   = b.monthly_limit > 0 ? spent / b.monthly_limit : 0;
        return { budget: b, category, spent, pct };
      })
      .filter(Boolean)
      .sort((a, b) => b!.pct - a!.pct) as BudgetRow[];
  }, [budgets, expenses, spendingByCat]);

  // Don't render if no budgets configured
  if (budgets.length === 0) return null;

  // Find the most critical row
  const worstRow = rows[0]; // sorted by pct descending
  const isOver   = worstRow?.pct > 1;
  const isNear   = worstRow?.pct > 0.7;

  // Only show widget when there's an alert (>70% usage)
  if (!worstRow || !isNear) return null;

  // Derive widget content
  let iconName: string;
  let iconColor: string;
  let title: string;
  let subtitle: string;
  let bg: string;
  let border: string;

  if (isOver) {
    iconName  = 'alert-circle';
    iconColor = '#EF4444';
    title     = `Te pasaste en ${worstRow.category.name_es}`;
    subtitle  = `Superaste el límite por ${formatCurrency(Math.round(worstRow.spent - worstRow.budget.monthly_limit))}.`;
    bg        = '#FEEBEE';
    border    = '#FFCDD2';
  } else {
    const pctInt = Math.round(worstRow.pct * 100);
    const color  = worstRow.pct > 0.9 ? '#EF4444' : '#F59E0B';
    iconName  = 'warning';
    iconColor = color;
    title     = `Ojo con ${worstRow.category.name_es}`;
    subtitle  = `Ya usaste el ${pctInt}% del presupuesto.`;
    bg        = worstRow.pct > 0.9 ? '#FEEBEE' : '#FFF8E1';
    border    = worstRow.pct > 0.9 ? '#FFCDD2' : '#FFE082';
  }

  return (
    <TouchableOpacity
      style={[hw.card, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Left */}
      <View style={[hw.iconBox, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={iconName as any} size={20} color={iconColor} />
      </View>

      {/* Center */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={hw.label}>PRESUPUESTOS</Text>
        <Text style={hw.title} numberOfLines={1}>{title}</Text>
        <Text style={hw.subtitle} numberOfLines={2}>{subtitle}</Text>
      </View>

      {/* Right CTA */}
      <View style={hw.cta}>
        <Text style={[hw.ctaText, { color: iconColor }]}>Ver</Text>
        <Ionicons name="chevron-forward" size={13} color={iconColor} />
      </View>
    </TouchableOpacity>
  );
}

const hw = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    borderRadius: 14, padding: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  iconBox: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontFamily: 'Montserrat_700Bold', fontSize: 9, color: '#9E9E9E', letterSpacing: 0.8 },
  title:   { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: '#1A1A1A', letterSpacing: -0.2 },
  subtitle:{ fontFamily: 'Montserrat_400Regular', fontSize: 12, color: '#616161', lineHeight: 17 },
  cta:     { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  ctaText: { fontFamily: 'Montserrat_700Bold', fontSize: 12 },
});

// ─── Estilos de BudgetCard ────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },

  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cardTitle:      { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: '#1A1A1A', letterSpacing: -0.2 },

  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' },
  addBtnText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 12, color: colors.primary },

  emptyState:   { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[6] },
  emptyIconWrap:{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: '#424242' },
  emptySubtext: { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 19 },
  createBtn:    { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' },
  createBtnText:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: colors.primary },

  rowList: { gap: 0 },
  divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: spacing[3] },

  // BudgetRowItem
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  iconBox:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  rowHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName:    { flex: 1, fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: '#1A1A1A', marginRight: spacing[2] },
  pctBadge:   { flexShrink: 0, borderRadius: 20, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pctText:    { fontFamily: 'Montserrat_700Bold', fontSize: 11 },
  barTrack:   { height: 8, backgroundColor: '#EBEBEB', borderRadius: 999, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 999 },
  rowFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 11, color: '#9E9E9E', flex: 1, marginRight: spacing[2] },
  amountGroup:{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  spentAmt:   { fontFamily: 'Montserrat_700Bold', fontSize: 13 },
  limitAmt:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: '#BDBDBD', flexShrink: 0 },
});
