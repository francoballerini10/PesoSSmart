import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { colors } from '@/theme';
import { LoadingScreen } from '@/components/ui';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission, registerPushToken } from '@/lib/notifications';
import { onSessionExpired } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { initialize, user } = useAuthStore();
  const { subscribeToRealtime, unsubscribeFromRealtime } = usePlanStore();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    subscribeToRealtime(user.id, () => {
      Alert.alert(
        '🎉 ¡Plan activado!',
        '¡Bienvenido a la comunidad Premium! Todas tus funciones ya están activas.',
        [{ text: '¡Gracias!' }],
      );
    });
    return () => unsubscribeFromRealtime();
  }, [user?.id]);

  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    initialize()
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const unsub = onSessionExpired(() => {
      console.warn('[Auth] Sesión expirada — redirigiendo al login');
      router.replace('/(auth)/login');
    });
    return unsub;
  }, []);

  const isReady = (fontsLoaded || !!fontError) && authReady;

  // Registrar push token en Supabase cuando el usuario ya está listo
  useEffect(() => {
    if (isReady && user?.id) {
      registerPushToken(supabase, user.id).catch(() => {});
    }
  }, [isReady, user?.id]);

  // Ocultar splash + pedir permisos
  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {});
      requestNotificationPermission().catch(() => {});
    }
  }, [isReady]);

  // Navegar a la pantalla correcta cuando el usuario toca una notificación push
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route as string | undefined;
      if (route) {
        router.push(route as any);
      }
    });
    return () => sub.remove();
  }, []);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.bg.primary} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
