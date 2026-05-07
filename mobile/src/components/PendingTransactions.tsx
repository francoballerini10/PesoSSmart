import React, { useState } from 'react';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text, Card } from '@/components/ui';
import { supabase as _supabase } from '@/lib/supabase';
const supabase = _supabase as any;
import type { ExpenseCategory, ExpenseClassification } from '@/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PendingTransaction {
  id: string;
  amount: number;
  currency: string;
  merchant: string | null;
  suggested_category: string | null;
  suggested_classification: 'necessary' | 'disposable' | 'investable' | null;
  description: string | null;
  transaction_date: string | null;
  source: string | null;
}

interface Props {
  transactions: PendingTransaction[];
  userId: string;
  isPolling?: boolean;
  categories: ExpenseCategory[];
  onConfirmed: () => void;
}

const INITIAL_VISIBLE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date  = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const label = source === 'mercadopago' ? 'Mercado Pago'
    : source === 'gmail' ? 'Gmail'
    : source;
  const color = source === 'mercadopago' ? '#009EE3'
    : source === 'gmail' ? '#EA4335'
    : '#78909c';
  return (
    <View style={[sourceBadgeS.pill, { backgroundColor: color + '1A' }]}>
      <View style={[sourceBadgeS.dot, { backgroundColor: color }]} />
      <Text style={[sourceBadgeS.label, { color }]}>{label}</Text>
    </View>
  );
}

const sourceBadgeS = StyleSheet.create({
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 20 },
  dot:   { width: 5, height: 5, borderRadius: 3 },
  label: { fontSize: 9, fontFamily: 'Montserrat_600SemiBold' },
});

// ─── CategorizarSheet ─────────────────────────────────────────────────────────

const CLASS_OPTIONS = [
  { key: 'necessary',  label: 'Necesario',   color: '#43a047', icon: 'shield-checkmark-outline' },
  { key: 'disposable', label: 'Prescindible', color: '#e53935', icon: 'wallet-outline'           },
  { key: 'investable', label: 'Invertible',   color: '#00897b', icon: 'trending-up-outline'      },
] as const;

function CategorizarSheet({
  tx,
  categories,
  onSelect,
  onClose,
  isSaving,
}: {
  tx:         PendingTransaction;
  categories: ExpenseCategory[];
  onSelect:   (cat: ExpenseCategory, classification: string) => void;
  onClose:    () => void;
  isSaving:   boolean;
}) {
  const suggestedCat   = categories.find(c => c.name === tx.suggested_category);
  const [selectedCat,  setSelectedCat]  = useState<string | null>(suggestedCat?.id ?? null);
  const [selectedClass, setSelectedClass] = useState<string | null>(tx.suggested_classification ?? null);

  const canConfirm = !!selectedCat && !!selectedClass && !isSaving;

  const handleConfirm = () => {
    const cat = categories.find(c => c.id === selectedCat);
    if (cat && selectedClass) { hapticMedium(); onSelect(cat, selectedClass); }
  };

  return (
    <View style={sheetStyles.backdrop}>
      <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.dragBar} />

        {/* Header */}
        <View style={sheetStyles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subtitle" color={colors.text.primary} numberOfLines={1}>
              {tx.merchant ?? 'Gasto detectado'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="caption" color={colors.text.secondary}>
                {formatDateLabel(tx.transaction_date) ?? 'Sin fecha'}
              </Text>
              <SourceBadge source={tx.source} />
            </View>
          </View>
          <Text style={sheetStyles.amount}>
            ${tx.amount.toLocaleString('es-AR')}
          </Text>
        </View>

        {/* ── Tipo de gasto (obligatorio) ── */}
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="label" color={colors.text.tertiary}>TIPO DE GASTO</Text>
            {!selectedClass && (
              <View style={sheetStyles.requiredBadge}>
                <Text style={sheetStyles.requiredText}>obligatorio</Text>
              </View>
            )}
          </View>
          <View style={sheetStyles.classRow}>
            {CLASS_OPTIONS.map(opt => {
              const isActive = selectedClass === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    sheetStyles.classChip,
                    isActive && { borderColor: opt.color, backgroundColor: opt.color + '15' },
                  ]}
                  onPress={() => { setSelectedClass(opt.key); hapticLight(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={opt.icon as any} size={16} color={isActive ? opt.color : colors.text.tertiary} />
                  <Text
                    variant="caption"
                    color={isActive ? opt.color : colors.text.secondary}
                    style={isActive ? { fontFamily: 'Montserrat_700Bold' } : undefined}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Categoría ── */}
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="label" color={colors.text.tertiary}>CATEGORÍA</Text>
            {suggestedCat && (
              <View style={sheetStyles.aiRow}>
                <Ionicons name="sparkles-outline" size={11} color={colors.primary} />
                <Text variant="caption" color={colors.primary}>
                  Sugerido: <Text variant="caption" style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.text.primary }}>{suggestedCat.name_es}</Text>
                </Text>
              </View>
            )}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={sheetStyles.grid}
            style={{ maxHeight: 220 }}
          >
            {categories.map(cat => {
              const isActive = selectedCat === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    sheetStyles.catItem,
                    isActive && { borderColor: cat.color ?? colors.primary, backgroundColor: (cat.color ?? colors.primary) + '15' },
                  ]}
                  onPress={() => { setSelectedCat(cat.id); hapticLight(); }}
                  activeOpacity={0.7}
                >
                  <View style={[sheetStyles.catIconBox, { backgroundColor: (cat.color ?? colors.primary) + '20' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={cat.color ?? colors.primary} />
                  </View>
                  <Text
                    variant="caption"
                    color={isActive ? (cat.color ?? colors.primary) : colors.text.secondary}
                    style={isActive ? { fontFamily: 'Montserrat_600SemiBold' } : undefined}
                    numberOfLines={2}
                  >
                    {cat.name_es}
                  </Text>
                  {isActive && (
                    <View style={[sheetStyles.checkBadge, { backgroundColor: cat.color ?? colors.primary }]}>
                      <Ionicons name="checkmark" size={10} color={colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={[sheetStyles.confirmBtn, !canConfirm && { opacity: 0.4 }]}
          onPress={handleConfirm}
          disabled={!canConfirm}
          activeOpacity={0.85}
        >
          {isSaving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                <Text style={sheetStyles.confirmBtnText}>
                  {!selectedClass ? 'Elegí el tipo de gasto' : !selectedCat ? 'Elegí una categoría' : 'Confirmar gasto'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000070', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: colors.bg.primary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing[5], gap: spacing[4], paddingBottom: spacing[8] },
  dragBar:        { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: 'center', marginBottom: spacing[1] },
  header:         { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  amount:         { fontFamily: 'Montserrat_700Bold', fontSize: 22, color: colors.text.primary, lineHeight: 28 },
  aiRow:          { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.primary + '10', borderRadius: 6, paddingHorizontal: spacing[2], paddingVertical: 3 },
  classRow:       { flexDirection: 'row', gap: spacing[2] },
  classChip:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[3], borderRadius: 10, borderWidth: 1.5, borderColor: colors.border.default, backgroundColor: colors.bg.card },
  requiredBadge:  { backgroundColor: colors.red + '20', borderRadius: 4, paddingHorizontal: spacing[2], paddingVertical: 2 },
  requiredText:   { fontSize: 9, fontFamily: 'Montserrat_600SemiBold', color: colors.red },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  catItem:        { width: '30%', alignItems: 'center', gap: spacing[1], padding: spacing[2], borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, backgroundColor: colors.bg.card, position: 'relative' },
  catIconBox:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  checkBadge:     { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.primary, borderRadius: 12, paddingVertical: spacing[4] },
  confirmBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: colors.white },
});

// ─── PendingTransactions ──────────────────────────────────────────────────────

export function PendingTransactions({ transactions, userId, isPolling, categories, onConfirmed }: Props) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [activeTxId,   setActiveTxId]   = useState<string | null>(null);
  const [showAll,      setShowAll]       = useState(false);
  const [bulkLoading,  setBulkLoading]   = useState(false);

  const filtered     = transactions.filter(tx => !dismissedIds.has(tx.id));
  const visible      = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hiddenCount  = filtered.length - INITIAL_VISIBLE;
  const activeTx     = filtered.find(tx => tx.id === activeTxId) ?? null;

  const withSuggestion = filtered.filter(
    tx => tx.suggested_category && categories.some(c => c.name === tx.suggested_category)
  );

  if (filtered.length === 0 && !isPolling) return null;

  // ── Confirmar: inserta en expenses + marca como confirmado ─────────────────
  const confirmTx = async (tx: PendingTransaction, cat: ExpenseCategory, classification: string) => {
    if (updatingId !== null) return;
    setUpdatingId(tx.id);
    try {
      const txDate = tx.transaction_date ?? new Date().toISOString().split('T')[0];

      const { error: expErr } = await supabase.from('expenses').insert({
        user_id:        userId,
        amount:         tx.amount,
        description:    tx.merchant || tx.description || 'Gasto detectado',
        category_id:    cat.id,
        date:           txDate,
        payment_method: 'digital_wallet',
        classification: classification as ExpenseClassification,
        is_recurring:   false,
      });
      if (expErr) throw new Error(expErr.message);

      await supabase.from('pending_transactions')
        .update({ status: 'confirmed' })
        .eq('id', tx.id);

      setDismissedIds(prev => new Set([...prev, tx.id]));
      setActiveTxId(null);
      onConfirmed();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el gasto. Intentá de nuevo.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Rechazar: marca como rechazado ─────────────────────────────────────────
  const rejectTx = async (txId: string) => {
    if (updatingId !== null) return;
    setUpdatingId(txId);
    try {
      await supabase.from('pending_transactions')
        .update({ status: 'rejected' })
        .eq('id', txId);
      setDismissedIds(prev => new Set([...prev, txId]));
    } catch {
      Alert.alert('Error', 'No se pudo ignorar el gasto.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Bulk confirm todas las sugeridas (usa suggested_classification) ────────
  const handleBulkConfirm = async () => {
    if (bulkLoading || withSuggestion.length === 0) return;
    setBulkLoading(true);
    try {
      for (const tx of withSuggestion) {
        const cat = categories.find(c => c.name === tx.suggested_category);
        const cls = tx.suggested_classification ?? 'disposable';
        if (cat) await confirmTx(tx, cat, cls);
      }
    } finally {
      setBulkLoading(false);
      onConfirmed();
    }
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={14} color={colors.yellow} />
          <Text variant="label" color={colors.yellow}>
            {filtered.length} GASTO{filtered.length !== 1 ? 'S' : ''} SIN CONFIRMAR
          </Text>
        </View>
        {isPolling && (
          <View style={styles.pollingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" color={colors.text.tertiary}>Buscando...</Text>
          </View>
        )}
      </View>

      {/* Bulk confirm */}
      {withSuggestion.length >= 2 && (
        <TouchableOpacity
          style={[styles.bulkBtn, bulkLoading && { opacity: 0.6 }]}
          onPress={handleBulkConfirm}
          disabled={bulkLoading}
          activeOpacity={0.8}
        >
          {bulkLoading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="checkmark-done-outline" size={15} color={colors.white} />
          }
          <Text style={styles.bulkBtnText}>
            {bulkLoading
              ? 'Confirmando...'
              : `Confirmar ${withSuggestion.length} con categoría sugerida`
            }
          </Text>
        </TouchableOpacity>
      )}

      {/* Cards */}
      {visible.map(tx => {
        const dateLabel    = formatDateLabel(tx.transaction_date);
        const suggestedCat = categories.find(c => c.name === tx.suggested_category);
        const isLoading    = updatingId === tx.id;

        return (
          <TouchableOpacity
            key={tx.id}
            activeOpacity={0.8}
            onPress={() => !isLoading && setActiveTxId(tx.id)}
          >
            <Card style={styles.card}>
              {/* Top: info + amount */}
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text variant="bodySmall" color={colors.text.primary} style={styles.merchantName} numberOfLines={1}>
                    {tx.merchant ?? 'Comercio desconocido'}
                  </Text>
                  <View style={styles.metaRow}>
                    <SourceBadge source={tx.source} />
                    {dateLabel && (
                      <Text variant="caption" color={colors.text.tertiary} style={{ fontSize: 11 }}>
                        {dateLabel}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardRight}>
                  {isLoading
                    ? <ActivityIndicator size="small" color={colors.neon} />
                    : <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>NUEVO</Text>
                      </View>
                  }
                  <Text variant="subtitle" color={colors.text.primary} style={styles.amount}>
                    ${tx.amount.toLocaleString('es-AR')}
                  </Text>
                </View>
              </View>

              {/* AI suggestion */}
              {suggestedCat && (
                <View style={styles.aiSuggest}>
                  <Ionicons name="sparkles-outline" size={11} color={colors.primary} />
                  <Text variant="caption" color={colors.primary}>
                    Sugerido: <Text variant="caption" style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.text.primary }}>{suggestedCat.name_es}</Text>
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.cardActions}>
                {suggestedCat ? (
                  <TouchableOpacity
                    style={styles.confirmQuickBtn}
                    onPress={() => !isLoading && setActiveTxId(tx.id)}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-outline" size={14} color={colors.neon} />
                    <Text variant="caption" color={colors.neon} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
                      Confirmar
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.categorizarBtn}
                    onPress={() => !isLoading && setActiveTxId(tx.id)}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="pricetag-outline" size={13} color={colors.primary} />
                    <Text variant="caption" color={colors.primary} style={{ fontFamily: 'Montserrat_600SemiBold' }}>
                      Categorizar
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => !isLoading && setActiveTxId(tx.id)}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={15} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}

      {/* Ver más / menos */}
      {!showAll && hiddenCount > 0 && (
        <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAll(true)}>
          <Text variant="caption" color={colors.neon}>Ver {hiddenCount} más</Text>
          <Ionicons name="chevron-down" size={14} color={colors.neon} />
        </TouchableOpacity>
      )}
      {showAll && filtered.length > INITIAL_VISIBLE && (
        <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAll(false)}>
          <Text variant="caption" color={colors.text.secondary}>Mostrar menos</Text>
          <Ionicons name="chevron-up" size={14} color={colors.text.secondary} />
        </TouchableOpacity>
      )}

      {/* Bottom sheet de categorización */}
      <Modal
        visible={!!activeTx}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveTxId(null)}
      >
        {activeTx && (
          <CategorizarSheet
            tx={activeTx}
            categories={categories}
            onSelect={(cat, classification) => confirmTx(activeTx, cat, classification)}
            onClose={() => setActiveTxId(null)}
            isSaving={updatingId === activeTx.id}
          />
        )}
      </Modal>

    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing[3] },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pollingRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },

  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    alignSelf: 'stretch', justifyContent: 'center',
  },
  bulkBtnText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: colors.white },

  card:         { padding: spacing[4], gap: spacing[3] },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  cardInfo:     { flex: 1, gap: 3 },
  merchantName: { fontFamily: 'Montserrat_600SemiBold' },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cardRight:    { alignItems: 'flex-end', gap: spacing[1], flexShrink: 0 },
  newBadge:     { backgroundColor: colors.yellow, paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 3 },
  newBadgeText: { fontSize: 9, fontFamily: 'Montserrat_700Bold', color: '#212121' },
  amount:       { fontFamily: 'Montserrat_700Bold' },

  aiSuggest: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    backgroundColor: colors.primary + '0D', borderRadius: 6,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },

  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border.subtle,
  },
  confirmQuickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: spacing[2], borderRadius: 8,
    borderWidth: 1, borderColor: colors.neon + '50',
    backgroundColor: colors.neon + '0D',
  },
  categorizarBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: spacing[2], borderRadius: 8,
    borderWidth: 1, borderColor: colors.primary + '50',
    backgroundColor: colors.primary + '0D',
  },
  editBtn: {
    padding: spacing[2],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },

  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2] },
});
