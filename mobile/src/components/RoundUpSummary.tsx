/**
 * RoundUpSummary — Widget que muestra los ahorros acumulados por redondeo.
 *
 * Muestra: total de esta semana, este mes, y all-time.
 * Si el redondeo está desactivado muestra un CTA para activarlo.
 * Se usa en home.tsx y savings.tsx.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text } from '@/components/ui/Text';
import { formatCurrency } from '@/utils/format';
import type { RoundDest, RoundTo } from '@/store/roundUpStore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  enabled:         boolean;
  roundTo:         RoundTo;
  destination:     RoundDest;
  totalThisWeek:   number;
  totalThisMonth:  number;
  totalAllTime:    number;
  onConfigure:     () => void;   // abre el modal de configuración
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEST_LABEL: Record<RoundDest, string> = {
  fci:     'FCI Money Market',
  savings: 'Ahorro en efectivo',
};

const DEST_ICON: Record<RoundDest, string> = {
  fci:     'trending-up-outline',
  savings: 'wallet-outline',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function RoundUpSummary({
  enabled,
  roundTo,
  destination,
  totalThisWeek,
  totalThisMonth,
  totalAllTime,
  onConfigure,
}: Props) {
  // ── Desactivado — CTA ────────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <TouchableOpacity style={styles.cta} onPress={onConfigure} activeOpacity={0.85}>
        <View style={styles.ctaLeft}>
          <View style={styles.ctaIconWrap}>
            <Ionicons name="magnet-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.ctaText}>
            <Text variant="label" color={colors.text.secondary}>REDONDEO AUTOMÁTICO</Text>
            <Text variant="caption" color={colors.text.tertiary} style={{ lineHeight: 17 }}>
              Acumulá ahorro sin esfuerzo con cada gasto
            </Text>
          </View>
        </View>
        <View style={styles.ctaBadge}>
          <Text style={styles.ctaBadgeText}>Activar</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Activado — resumen ────────────────────────────────────────────────────────
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Ionicons name="magnet-outline" size={16} color={colors.primary} />
          </View>
          <View>
            <Text variant="label" color={colors.text.tertiary}>REDONDEO AUTOMÁTICO</Text>
            <View style={styles.configRow}>
              <Ionicons name={DEST_ICON[destination] as any} size={11} color={colors.text.tertiary} />
              <Text variant="caption" color={colors.text.tertiary}>
                Al siguiente ${roundTo} → {DEST_LABEL[destination]}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onConfigure} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="settings-outline" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <StatBox
          label="Esta semana"
          value={totalThisWeek}
          color={colors.primary}
          icon="calendar-outline"
        />
        <View style={styles.statDivider} />
        <StatBox
          label="Este mes"
          value={totalThisMonth}
          color={colors.neon}
          icon="trending-up-outline"
        />
        <View style={styles.statDivider} />
        <StatBox
          label="Total"
          value={totalAllTime}
          color="#A78BFA"
          icon="layers-outline"
        />
      </View>

      {/* Motivacional */}
      {totalThisWeek > 0 && (
        <View style={styles.motivRow}>
          <Ionicons name="sparkles-outline" size={13} color={colors.yellow} />
          <Text variant="caption" color={colors.text.secondary} style={{ flex: 1, lineHeight: 17 }}>
            Esta semana juntaste{' '}
            <Text variant="caption" color={colors.yellow} style={{ fontFamily: 'Montserrat_700Bold' }}>
              {formatCurrency(totalThisWeek)}
            </Text>{' '}
            solo con redondeos. Sin darte cuenta.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: string;
}) {
  return (
    <View style={sbStyles.box}>
      <View style={[sbStyles.iconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={13} color={color} />
      </View>
      <Text style={[sbStyles.amount, { color }]}>{formatCurrency(value)}</Text>
      <Text variant="caption" color={colors.text.tertiary} style={sbStyles.label}>{label}</Text>
    </View>
  );
}

const sbStyles = StyleSheet.create({
  box:     { flex: 1, alignItems: 'center', gap: spacing[1] },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  amount:  { fontFamily: 'Montserrat_700Bold', fontSize: 14 },
  label:   { textAlign: 'center', lineHeight: 14 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // CTA (desactivado)
  cta: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.bg.card,
    borderWidth:     1,
    borderColor:     colors.border.default,
    borderRadius:    16,
    padding:         spacing[4],
  },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
  ctaIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText:      { gap: 2, flex: 1 },
  ctaBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: 20, paddingHorizontal: spacing[3], paddingVertical: spacing[1],
  },
  ctaBadgeText: { fontFamily: 'Montserrat_700Bold', fontSize: 12, color: colors.primary },

  // Activado
  card: {
    backgroundColor: colors.bg.card,
    borderWidth:     1,
    borderColor:     colors.border.default,
    borderRadius:    16,
    padding:         spacing[4],
    gap:             spacing[3],
  },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
  iconWrap:    { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  configRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginTop: 1 },
  stats:       { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  statDivider: { width: 1, height: 40, backgroundColor: colors.border.subtle },
  motivRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2],
    backgroundColor: colors.yellow + '0C', borderRadius: 8, padding: spacing[3],
  },
});
