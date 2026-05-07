import React from 'react';
import { View, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { Text } from '@/components/ui';

export interface VisitFeature {
  icon:  string;
  color: string;
  title: string;
  body:  string;
}

interface Props {
  visible:     boolean;
  screenTitle: string;
  screenIcon:  string;
  iconColor:   string;
  features:    VisitFeature[];
  onDismiss:   () => void;
}

export function FirstVisitSheet({ visible, screenTitle, screenIcon, iconColor, features, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onDismiss} />
        <View style={styles.sheet}>
          <View style={styles.dragBar} />

          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: iconColor + '18' }]}>
              <Ionicons name={screenIcon as any} size={26} color={iconColor} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h4" color={colors.text.primary}>{screenTitle}</Text>
              <Text variant="caption" color={colors.text.tertiary}>
                Esto es lo que podés hacer acá
              </Text>
            </View>
          </View>

          <View style={styles.features}>
            {features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: f.color + '15' }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="labelMd" color={colors.text.primary}>{f.title}</Text>
                  <Text variant="caption" color={colors.text.secondary} style={{ lineHeight: 17 }}>
                    {f.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: iconColor }]}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>¡Entendido!</Text>
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg.primary,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing[5], paddingBottom: spacing[10], gap: spacing[5],
  },
  dragBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border.default,
    alignSelf: 'center', marginBottom: spacing[1],
  },
  heroRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[4],
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  features:    { gap: spacing[4] },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4],
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 1,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[2], borderRadius: 14, paddingVertical: spacing[4],
    marginTop: spacing[2],
  },
  btnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: '#fff' },
});
