import React, { useRef } from 'react';
import { View, ViewProps, StyleSheet, TouchableOpacity, TouchableOpacityProps, Animated } from 'react-native';
import { colors, layout } from '@/theme';

type CardVariant = 'default' | 'elevated' | 'neon' | 'danger';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: number;
}

interface PressableCardProps extends TouchableOpacityProps {
  variant?: CardVariant;
  padding?: number;
}

const variantBorders: Record<CardVariant, string> = {
  default:  colors.border.default,
  elevated: colors.border.default,
  neon:     colors.border.primary,
  danger:   colors.border.error,
};

const variantBgs: Record<CardVariant, string> = {
  default:  colors.bg.card,
  elevated: colors.bg.elevated,
  neon:     colors.primary + '0D',
  danger:   colors.red + '0D',
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Card({
  variant = 'default',
  padding = layout.cardPadding,
  style,
  children,
  ...props
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: variantBgs[variant],
          borderColor:     variantBorders[variant],
          padding,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function PressableCard({
  variant  = 'default',
  padding  = layout.cardPadding,
  style,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 60,
      bounciness: 0,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
      bounciness: 4,
    }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedTouchable
      activeOpacity={0.88}
      style={[
        styles.base,
        {
          backgroundColor: variantBgs[variant],
          borderColor:     variantBorders[variant],
          padding,
          transform: [{ scale }],
        },
        style,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      {children}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth:    1,
    borderRadius:   18,
    overflow:       'hidden',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.07,
    shadowRadius:   10,
    elevation:      3,
  },
});
