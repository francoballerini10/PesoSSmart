import React, { useRef } from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  StyleSheet,
  View,
  Animated,
} from 'react-native';
import { colors, spacing, layout } from '@/theme';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'neon';
type ButtonSize    = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  label:      string;
  isLoading?: boolean;
  leftIcon?:  React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { bg: string; border: string; text: string; shadow?: boolean }> = {
  primary:   { bg: colors.primary,        border: colors.primary,        text: colors.white,        shadow: true  },
  neon:      { bg: colors.primary,        border: colors.primary,        text: colors.white,        shadow: true  },
  secondary: { bg: colors.bg.secondary,   border: colors.border.default, text: colors.text.primary, shadow: false },
  ghost:     { bg: colors.transparent,    border: colors.border.default, text: colors.text.primary, shadow: false },
  danger:    { bg: colors.red,            border: colors.red,            text: colors.white,        shadow: false },
};

const sizeStyles: Record<ButtonSize, { height: number; px: number; fontSize: number; radius: number }> = {
  sm: { height: layout.buttonHeightSm, px: spacing[4], fontSize: 14, radius: 10 },
  md: { height: layout.buttonHeight,   px: spacing[6], fontSize: 16, radius: 12 },
  lg: { height: layout.buttonHeight + 8, px: spacing[8], fontSize: 16, radius: 14 },
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Button({
  variant    = 'primary',
  size       = 'md',
  label,
  isLoading  = false,
  leftIcon,
  rightIcon,
  fullWidth  = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const vs         = variantStyles[variant];
  const ss         = sizeStyles[size];
  const isDisabled = disabled || isLoading;

  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
    onPressIn?.(e);
  };
  const handlePressOut = (e: any) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 5 }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedTouchable
      activeOpacity={0.85}
      disabled={isDisabled}
      style={[
        styles.base,
        {
          backgroundColor:  vs.bg,
          borderColor:      vs.border,
          height:           ss.height,
          paddingHorizontal: ss.px,
          borderRadius:     ss.radius,
          opacity:          isDisabled ? 0.5 : 1,
          alignSelf:        fullWidth ? 'stretch' : 'auto',
          transform:        [{ scale }],
          ...(vs.shadow ? shadowStyle : {}),
        },
        style,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={vs.text} size="small" />
      ) : (
        <View style={styles.inner}>
          {leftIcon  && <View style={styles.iconLeft}>{leftIcon}</View>}
          <Text variant="button" style={{ color: vs.text, fontSize: ss.fontSize }}>
            {label}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </AnimatedTouchable>
  );
}

const shadowStyle = {
  shadowColor:   colors.primary,
  shadowOffset:  { width: 0, height: 3 },
  shadowOpacity: 0.28,
  shadowRadius:  8,
  elevation:     4,
};

const styles = StyleSheet.create({
  base: {
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
  },
  inner: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconLeft:  { marginRight: spacing[2] },
  iconRight: { marginLeft:  spacing[2] },
});
