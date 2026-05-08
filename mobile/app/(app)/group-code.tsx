import React from 'react';
import {
  View, StyleSheet, TouchableOpacity, Share, Clipboard, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  purple:   '#8B5CF6',
  purpleLt: '#F3EEFF',
  text:     '#111111',
  text2:    '#444444',
  muted:    '#757575',
  border:   '#E5E7EB',
} as const;

const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// ─── QR placeholder (visual decorative grid) ──────────────────────────────────

function QRPlaceholder({ code }: { code: string }) {
  // Deterministic pattern based on code characters
  const bits = code.split('').flatMap(c => {
    const n = c.charCodeAt(0);
    return [n & 1, (n >> 1) & 1, (n >> 2) & 1, (n >> 3) & 1,
            (n >> 4) & 1, (n >> 5) & 1, (n >> 6) & 1, (n >> 7) & 1];
  });

  const size = 7;
  const cellSize = 22;

  // Build a 7x7 matrix
  const grid: number[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      // Force corners (QR finder patterns)
      if ((row < 2 && col < 2) || (row < 2 && col >= size - 2) || (row >= size - 2 && col < 2)) return 1;
      return bits[(row * size + col) % bits.length] ?? 0;
    })
  );

  return (
    <View style={qr.wrapper}>
      {grid.map((row, ri) => (
        <View key={ri} style={qr.row}>
          {row.map((cell, ci) => (
            <View
              key={ci}
              style={[
                qr.cell,
                { backgroundColor: cell ? C.purple : 'transparent', width: cellSize, height: cellSize },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const qr = StyleSheet.create({
  wrapper: { gap: 2 },
  row:     { flexDirection: 'row', gap: 2 },
  cell:    { borderRadius: 3 },
});

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function GroupCodeScreen() {
  const { code = '', groupName = 'tu grupo' } = useLocalSearchParams<{
    code: string;
    groupName: string;
  }>();

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Unite a "${groupName}" en PesoSmart. Código: ${code}`,
      });
    } catch {}
  };

  const handleCopy = () => {
    Clipboard.setString(code);
    Alert.alert('Copiado', `El código ${code} fue copiado al portapapeles.`);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Código de tu grupo</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.body}>

        {/* QR icon */}
        <View style={s.qrIconWrap}>
          <Ionicons name="qr-code" size={42} color={C.purple} />
        </View>

        <Text style={s.headline}>
          Compartí este código para invitar a otras personas a tu grupo
        </Text>

        {/* Card */}
        <View style={s.codeCard}>
          <Text style={s.codeValue}>{code}</Text>
          <Text style={s.codeSub}>Código de tu grupo</Text>

          <View style={s.qrArea}>
            <QRPlaceholder code={code} />
          </View>
        </View>

        <Text style={s.disclaimer}>
          Este código es único y cualquiera puede usarlo para unirse a tu grupo.
        </Text>

        {/* Buttons */}
        <View style={s.btnGroup}>
          <TouchableOpacity style={s.btnPrimary} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color={C.white} />
            <Text style={s.btnPrimaryText}>Compartir código</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={handleCopy} activeOpacity={0.85}>
            <Ionicons name="copy-outline" size={18} color={C.purple} />
            <Text style={s.btnSecondaryText}>Copiar código</Text>
          </TouchableOpacity>
        </View>

      </View>

    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: sp.xl, paddingVertical: sp.md,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  headerTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text, letterSpacing: -0.2 },

  body: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: sp.xl, paddingTop: sp.xxxl,
    gap: sp.xl,
  },

  qrIconWrap: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: C.purpleLt,
    alignItems: 'center', justifyContent: 'center',
  },

  headline: {
    fontFamily: 'Montserrat_600SemiBold', fontSize: 16, color: C.text,
    textAlign: 'center', lineHeight: 24, maxWidth: 280,
  },

  codeCard: {
    width: '100%', backgroundColor: C.white, borderRadius: 24,
    padding: sp.xxl, alignItems: 'center', gap: sp.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
  },
  codeValue: {
    fontFamily: 'Montserrat_800ExtraBold', fontSize: 38,
    color: C.purple, letterSpacing: 8,
  },
  codeSub: { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted },

  qrArea: {
    padding: sp.lg, backgroundColor: C.bg, borderRadius: 16,
    marginTop: sp.sm,
  },

  disclaimer: {
    fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted,
    textAlign: 'center', lineHeight: 19, maxWidth: 280,
  },

  btnGroup: { width: '100%', gap: sp.md },
  btnPrimary: {
    backgroundColor: C.purple, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    paddingVertical: 16,
    shadowColor: C.purple, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  btnPrimaryText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },
  btnSecondary: {
    backgroundColor: C.purpleLt, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    paddingVertical: 16,
    borderWidth: 1.5, borderColor: C.purple + '40',
  },
  btnSecondaryText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.purple },
});
