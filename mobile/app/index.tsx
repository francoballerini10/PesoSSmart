import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

/**
 * Punto de entrada — redirige según estado de sesión y onboarding
 */
export default function Index() {
  const { session, profile } = useAuthStore();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profile && !profile.onboarding_completed) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  return <Redirect href="/(app)/home" />;
}
