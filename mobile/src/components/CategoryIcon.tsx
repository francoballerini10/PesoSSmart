import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { CATEGORY_ICON_MAP, resolveCategoryIcon } from '@/lib/categoryIcons';

interface Props {
  categoryName?: string;
  description?: string;
  size?: number;
}

export function CategoryIcon({ categoryName = '', description = '', size = 48 }: Props) {
  const [useFallback, setUseFallback] = useState(false);
  const key = resolveCategoryIcon(categoryName, description);
  const source = useFallback ? CATEGORY_ICON_MAP['otros'] : CATEGORY_ICON_MAP[key];

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => {
          if (__DEV__) console.warn('Missing category icon:', key);
          if (!useFallback) setUseFallback(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 0, overflow: 'hidden' },
});
