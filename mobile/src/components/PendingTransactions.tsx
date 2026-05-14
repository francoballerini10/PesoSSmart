import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { hapticLight, hapticMedium, hapticError } from '@/lib/haptics';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text, Card } from '@/components/ui';
import { CategoryIcon } from '@/components/CategoryIcon';
import { supabase as _supabase } from '@/lib/supabase';
const supabase = _supabase as any;
import { matchDebt } from '@/lib/debtMatcher';
import type { ExpenseCategory, ExpenseClassification } from '@/types';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

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

interface ConfirmedExpense {
  amount: number;
  date: string;
  description: string | null;
}

interface Props {
  transactions: PendingTransaction[];
  userId: string;
  isPolling?: boolean;
  categories: ExpenseCategory[];
  onConfirmed: () => void;
  confirmedExpenses?: ConfirmedExpense[];
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

function isPossibleDuplicate(tx: PendingTransaction, confirmed: ConfirmedExpense[]): boolean {
  if (!confirmed || confirmed.length === 0) return false;
  return confirmed.some(exp => {
    const amountClose = Math.abs(exp.amount - tx.amount) / Math.max(tx.amount, 1) < 0.05;
    if (!amountClose) return false;
    if (!tx.transaction_date || !exp.date) return amountClose;
    const dayDiff = Math.abs(
      new Date(tx.transaction_date).getTime() - new Date(exp.date).getTime()
    ) / 86400000;
    return dayDiff <= 3;
  });
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function AnimatedEmptyState() {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 14 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyState, { opacity }]}>
      <Animated.View style={[styles.emptyIcon, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark-circle" size={32} color={colors.primary} />
      </Animated.View>
      <Text style={styles.emptyTitle}>Todo clasificado</Text>
      <Text style={styles.emptySubtext}>No tenés gastos sin clasificar por revisar.</Text>
    </Animated.View>
  );
}

// ─── PressScaleCard ───────────────────────────────────────────────────────────

function PressScaleCard({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const handleOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 3 }).start();

  return (
    <AnimatedTouchable
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={{ transform: [{ scale }] }}
    >
      {children}
    </AnimatedTouchable>
  );
}

// ─── SourceBadge ─────────────────────────────────────────────────────────────

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

function CategorizarSheet({
  tx,
  categories,
  onSelect,
  onClose,
  onReject,
  isSaving,
}: {
  tx:         PendingTransaction;
  categories: ExpenseCategory[];
  onSelect:   (cat: ExpenseCategory, classification: string) => void;
  onClose:    () => void;
  onReject:   () => void;
  isSaving:   boolean;
}) {
  const suggestedCat   = categories.find(c => c.name === tx.suggested_category);
  const [selectedCat,   setSelectedCat]   = useState<string | null>(suggestedCat?.id ?? null);
  const [selectedClass, setSelectedClass] = useState<string | null>(tx.suggested_classification ?? null);
  const [catSearch,     setCatSearch]     = useState('');

  const canConfirm = !!selectedCat && !!selectedClass && !isSaving;

  const searchLow    = catSearch.toLowerCase();
  const filteredCats = catSearch.trim()
    ? categories.filter(c => c.name_es?.toLowerCase().includes(searchLow))
    : categories;

  const handleConfirm = () => {
    const cat = categories.find(c => c.id === selectedCat);
    if (cat && selectedClass) { hapticMedium(); onSelect(cat, selectedClass); }
  };

  return (
    <View style={ptSheet.outerWrap}>
      <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      <SafeAreaView style={ptSheet.sheet} edges={['bottom']}>
        <View style={ptSheet.dragBar} />

        {/* Header */}
        <View style={ptSheet.header}>
          <Text style={ptSheet.headerTitle}>Clasificar gasto</Text>
          <TouchableOpacity onPress={onClose} style={ptSheet.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={ptSheet.scroll}>

          {/* AI banner */}
          <View style={ptSheet.aiBanner}>
            <View style={ptSheet.aiBadge}>
              <Text style={ptSheet.aiBadgeText}>🤖  Asistente inteligente</Text>
            </View>
            <Text style={ptSheet.aiSubtitle}>
              {suggestedCat
                ? `Sugerimos "${suggestedCat.name_es}" para este gasto.`
                : 'Seleccioná la categoría y tipo de gasto.'}
            </Text>
          </View>

          {/* Expense card */}
          <View style={ptSheet.expenseCard}>
            <View style={ptSheet.expenseIconWrap}>
              <CategoryIcon description={tx.merchant ?? tx.description ?? ''} size={44} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ptSheet.expenseName} numberOfLines={1}>{tx.merchant ?? 'Gasto detectado'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {tx.transaction_date && <Text style={ptSheet.expenseMeta}>{formatDateLabel(tx.transaction_date)}</Text>}
                <SourceBadge source={tx.source} />
              </View>
            </View>
            <Text style={ptSheet.expenseAmount}>${tx.amount.toLocaleString('es-AR')}</Text>
          </View>

          {/* Tipo de gasto */}
          <View style={{ gap: 12 }}>
            <Text style={ptSheet.sectionTitle}>Tipo de gasto</Text>
            <View style={ptSheet.typeRow}>
              {([
                { key: 'necessary',  label: 'Necesario',    icon: 'shield-checkmark-outline', color: '#16A34A', bg: '#F0FDF4', border: '#22C55E' },
                { key: 'disposable', label: 'Prescindible', icon: 'cart-outline',              color: '#DC2626', bg: '#FEF2F2', border: '#EF4444' },
                { key: 'investable', label: 'Invertible',   icon: 'trending-up-outline',       color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6' },
              ] as const).map(opt => {
                const active = selectedClass === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[ptSheet.typeBtn, active ? { backgroundColor: opt.bg, borderColor: opt.border } : ptSheet.typeBtnInactive]}
                    onPress={() => { setSelectedClass(opt.key); hapticLight(); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon} size={20} color={active ? opt.color : '#C4C9D4'} />
                    <Text style={[ptSheet.typeBtnLabel, { color: active ? opt.color : '#9CA3AF' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Sugerencia IA */}
          {suggestedCat && (
            <View style={{ gap: 12 }}>
              <Text style={ptSheet.sectionTitle}>Sugerencia ✨</Text>
              <View style={ptSheet.matchCard}>
                <TouchableOpacity
                  style={[ptSheet.matchRow, selectedCat === suggestedCat.id && ptSheet.matchRowActive]}
                  onPress={() => { setSelectedCat(prev => prev === suggestedCat.id ? null : suggestedCat.id); hapticLight(); }}
                  activeOpacity={0.75}
                >
                  <Text style={ptSheet.matchRank}>1</Text>
                  <CategoryIcon categoryName={suggestedCat.name_es} size={30} />
                  <Text style={ptSheet.matchName} numberOfLines={1}>{suggestedCat.name_es}</Text>
                  <Text style={ptSheet.matchPct}>IA match</Text>
                  {selectedCat === suggestedCat.id
                    ? <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                    : <View style={{ width: 18 }} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Todas las categorías */}
          <View style={{ gap: 12 }}>
            <Text style={ptSheet.sectionTitle}>Todas las categorías</Text>
            <View style={ptSheet.searchRow}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={ptSheet.searchInput}
                placeholder="Buscar categoría"
                placeholderTextColor="#9CA3AF"
                value={catSearch}
                onChangeText={setCatSearch}
              />
            </View>
            <View style={ptSheet.catList}>
              {filteredCats.map((cat, i) => {
                const isActive = selectedCat === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[ptSheet.catRow, i < filteredCats.length - 1 && ptSheet.catRowBorder, isActive && ptSheet.catRowActive]}
                    onPress={() => { setSelectedCat(prev => prev === cat.id ? null : cat.id); hapticLight(); }}
                    activeOpacity={0.75}
                  >
                    <View style={[ptSheet.catIconWrap, { backgroundColor: (cat.color ?? '#6366F1') + '20' }]}>
                      <CategoryIcon categoryName={cat.name_es} size={26} />
                    </View>
                    <Text
                      style={[ptSheet.catName, isActive && { color: '#111827', fontFamily: 'Montserrat_600SemiBold' }]}
                      numberOfLines={1}
                    >
                      {cat.name_es}
                    </Text>
                    {isActive
                      ? <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                      : <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={ptSheet.bottomBar}>
          <TouchableOpacity
            style={[ptSheet.ctaBtn, !canConfirm && { opacity: 0.45 }]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.87}
          >
            {isSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={ptSheet.ctaBtnText}>
                    {!selectedClass ? 'Elegí el tipo de gasto' : !selectedCat ? 'Elegí una categoría' : 'Clasificar gasto'}
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
          <TouchableOpacity style={ptSheet.deleteBtnRow} onPress={onReject} disabled={isSaving} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={15} color="#EF4444" />
            <Text style={ptSheet.deleteBtnText}>Rechazar gasto</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const ptSheet = StyleSheet.create({
  outerWrap:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '92%' },
  dragBar:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 20, color: '#111827' },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 20, paddingBottom: 12, gap: 20 },

  aiBanner:    { gap: 8 },
  aiBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start' },
  aiBadgeText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: '#4F46E5' },
  aiSubtitle:  { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: '#6B7280', lineHeight: 19 },

  expenseCard:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4, borderWidth: 1, borderColor: '#F3F4F6' },
  expenseIconWrap: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  expenseName:     { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: '#6366F1' },
  expenseMeta:     { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: '#9CA3AF' },
  expenseAmount:   { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: '#111827', flexShrink: 0 },

  sectionTitle: { fontFamily: 'Montserrat_600SemiBold', fontSize: 15, color: '#111827' },

  typeRow:        { flexDirection: 'row', gap: 8 },
  typeBtn:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  typeBtnInactive:{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' },
  typeBtnLabel:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 12 },

  matchCard:      { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  matchRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  matchRowActive: { backgroundColor: '#F0FDF4' },
  matchRank:      { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: '#C4C9D4', width: 16 },
  matchName:      { flex: 1, fontFamily: 'Montserrat_500Medium', fontSize: 14, color: '#374151' },
  matchPct:       { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: '#6366F1' },

  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput: { flex: 1, fontFamily: 'Montserrat_400Regular', fontSize: 14, color: '#111827', paddingVertical: 0 },

  catList:      { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  catRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16 },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  catRowActive: { backgroundColor: '#F0FDF4' },
  catIconWrap:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  catName:      { flex: 1, fontFamily: 'Montserrat_500Medium', fontSize: 14, color: '#374151' },

  bottomBar:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12, gap: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  ctaBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#15803D', borderRadius: 16, paddingVertical: 17, shadowColor: '#15803D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5 },
  ctaBtnText:   { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.2 },
  deleteBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 8 },
  deleteBtnText:{ fontFamily: 'Montserrat_500Medium', fontSize: 14, color: '#EF4444' },
});

// ─── SwipeAction ──────────────────────────────────────────────────────────────

function ConfirmSwipeAction({ progress }: { progress: Animated.AnimatedInterpolation<number> }) {
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1], extrapolate: 'clamp' });
  return (
    <View style={swipeS.confirmBox}>
      <Animated.View style={{ alignItems: 'center', gap: 4, transform: [{ scale }] }}>
        <Ionicons name="pricetag" size={28} color="#FFFFFF" />
        <Text style={swipeS.swipeLabel}>Clasificar</Text>
      </Animated.View>
    </View>
  );
}

function RejectSwipeAction({ progress }: { progress: Animated.AnimatedInterpolation<number> }) {
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1], extrapolate: 'clamp' });
  return (
    <View style={swipeS.rejectBox}>
      <Animated.View style={{ alignItems: 'center', gap: 4, transform: [{ scale }] }}>
        <Ionicons name="close-circle" size={28} color="#FFFFFF" />
        <Text style={swipeS.swipeLabel}>Rechazar</Text>
      </Animated.View>
    </View>
  );
}

const swipeS = StyleSheet.create({
  confirmBox: {
    backgroundColor: '#2E7D32', width: 90,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, marginBottom: 0,
  },
  rejectBox: {
    backgroundColor: '#C62828', width: 90,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16,
  },
  swipeLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 11, color: '#FFFFFF' },
});

// ─── AnimatedTxCard ───────────────────────────────────────────────────────────

interface AnimatedTxCardProps {
  tx: PendingTransaction;
  index: number;
  onSwipeConfirm: () => void;
  onSwipeReject: () => void;
  children: React.ReactNode;
}

export interface AnimatedTxCardHandle {
  animateOut: (direction: 'left' | 'right', callback: () => void) => void;
}

const AnimatedTxCard = forwardRef<AnimatedTxCardHandle, AnimatedTxCardProps>(
  ({ index, onSwipeConfirm, onSwipeReject, children }, ref) => {
    const swipeRef   = useRef<Swipeable>(null);

    // Entry animation (staggered)
    const mountOpacity    = useRef(new Animated.Value(0)).current;
    const mountTranslateY = useRef(new Animated.Value(14)).current;

    // Exit animation
    const exitOpacity    = useRef(new Animated.Value(1)).current;
    const translateX     = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const delay = index * 70;
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(mountOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(mountTranslateY, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }),
        ]).start();
      }, delay);
      return () => clearTimeout(timer);
    }, []);

    const animateOut = useCallback((direction: 'left' | 'right', callback: () => void) => {
      Animated.parallel([
        Animated.timing(exitOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateX,  { toValue: direction === 'right' ? 300 : -300, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        callback();
      });
    }, []);

    useImperativeHandle(ref, () => ({ animateOut }), [animateOut]);

    const handleSwipeRight = useCallback(() => {
      swipeRef.current?.close();
      hapticMedium();
      onSwipeConfirm();
    }, [onSwipeConfirm]);

    const handleSwipeLeft = useCallback(() => {
      hapticError();
      animateOut('left', onSwipeReject);
    }, [onSwipeReject, animateOut]);

    return (
      <Animated.View
        style={{
          opacity: mountOpacity,
          transform: [{ translateY: mountTranslateY }],
        }}
      >
        <Animated.View
          style={{
            opacity: exitOpacity,
            transform: [{ translateX }],
          }}
        >
          <Swipeable
            ref={swipeRef}
            renderRightActions={(progress) => <ConfirmSwipeAction progress={progress} />}
            renderLeftActions={(progress)  => <RejectSwipeAction  progress={progress} />}
            onSwipeableRightOpen={handleSwipeRight}
            onSwipeableLeftOpen={handleSwipeLeft}
            friction={2}
            rightThreshold={60}
            leftThreshold={60}
            overshootRight={false}
            overshootLeft={false}
          >
            {children}
          </Swipeable>
        </Animated.View>
      </Animated.View>
    );
  }
);

// ─── PendingTransactions ──────────────────────────────────────────────────────

export function PendingTransactions({
  transactions,
  userId,
  isPolling,
  categories,
  onConfirmed,
  confirmedExpenses = [],
}: Props) {
  const [dismissedIds,      setDismissedIds]      = useState<Set<string>>(new Set());
  const [dismissedDupeIds,  setDismissedDupeIds]  = useState<Set<string>>(new Set());
  const [updatingId,        setUpdatingId]         = useState<string | null>(null);
  const [activeTxId,        setActiveTxId]         = useState<string | null>(null);
  const [showAll,           setShowAll]            = useState(false);
  const [bulkLoading,       setBulkLoading]        = useState(false);

  // Animated toast
  const [displayedToast, setDisplayedToast] = useState<string | null>(null);
  const toastAnim       = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardRefs = useRef<Record<string, AnimatedTxCardHandle | null>>({});

  const filtered    = transactions.filter(tx => !dismissedIds.has(tx.id));
  const visible     = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hiddenCount = filtered.length - INITIAL_VISIBLE;
  const activeTx    = filtered.find(tx => tx.id === activeTxId) ?? null;

  const withSuggestion = filtered.filter(
    tx => tx.suggested_category && categories.some(c => c.name === tx.suggested_category)
  );

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setDisplayedToast(msg);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    toastTimeoutRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setDisplayedToast(null);
      });
    }, 1800);
  };

  if (filtered.length === 0 && !isPolling) return <AnimatedEmptyState />;

  // ── Clasificar ────────────────────────────────────────────────────────────
  const confirmTx = async (tx: PendingTransaction, cat: ExpenseCategory, classification: string) => {
    if (updatingId !== null) return;
    setUpdatingId(tx.id);
    setActiveTxId(null);
    try {
      const txDate = tx.transaction_date ?? new Date().toISOString().split('T')[0];

      // Check if expense was auto-created by trigger (new flow)
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('source_pending_id', tx.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from('expenses').update({
          category_id:    cat.id,
          classification: classification as ExpenseClassification,
        }).eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        // Backwards compat: pre-trigger pending transactions
        const { error } = await supabase.from('expenses').insert({
          user_id:        userId,
          amount:         tx.amount,
          description:    tx.merchant || tx.description || 'Gasto detectado',
          category_id:    cat.id,
          date:           txDate,
          payment_method: 'digital_wallet',
          classification: classification as ExpenseClassification,
          is_recurring:   false,
        });
        if (error) throw new Error(error.message);
      }

      await supabase.from('pending_transactions').update({ status: 'confirmed' }).eq('id', tx.id);

      showToast('✓ Gasto clasificado');
      const cardRef = cardRefs.current[tx.id];
      if (cardRef) {
        cardRef.animateOut('right', () => {
          setDismissedIds(prev => new Set([...prev, tx.id]));
          onConfirmed();
          checkOutgoingDebtMatch(tx.amount);
        });
      } else {
        setDismissedIds(prev => new Set([...prev, tx.id]));
        onConfirmed();
        checkOutgoingDebtMatch(tx.amount);
      }
    } catch {
      Alert.alert('Error', 'No se pudo clasificar el gasto. Intentá de nuevo.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Chequear si el gasto saliente era un pago de deuda ────────────────────
  const checkOutgoingDebtMatch = async (amount: number) => {
    const { data: groupMemberships } = await supabase
      .from('family_members')
      .select('group_id, family_groups(group_type)')
      .eq('user_id', userId);

    const friendsGroups = (groupMemberships ?? []).filter(
      (m: any) => m.family_groups?.group_type === 'friends',
    );
    if (!friendsGroups.length) return;

    for (const membership of friendsGroups) {
      const groupId = membership.group_id;

      const { data: groupMembers } = await supabase
        .from('family_members')
        .select('user_id, profiles(full_name)')
        .eq('group_id', groupId)
        .neq('user_id', userId);

      const { data: groupExpenses } = await supabase
        .from('group_expenses')
        .select('id, paid_by')
        .eq('group_id', groupId);

      if (!groupExpenses?.length) continue;

      const othersExpenseIds = (groupExpenses as any[])
        .filter((e: any) => e.paid_by !== userId)
        .map((e: any) => e.id);

      if (!othersExpenseIds.length) continue;

      const { data: splits } = await supabase
        .from('group_expense_splits')
        .select('id, user_id, amount')
        .in('group_expense_id', othersExpenseIds)
        .eq('user_id', userId)
        .eq('settled', false);

      if (!splits?.length) continue;

      const members = (groupMembers ?? []).map((m: any) => ({
        userId: m.user_id,
        fullName: m.profiles?.full_name ?? m.user_id,
      }));
      const splitsMapped = (splits as any[]).map((s: any) => ({
        id: s.id, amount: Number(s.amount), debtorUserId: s.user_id,
      }));

      const matches = matchDebt(amount, null, members, splitsMapped);
      const match = matches[0];
      if (!match) continue;

      const { data: groupData } = await supabase
        .from('family_groups')
        .select('name')
        .eq('id', groupId)
        .single();
      const groupName = groupData?.name ?? 'el grupo';

      const debtAmt = match.debtAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

      Alert.alert(
        '¿Pagaste una deuda?',
        `Este monto coincide con tu deuda de ${debtAmt} en ${groupName}.`,
        [
          {
            text: 'Sí, saldar',
            onPress: async () => {
              await supabase
                .from('group_expense_splits')
                .update({ settled: true })
                .in('id', match.splitIds);
            },
          },
          { text: 'No', style: 'cancel' },
        ],
      );
      break;
    }
  };

  // ── Rechazar ──────────────────────────────────────────────────────────────
  const rejectTx = async (txId: string) => {
    if (updatingId !== null) return;
    setUpdatingId(txId);
    try {
      // Find the expense linked to this pending transaction (if any)
      const { data: linkedExpense } = await supabase
        .from('expenses')
        .select('id')
        .eq('source_pending_id', txId)
        .is('deleted_at', null)
        .maybeSingle();

      if (linkedExpense) {
        // Check if this expense is also part of a group
        const { data: hasGroup } = await supabase
          .rpc('expense_has_group_link', { p_expense_id: linkedExpense.id });

        if (!hasGroup) {
          // Safe to soft-delete: expense is not shared with any group
          await supabase
            .from('expenses')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', linkedExpense.id);
        }
        // If hasGroup === true: leave the expense intact so group history is preserved.
        // The pending_transaction is still marked rejected below.
      }

      await supabase.from('pending_transactions').update({ status: 'rejected' }).eq('id', txId);
      showToast('Gasto rechazado');
      setDismissedIds(prev => new Set([...prev, txId]));
      onConfirmed();
    } catch {
      Alert.alert('Error', 'No se pudo rechazar el gasto.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Confirmar todas las sugeridas ─────────────────────────────────────────
  const handleBulkConfirm = async () => {
    if (bulkLoading || withSuggestion.length === 0) return;
    hapticMedium();
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
          <Ionicons name="help-circle-outline" size={14} color="#F59E0B" />
          <Text variant="label" style={{ color: '#F59E0B', fontSize: 12 }}>
            {filtered.length} SIN CLASIFICAR
          </Text>
        </View>
        {isPolling ? (
          <View style={styles.pollingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" color={colors.text.tertiary}>Buscando...</Text>
          </View>
        ) : null}
      </View>

      {/* Microcopy */}
      <Text style={styles.statsNotice}>
        Ya están cargados en tus gastos. Solo elegí la categoría para clasificarlos.
      </Text>

      {/* Swipe hint */}
      <View style={styles.swipeHint}>
        <Ionicons name="swap-horizontal-outline" size={11} color={colors.text.tertiary} />
        <Text style={styles.swipeHintText}>
          Deslizá para revisar rápido · → clasificar · ← rechazar
        </Text>
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
            {bulkLoading ? 'Clasificando...' : `Clasificar ${withSuggestion.length} con categoría sugerida`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Cards */}
      {visible.map((tx, index) => {
        const dateLabel    = formatDateLabel(tx.transaction_date);
        const suggestedCat = categories.find(c => c.name === tx.suggested_category);
        const isLoading    = updatingId === tx.id;
        const isDuplicate  = isPossibleDuplicate(tx, confirmedExpenses);

        return (
          <AnimatedTxCard
            key={tx.id}
            tx={tx}
            index={index}
            onSwipeConfirm={() => !isLoading && setActiveTxId(tx.id)}
            onSwipeReject={() => rejectTx(tx.id)}
            ref={(ref) => { cardRefs.current[tx.id] = ref; }}
          >
            <PressScaleCard
              onPress={() => !isLoading && setActiveTxId(tx.id)}
              disabled={isLoading}
            >
              <Card style={styles.card}>

                {/* Duplicate warning — compact single-line */}
                {isDuplicate && !dismissedDupeIds.has(tx.id) && (
                  <View style={styles.dupeBanner}>
                    <Ionicons name="warning-outline" size={12} color="#E65100" />
                    <Text style={styles.dupeText} numberOfLines={1}>
                      Puede estar repetido — monto y fecha similares
                    </Text>
                    <TouchableOpacity
                      onPress={() => setDismissedDupeIds(prev => new Set([...prev, tx.id]))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={13} color="#E65100" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Top: info + amount */}
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.merchantName} numberOfLines={1}>
                      {tx.merchant ?? 'Comercio desconocido'}
                    </Text>
                    <View style={styles.metaRow}>
                      <SourceBadge source={tx.source} />
                      {dateLabel && (
                        <Text style={styles.dateLabel}>
                          {dateLabel}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    {isLoading
                      ? <ActivityIndicator size="small" color={colors.neon} />
                      : <View style={styles.pendingBadge}>
                          <View style={styles.pendingDot} />
                          <Text style={styles.pendingBadgeText}>Sin clasificar</Text>
                        </View>
                    }
                    <Text style={styles.amount}>
                      ${tx.amount.toLocaleString('es-AR')}
                    </Text>
                  </View>
                </View>

                {/* AI suggestion */}
                {suggestedCat && (
                  <View style={styles.aiSuggest}>
                    <Ionicons name="sparkles-outline" size={11} color={colors.primary} />
                    <Text variant="caption" color={colors.primary}>
                      Sugerido:{' '}
                      <Text variant="caption" style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.text.primary }}>
                        {suggestedCat.name_es}
                      </Text>
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={suggestedCat ? styles.confirmQuickBtn : styles.categorizarBtn}
                    onPress={() => !isLoading && setActiveTxId(tx.id)}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={13}
                      color={suggestedCat ? colors.neon : colors.primary}
                    />
                    <Text
                      variant="caption"
                      color={suggestedCat ? colors.neon : colors.primary}
                      style={{ fontFamily: 'Montserrat_600SemiBold' }}
                    >
                      Clasificar
                    </Text>
                  </TouchableOpacity>

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
            </PressScaleCard>
          </AnimatedTxCard>
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
            onReject={() => { setActiveTxId(null); rejectTx(activeTx.id); }}
            isSaving={updatingId === activeTx.id}
          />
        )}
      </Modal>

      {/* Toast de feedback — animated slide-up */}
      {displayedToast && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [{
                translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
              }],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={displayedToast.includes('clasificado') ? 'checkmark-circle' : 'close-circle'}
            size={15}
            color={displayedToast.includes('clasificado') ? colors.primary : colors.red}
          />
          <Text style={[
            styles.toastText,
            { color: displayedToast.includes('clasificado') ? colors.primary : colors.red },
          ]}>
            {displayedToast}
          </Text>
        </Animated.View>
      )}

    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing[4] },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pollingRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },

  statsNotice: {
    fontFamily: 'Montserrat_400Regular', fontSize: 12,
    color: '#9E9E9E', lineHeight: 17, marginTop: -spacing[2],
  },

  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    paddingHorizontal: spacing[1], marginTop: -spacing[2],
  },
  swipeHintText: {
    fontFamily: 'Montserrat_400Regular', fontSize: 10, color: colors.text.tertiary,
  },

  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF8E1', borderRadius: 999,
    paddingHorizontal: spacing[2], paddingVertical: 3,
    borderWidth: 1, borderColor: '#FFE082',
  },
  pendingDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F59E0B' },
  pendingBadgeText:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 10, color: '#F59E0B' },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999, paddingHorizontal: spacing[4], paddingVertical: spacing[2],
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 12, elevation: 6,
    marginTop: spacing[2],
  },
  toastText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 13 },

  emptyState: {
    alignItems: 'center', gap: spacing[3],
    paddingVertical: spacing[10],
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle:   { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: '#212121' },
  emptySubtext: { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: '#9E9E9E', textAlign: 'center' },

  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: colors.primary, borderRadius: 12,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    alignSelf: 'stretch', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  bulkBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: colors.white },

  dupeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: '#FFF3E0', borderRadius: 8,
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderWidth: 1, borderColor: '#FFE0B2',
  },
  dupeText: { flex: 1, fontFamily: 'Montserrat_500Medium', fontSize: 11, color: '#E65100' },

  card: {
    padding: spacing[4], gap: spacing[3],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  cardInfo: { flex: 1, gap: 5 },
  merchantName: {
    fontFamily: 'Montserrat_700Bold', fontSize: 15,
    color: '#1A1A1A', letterSpacing: -0.2,
  },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dateLabel:{ fontFamily: 'Montserrat_400Regular', fontSize: 11, color: '#BDBDBD' },
  cardRight:{ alignItems: 'flex-end', gap: spacing[1], flexShrink: 0 },
  amount:   {
    fontFamily: 'Montserrat_700Bold', fontSize: 20,
    color: '#1A1A1A', letterSpacing: -0.5, lineHeight: 24,
  },

  aiSuggest: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    backgroundColor: colors.primary + '12', borderRadius: 8,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },

  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border.subtle,
  },
  confirmQuickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: spacing[3], borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.neon + '60',
    backgroundColor: colors.neon + '0E',
  },
  categorizarBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: spacing[3], borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.primary + '60',
    backgroundColor: colors.primary + '0E',
  },
  editBtn: {
    padding: spacing[2],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.secondary,
  },

  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[3] },
});
