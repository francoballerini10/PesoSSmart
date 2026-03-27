import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { colors, spacing, layout } from '@/theme';
import { Text, Card, PressableCard, Button, Input, Badge } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useExpensesStore } from '@/store/expensesStore';
import { formatCurrency, formatDate } from '@/utils/format';
import type { PaymentMethod, Expense } from '@/types';

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

export default function ExpensesScreen() {
  const { user } = useAuthStore();
  const {
    expenses,
    categories,
    totalThisMonth,
    totalNecessary,
    totalDisposable,
    fetchExpenses,
    fetchCategories,
    addExpense,
    isLoading,
    filter,
    setFilter,
  } = useExpensesStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');

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

  useEffect(() => {
    if (user?.id) {
      fetchExpenses(user.id);
      fetchCategories();
    }
  }, [user?.id, filter]);

  const onSubmit = async (data: ExpenseFormData) => {
    if (!user?.id) return;
    try {
      await addExpense(user.id, {
        description: data.description,
        amount: parseFloat(data.amount.replace(',', '.')),
        date: data.date,
        payment_method: selectedPayment,
        category_id: selectedCategory ?? undefined,
        notes: data.notes || null,
        is_recurring: false,
      });
      reset();
      setShowAddModal(false);
      setSelectedCategory(null);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el gasto. Intentá de nuevo.');
    }
  };

  const classificationFilter = filter.classification;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h4">Mis Gastos</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={22} color={colors.black} />
        </TouchableOpacity>
      </View>

      {/* Resumen */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text variant="caption" color={colors.text.secondary}>TOTAL MES</Text>
          <Text variant="number" color={colors.text.primary}>{formatCurrency(totalThisMonth)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text variant="caption" color={colors.red}>PRESCINDIBLE</Text>
          <Text variant="labelMd" color={colors.red}>{formatCurrency(totalDisposable)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text variant="caption" color={colors.neon}>NECESARIO</Text>
          <Text variant="labelMd" color={colors.neon}>{formatCurrency(totalNecessary)}</Text>
        </View>
      </View>

      {/* Filtros de clasificación */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {[
          { key: null, label: 'Todos' },
          { key: 'necessary', label: 'Necesario' },
          { key: 'disposable', label: 'Prescindible' },
          { key: 'investable', label: 'Invertible' },
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
              style={{ fontSize: 10 }}
              color={classificationFilter === f.key ? colors.neon : colors.text.secondary}
            >
              {f.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lista */}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {expenses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={colors.text.tertiary} />
            <Text variant="body" color={colors.text.secondary} align="center">
              {isLoading ? 'Cargando...' : 'No hay gastos este mes.'}
            </Text>
            <TouchableOpacity onPress={() => setShowAddModal(true)}>
              <Text variant="bodySmall" color={colors.neon}>
                + Agregar gasto
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          expenses.map((expense) => (
            <ExpenseItem key={expense.id} expense={expense} />
          ))
        )}
      </ScrollView>

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

              <Controller
                control={control}
                name="amount"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="MONTO (ARS)"
                    placeholder="0"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.amount?.message}
                    keyboardType="decimal-pad"
                    leftIcon={<Text variant="body" color={colors.text.secondary}>$</Text>}
                  />
                )}
              />

              {/* Categorías */}
              <View>
                <Text variant="label" color={colors.text.secondary} style={styles.inputLabel}>
                  CATEGORÍA
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryList}
                >
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        selectedCategory === cat.id && styles.categoryChipActive,
                      ]}
                      onPress={() =>
                        setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
                      }
                    >
                      <Text
                        variant="caption"
                        color={selectedCategory === cat.id ? colors.neon : colors.text.secondary}
                      >
                        {cat.name_es}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
                        color={selectedPayment === pm.value ? colors.black : colors.text.secondary}
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
    </SafeAreaView>
  );
}

function ExpenseItem({ expense }: { expense: Expense }) {
  return (
    <PressableCard style={styles.expenseItem}>
      <View style={styles.expenseRow}>
        <View style={styles.expenseLeft}>
          <View style={styles.expenseTitleRow}>
            <Text variant="bodySmall" color={colors.text.primary} numberOfLines={1} style={{ flex: 1 }}>
              {expense.description}
            </Text>
            {expense.classification && (
              <Badge classification={expense.classification} small />
            )}
          </View>
          <View style={styles.expenseMeta}>
            <Text variant="caption" color={colors.text.secondary}>{formatDate(expense.date)}</Text>
            {expense.category && (
              <>
                <Text variant="caption" color={colors.text.tertiary}> · </Text>
                <Text variant="caption" color={colors.text.secondary}>{expense.category.name_es}</Text>
              </>
            )}
          </View>
          {expense.classification_explanation && (
            <Text variant="caption" color={colors.text.tertiary} numberOfLines={2} style={{ marginTop: spacing[1] }}>
              {expense.classification_explanation}
            </Text>
          )}
        </View>
        <Text
          variant="labelMd"
          color={
            expense.classification === 'investable'
              ? colors.neon
              : expense.classification === 'disposable'
              ? colors.red
              : colors.text.primary
          }
        >
          {formatCurrency(expense.amount)}
        </Text>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  addBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing[2],
  },
  summaryItem: { flex: 1, gap: spacing[1] },
  summaryDivider: { width: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing[3] },
  filters: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  filterChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  filterChipActive: {
    borderColor: colors.neon,
    backgroundColor: colors.neon + '11',
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing[8],
    gap: spacing[2],
  },
  empty: {
    paddingVertical: spacing[16],
    alignItems: 'center',
    gap: spacing[4],
  },
  expenseItem: { padding: spacing[4] },
  expenseRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  expenseLeft: { flex: 1, marginRight: spacing[3], gap: spacing[1] },
  expenseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  expenseMeta: { flexDirection: 'row', alignItems: 'center' },
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
  categoryChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  categoryChipActive: {
    borderColor: colors.neon,
    backgroundColor: colors.neon + '11',
  },
  paymentList: { gap: spacing[2] },
  paymentChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  paymentChipActive: {
    borderColor: colors.neon,
    backgroundColor: colors.neon,
  },
});
