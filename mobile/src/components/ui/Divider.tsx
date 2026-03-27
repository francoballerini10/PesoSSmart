import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

interface DividerProps {
  spacing?: number;
  color?: string;
}

export function Divider({ spacing: sp = spacing[4], color = colors.border.subtle }: DividerProps) {
  return (
    <View style={[styles.divider, { marginVertical: sp, backgroundColor: color }]} />
  );
}

const styles = StyleSheet.create({
  divider: {
    width: '100%',
    height: 1,
  },
});
