import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { WidgetData } from '@/lib/widgetEngine';

interface Props {
  widgets:        WidgetData[];
  onPress:        (type: string) => void;
  onSwipeStart?:  () => void;
  onSwipeEnd?:    () => void;
}

const ROTATION_MS  = 6000;
const SWIPE_THRESH = 40;

export function SmartWidget({ widgets, onPress, onSwipeStart, onSwipeEnd }: Props) {
  const [idx, setIdx]    = useState(0);
  const idxRef           = useRef(0);
  const widgetsRef       = useRef(widgets);
  const scaleAnim        = useRef(new Animated.Value(1)).current;
  const fadeAnim         = useRef(new Animated.Value(1)).current;
  const autoTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeToRef        = useRef<(n: number) => void>(() => {});
  const resetTimerRef    = useRef<() => void>(() => {});

  // Keep widgetsRef current on every render
  widgetsRef.current = widgets;

  const data = widgets[idx] ?? widgets[0];

  // Keep callbacks in refs so PanResponder never goes stale
  const onSwipeStartRef = useRef(onSwipeStart);
  const onSwipeEndRef   = useRef(onSwipeEnd);
  useEffect(() => { onSwipeStartRef.current = onSwipeStart; }, [onSwipeStart]);
  useEffect(() => { onSwipeEndRef.current   = onSwipeEnd;   }, [onSwipeEnd]);

  // Wire stable refs so PanResponder callbacks never go stale
  useEffect(() => {
    fadeToRef.current = (nextIdx: number) => {
      Animated.timing(fadeAnim, {
        toValue: 0, duration: 200, useNativeDriver: true,
      }).start(() => {
        idxRef.current = nextIdx;
        setIdx(nextIdx);
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 300, useNativeDriver: true,
        }).start();
      });
    };

    resetTimerRef.current = () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (widgetsRef.current.length <= 1) return;
      autoTimerRef.current = setInterval(() => {
        fadeToRef.current((idxRef.current + 1) % widgetsRef.current.length);
      }, ROTATION_MS);
    };
  });

  // Auto-rotate — restarts whenever widget count changes
  useEffect(() => {
    resetTimerRef.current();
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [widgets.length]);

  // Fade in + reset to first when widget list identity changes (after data load)
  useEffect(() => {
    fadeAnim.setValue(0);
    idxRef.current = 0;
    setIdx(0);
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();
  }, [widgets]);

  const panResponder = useRef(
    PanResponder.create({
      // Capture horizontal-dominant moves before the ScrollView gets them
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        onSwipeStartRef.current?.();
      },
      onPanResponderRelease: (_, g) => {
        onSwipeEndRef.current?.();
        const len = widgetsRef.current.length;
        if (g.dx < -SWIPE_THRESH) {
          fadeToRef.current((idxRef.current + 1) % len);
          resetTimerRef.current();
        } else if (g.dx > SWIPE_THRESH) {
          fadeToRef.current((idxRef.current - 1 + len) % len);
          resetTimerRef.current();
        }
      },
      onPanResponderTerminate: () => {
        onSwipeEndRef.current?.();
      },
    }),
  ).current;

  const pressIn  = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  if (!data) return null;

  return (
    <Animated.View
      style={{ transform: [{ scale: scaleAnim }], opacity: fadeAnim }}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={[s.card, { backgroundColor: data.cardBg, shadowColor: data.cardBg }]}
        onPress={() => onPress(data.type)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        {/* Left: text content */}
        <View style={s.content}>
          <View style={[s.badge, { backgroundColor: data.accent + '28' }]}>
            <Text style={[s.badgeText, { color: data.accent }]}>
              {data.title}
            </Text>
          </View>

          <Text
            style={s.headline}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {data.headline}
          </Text>

          <Text style={s.body} numberOfLines={2}>
            {data.body}
          </Text>

          <View style={[s.cta, { borderColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={s.ctaText}>{data.cta}</Text>
            <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
          </View>
        </View>

        {/* Right: emoji + dots */}
        <View style={s.deco} pointerEvents="none">
          <Text style={s.emoji}>{data.emoji}</Text>
          {widgets.length > 1 && (
            <View style={s.dots}>
              {widgets.map((_, i) => (
                <View
                  key={i}
                  style={[s.dot, i === idx && s.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius:      22,
    paddingHorizontal: 22,
    paddingVertical:   22,
    flexDirection:     'row',
    alignItems:        'center',
    gap:          8,
    shadowOffset:      { width: 0, height: 8 },
    shadowOpacity:     0.4,
    shadowRadius:      20,
    elevation:         10,
  },
  content: {
    flex:         1,
    gap:          spacing[2],
    paddingRight: 12,
  },
  badge: {
    alignSelf:         'flex-start',
    borderRadius:      6,
    paddingHorizontal: 8,
    paddingVertical:   3,
    marginBottom:      spacing[1],
  },
  badgeText: {
    fontFamily:    'Montserrat_700Bold',
    fontSize:      9,
    letterSpacing: 1.2,
  },
  headline: {
    color:         '#FFFFFF',
    fontFamily:    'Montserrat_700Bold',
    fontSize:      26,
    lineHeight:    30,
    letterSpacing: -0.5,
  },
  body: {
    color:      'rgba(255,255,255,0.75)',
    fontFamily: 'Montserrat_400Regular',
    fontSize:   13,
    lineHeight: 18,
  },
  cta: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[2],
    backgroundColor:   'rgba(255,255,255,0.15)',
    borderRadius:      12,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[3],
    alignSelf:         'flex-start',
    marginTop:         spacing[2],
    height:            42,
    borderWidth:       1,
  },
  ctaText: {
    color:      '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize:   13,
  },
  deco: {
    flexShrink:     0,
    alignItems:     'center',
    justifyContent: 'center',
    width:          72,
    gap:            8,
  },
  emoji: {
    fontSize:   46,
    lineHeight: 54,
    textAlign:  'center',
  },
  dots: {
    flexDirection: 'row',
    gap:           4,
  },
  dot: {
    width:        5,
    height:       5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    width:           10,
  },
});
