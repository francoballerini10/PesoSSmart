import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { colors, textVariants, fontFamilies } from '@/theme';

type TextVariant = keyof typeof textVariants;

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export function Text({
  variant = 'body',
  color = colors.text.primary,
  align = 'left',
  style,
  children,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[
        textVariants[variant],
        { color, textAlign: align },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}
