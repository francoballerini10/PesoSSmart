import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type BudgetPlan } from './budgetPlan';
import { formatCurrency } from '@/utils/format';

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

const STORAGE_KEY  = 'budget_notif_timestamps';
const COOLDOWN_MS  = 24 * 60 * 60 * 1000; // once per category per day

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function checkAndNotifyBudgetLimits(plan: BudgetPlan): Promise<void> {
  const permitted = await requestNotificationPermissions();
  if (!permitted) return;

  const raw  = await AsyncStorage.getItem(STORAGE_KEY);
  const sent: Record<string, number> = raw ? JSON.parse(raw) : {};
  const now  = Date.now();
  let   dirty = false;

  for (const cat of plan.categories) {
    if (cat.status === 'ok') continue;

    // Skip if already notified within cooldown window
    const lastSent = sent[cat.categoryId] ?? 0;
    if (now - lastSent < COOLDOWN_MS) continue;

    const isOver = cat.status === 'over';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: isOver
          ? `⚠️ Superaste el límite en ${cat.name}`
          : `📊 Te estás acercando al límite en ${cat.name}`,
        body: isOver
          ? `Gastaste ${formatCurrency(cat.currentSpend)} de un promedio de ${formatCurrency(cat.avgMonthly)}. Proyección: ${formatCurrency(cat.projected)}.`
          : `Llevás el ${Math.round(cat.pct * 100)}% de tu promedio mensual en ${cat.name}.`,
        data: {
          screen:     'category-detail',
          categoryId: cat.categoryId,
        },
        sound: true,
      },
      trigger: null, // immediate
    });

    sent[cat.categoryId] = now;
    dirty = true;
  }

  if (dirty) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sent));
  }
}

// Call once at app startup to handle taps on notifications
export function setupNotificationTapHandler(
  onCategoryNotification: (categoryId: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as any;
    if (data?.screen === 'category-detail' && data?.categoryId) {
      onCategoryNotification(data.categoryId);
    }
  });
  return () => sub.remove();
}
