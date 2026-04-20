import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, layout, textVariants } from '@/theme';
import { Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useExpensesStore } from '@/store/expensesStore';
import { usePlanStore } from '@/store/planStore';
import { useSavingsStore } from '@/store/savingsStore';
import { useGoalsStore } from '@/store/goalsStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/format';
import { useLocalSearchParams, router } from 'expo-router';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

type BotId = 'general' | 'inversiones' | 'ahorro' | 'gastos';

interface ClientContext {
  month_total:    number;
  income:         number | null;
  income_pct:     number | null;
  month_status:   'good' | 'tight' | 'over';
  necessary:      number;
  disposable:     number;
  disposable_pct: number;
  investable:     number;
  recoverable:    number;
}

// ─── Configuración de bots ────────────────────────────────────────────────────

const BOTS: Record<BotId, {
  name: string;
  emoji: string;
  description: string;
  color: string;
  quickActions: (ctx: ClientContext) => string[];
}> = {
  general: {
    name:        'General',
    emoji:       '🧠',
    description: 'Tu asesor financiero personal para Argentina',
    color:       colors.primary,
    quickActions: (ctx) => {
      const actions: string[] = [];
      if (ctx.month_status === 'over')
        actions.push('¿Cómo recorto gastos para no pasarme?');
      else if (ctx.month_status === 'tight')
        actions.push('¿Qué gastos puedo ajustar este mes?');
      else if (ctx.recoverable > 0)
        actions.push(`Tengo ~${formatCurrency(ctx.recoverable)} libres — ¿qué hago?`);
      else
        actions.push('¿Cómo mejoro mi salud financiera?');
      actions.push(ctx.disposable_pct > 15
        ? '¿Cuáles son mis gastos más prescindibles?'
        : '¿Mis gastos están bien distribuidos?');
      actions.push('¿Cuál es mi plan para el próximo mes?');
      return actions;
    },
  },
  inversiones: {
    name:        'Inversiones',
    emoji:       '📈',
    description: 'Cedears · FCI · Bonos · Dólar MEP',
    color:       colors.accent,
    quickActions: (ctx) => [
      ctx.recoverable > 0
        ? `Tengo ${formatCurrency(ctx.recoverable)} para invertir — ¿en qué?`
        : '¿Con $50.000 cómo empiezo a invertir?',
      '¿Cedears o dólar MEP hoy?',
      '¿Vale la pena el Plazo Fijo UVA ahora?',
      '¿Cómo armo una cartera diversificada?',
    ],
  },
  ahorro: {
    name:        'Ahorro',
    emoji:       '💰',
    description: 'Metas · Presupuesto · Fondo de emergencia',
    color:       colors.yellow,
    quickActions: (ctx) => [
      '¿Cómo armo mi fondo de emergencia?',
      ctx.recoverable > 0
        ? `¿Cómo ahorro ${formatCurrency(ctx.recoverable)} por mes?`
        : '¿Cuánto debería ahorrar por mes?',
      '¿Cómo llego a mi meta más rápido?',
      '¿Qué porcentaje del sueldo ahorrar?',
    ],
  },
  gastos: {
    name:        'Gastos',
    emoji:       '💳',
    description: 'Análisis y optimización de tus gastos',
    color:       colors.red,
    quickActions: (ctx) => [
      ctx.month_status === 'over'
        ? '¿Cómo reduzco mis gastos urgente?'
        : '¿Están bien mis gastos este mes?',
      ctx.disposable_pct > 20
        ? `Tengo ${ctx.disposable_pct}% en prescindibles — ¿qué recorto?`
        : '¿Cuáles son mis gastos más innecesarios?',
      '¿Mis suscripciones son muchas?',
      '¿Cómo clasifico mejor mis gastos?',
    ],
  },
};

const BOT_IDS: BotId[] = ['general', 'inversiones', 'ahorro', 'gastos'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildClientContext(
  totalThisMonth:  number,
  totalNecessary:  number,
  totalDisposable: number,
  totalInvestable: number,
  estimatedIncome: number | null,
): ClientContext {
  const total     = totalThisMonth;
  const dispPct   = total > 0 ? Math.round((totalDisposable / total) * 100) : 0;
  const incomePct = estimatedIncome && estimatedIncome > 0
    ? Math.round((total / estimatedIncome) * 100) : null;
  const status: ClientContext['month_status'] =
    incomePct !== null && incomePct > 100 ? 'over' :
    (incomePct !== null && incomePct > 85) || dispPct > 20 ? 'tight' : 'good';
  return {
    month_total:    total,
    income:         estimatedIncome,
    income_pct:     incomePct,
    month_status:   status,
    necessary:      totalNecessary,
    disposable:     totalDisposable,
    disposable_pct: dispPct,
    investable:     totalInvestable,
    recoverable:    total > 0 ? Math.round(totalDisposable * 0.5) : 0,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdvisorScreen() {
  const { user }                                                                = useAuthStore();
  const { totalThisMonth, totalNecessary, totalDisposable, totalInvestable,
          estimatedIncome }                                                     = useExpensesStore();
  const { savings, investments }                                                = useSavingsStore();
  const { goals }                                                               = useGoalsStore();
  const { canSendMessage, remainingMessages, incrementUsage,
          load: loadPlan, msgLimit, isLoading: planLoading }                    = usePlanStore();
  const { initialContext }                                                      = useLocalSearchParams<{ initialContext?: string }>();

  const [activeBot,    setActiveBot]    = useState<BotId>('general');
  const [allMessages,  setAllMessages]  = useState<Record<BotId, ChatMessage[]>>({
    general: [], inversiones: [], ahorro: [], gastos: [],
  });
  const [input,        setInput]        = useState('');
  const [isThinking,   setIsThinking]   = useState(false);
  // Tracks per-bot background welcome generation (never blocks user interaction)
  const [welcomingBots, setWelcomingBots] = useState<Set<BotId>>(new Set());

  const flatListRef  = useRef<FlatList>(null);
  const welcomedBots = useRef<Set<BotId>>(new Set());

  // ── Contexto ─────────────────────────────────────────────────────────────

  const clientContext = useMemo(() => buildClientContext(
    totalThisMonth, totalNecessary, totalDisposable, totalInvestable, estimatedIncome,
  ), [totalThisMonth, totalNecessary, totalDisposable, totalInvestable, estimatedIncome]);

  const savingsContext = useMemo(() => {
    const s = savings.map(sv =>
      `${sv.label}: ${formatCurrency(sv.amount)} (${sv.currency})`);
    const i = investments.map(iv =>
      `${iv.name} (${iv.instrument_type}): ${formatCurrency(iv.amount)}${iv.annual_return ? ` al ${iv.annual_return}% anual` : ''}`);
    const g = goals.map(gl => {
      const pct = gl.target_amount > 0
        ? Math.round((gl.current_amount / gl.target_amount) * 100) : 0;
      return `${gl.emoji} ${gl.title}: ${formatCurrency(gl.current_amount)}/${formatCurrency(gl.target_amount)} (${pct}%)`;
    });
    if (!s.length && !i.length && !g.length) return null;
    return {
      savings_summary:     s.length ? s.join(' | ') : null,
      goals_summary:       g.length ? g.join(' | ') : null,
      investments_summary: i.length ? i.join(' | ') : null,
    };
  }, [savings, investments, goals]);

  const quickActions = useMemo(
    () => BOTS[activeBot].quickActions(clientContext),
    [activeBot, clientContext],
  );
  const messages = allMessages[activeBot];
  const bot      = BOTS[activeBot];

  // ── Carga del plan ────────────────────────────────────────────────────────

  useEffect(() => { if (user?.id) loadPlan(user.id); }, [user?.id]);

  // ── Invoke helper con timeout ─────────────────────────────────────────────

  const invokeWithTimeout = useCallback(<T,>(promise: Promise<T>, ms = 20000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)),
    ]),
  []);

  // ── Welcome en background — nunca bloquea la UI ───────────────────────────

  const generateWelcome = useCallback(async (botId: BotId) => {
    setWelcomingBots(prev => new Set([...prev, botId]));
    try {
      const { data, error } = await invokeWithTimeout(
        supabase.functions.invoke('ai-advisor', {
          body: {
            generate_welcome: true,
            client_context:   clientContext,
            initial_context:  botId === 'general' ? (initialContext ?? null) : null,
            user_id:          user?.id,
            savings_context:  savingsContext,
            bot_focus:        botId,
          },
        }),
      );
      if (!error && data?.message) {
        setAllMessages(prev => {
          // No sobreescribir si el usuario ya envió mensajes mientras cargaba
          if (prev[botId].length > 0) return prev;
          return {
            ...prev,
            [botId]: [{
              id:         `welcome-${botId}-${Date.now()}`,
              role:       'assistant',
              content:    data.message,
              created_at: new Date().toISOString(),
            }],
          };
        });
      }
    } catch { /* silencioso */ } finally {
      setWelcomingBots(prev => {
        const next = new Set(prev);
        next.delete(botId);
        return next;
      });
    }
  }, [clientContext, initialContext, user?.id, savingsContext, invokeWithTimeout]);

  useEffect(() => {
    if (!user?.id || welcomedBots.current.has(activeBot)) return;
    welcomedBots.current.add(activeBot);
    generateWelcome(activeBot);
  }, [activeBot, user?.id, generateWelcome]);

  // ── Envío de mensaje ──────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id || isThinking) return;

    if (!canSendMessage()) {
      Alert.alert(
        'Límite de mensajes alcanzado',
        'Agotaste los mensajes de tu plan este mes.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Ver planes', onPress: () => router.push('/(app)/plans') },
        ],
      );
      return;
    }

    const userMsg: ChatMessage = {
      id:         `user-${Date.now()}`,
      role:       'user',
      content:    trimmed,
      created_at: new Date().toISOString(),
    };

    const history = allMessages[activeBot].map(m => ({ role: m.role, content: m.content }));
    setAllMessages(prev => ({ ...prev, [activeBot]: [...prev[activeBot], userMsg] }));
    setInput('');
    setIsThinking(true);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const { data, error } = await invokeWithTimeout(
        supabase.functions.invoke('ai-advisor', {
          body: {
            message:         trimmed,
            history,
            user_id:         user.id,
            client_context:  clientContext,
            savings_context: savingsContext,
            bot_focus:       activeBot,
          },
        }),
      );

      if (error) {
        const status = ((error as any)?.context as Response | undefined)?.status;
        if (status === 429) {
          Alert.alert(
            'Límite de mensajes alcanzado',
            'Agotaste los mensajes de tu plan este mes.',
            [
              { text: 'Ahora no', style: 'cancel' },
              { text: 'Ver planes', onPress: () => router.push('/(app)/plans') },
            ],
          );
          setAllMessages(prev => ({
            ...prev,
            [activeBot]: prev[activeBot].filter(m => m.id !== userMsg.id),
          }));
          return;
        }
        throw new Error(error.message);
      }
      if (!data?.message) throw new Error('Sin respuesta');

      setAllMessages(prev => ({
        ...prev,
        [activeBot]: [
          ...prev[activeBot],
          {
            id:         `ai-${Date.now()}`,
            role:       'assistant',
            content:    data.message,
            created_at: new Date().toISOString(),
          },
        ],
      }));
      incrementUsage(user.id);
    } catch {
      setAllMessages(prev => ({
        ...prev,
        [activeBot]: [
          ...prev[activeBot],
          {
            id:         `err-${Date.now()}`,
            role:       'assistant',
            content:    'Algo salió mal. Intentá de nuevo.',
            created_at: new Date().toISOString(),
          },
        ],
      }));
    } finally {
      setIsThinking(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [allMessages, activeBot, user?.id, isThinking, clientContext, savingsContext, canSendMessage, invokeWithTimeout]);

  // ── Acciones de UI ────────────────────────────────────────────────────────

  // Siempre permite cambiar de bot — sin restricción por isThinking
  const switchBot = useCallback((botId: BotId) => {
    if (botId === activeBot) return;
    setActiveBot(botId);
    setInput('');
  }, [activeBot]);

  const clearBot = useCallback(() => {
    welcomedBots.current.delete(activeBot);
    setAllMessages(prev => ({ ...prev, [activeBot]: [] }));
    generateWelcome(activeBot);
  }, [activeBot, generateWelcome]);

  // ── Render de mensaje ─────────────────────────────────────────────────────

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const b      = BOTS[activeBot];
    return (
      <View style={[
        styles.messageWrapper,
        isUser ? styles.messageWrapperUser : styles.messageWrapperAI,
      ]}>
        {!isUser && (
          <View style={[styles.avatarAI, {
            backgroundColor: b.color + '18',
            borderColor:     b.color + '40',
          }]}>
            <Text style={{ fontSize: 13 }}>{b.emoji}</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text
            variant="bodySmall"
            color={isUser ? colors.text.inverse : colors.text.primary}
            style={{ lineHeight: 20 }}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  }, [activeBot]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isWelcoming = welcomingBots.has(activeBot);
  const canSend     = canSendMessage();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text variant="h4">Asesores IA</Text>
          <Text variant="caption" color={colors.text.tertiary}>
            Consultá en cualquier momento
          </Text>
        </View>
        <TouchableOpacity
          onPress={clearBot}
          style={styles.refreshBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* ── Tab bar — fila fija, sin ScrollView ─────────────────────────── */}
      <View style={styles.tabBar}>
        {BOT_IDS.map(botId => {
          const b        = BOTS[botId];
          const isActive = botId === activeBot;
          const hasMsgs  = allMessages[botId].length > 0;
          return (
            <TouchableOpacity
              key={botId}
              style={[styles.tab, isActive && { borderBottomColor: b.color }]}
              onPress={() => switchBot(botId)}
              activeOpacity={0.65}
            >
              <Text style={{ fontSize: 18, lineHeight: 24 }}>{b.emoji}</Text>
              <Text
                variant="caption"
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  { color: isActive ? b.color : colors.text.tertiary,
                    fontWeight: isActive ? '700' : '400' },
                ]}
              >
                {b.name}
              </Text>
              {hasMsgs && !isActive && (
                <View style={[styles.tabDot, { backgroundColor: b.color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Chat + Input ─────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >

        {/* Chat area */}
        {isWelcoming && messages.length === 0 ? (

          /* Cargando welcome en background */
          <View style={styles.loadingCenter}>
            <View style={[styles.emptyAvatar, { backgroundColor: bot.color + '18' }]}>
              <Text style={{ fontSize: 38 }}>{bot.emoji}</Text>
            </View>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={bot.color} size="small" />
              <Text variant="caption" color={colors.text.secondary}>
                Preparando tu asesor...
              </Text>
            </View>
          </View>

        ) : messages.length === 0 ? (

          /* Estado vacío con preguntas rápidas */
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.emptyState}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.emptyAvatar, { backgroundColor: bot.color + '18' }]}>
              <Text style={{ fontSize: 44 }}>{bot.emoji}</Text>
            </View>
            <Text variant="subtitle" align="center">{bot.name}</Text>
            <Text
              variant="body"
              align="center"
              color={colors.text.secondary}
              style={styles.emptyDesc}
            >
              {bot.description}
            </Text>

            <View style={styles.qaSection}>
              <Text variant="label" color={colors.text.tertiary} style={styles.qaLabel}>
                PREGUNTAS FRECUENTES
              </Text>
              {quickActions.map(q => (
                <TouchableOpacity
                  key={q}
                  style={[styles.qaChip, {
                    borderColor:     bot.color + '40',
                    backgroundColor: bot.color + '08',
                  }]}
                  onPress={() => sendMessage(q)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flash-outline" size={14} color={bot.color} />
                  <Text
                    variant="bodySmall"
                    color={colors.text.primary}
                    style={styles.qaText}
                  >
                    {q}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

        ) : (

          /* FlatList de mensajes */
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            style={styles.flex}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={isThinking ? (
              <View style={styles.thinkingRow}>
                <View style={[styles.avatarAI, {
                  backgroundColor: bot.color + '18',
                  borderColor:     bot.color + '40',
                }]}>
                  <Text style={{ fontSize: 13 }}>{bot.emoji}</Text>
                </View>
                <View style={styles.thinkingBubble}>
                  <ActivityIndicator color={bot.color} size="small" />
                  <Text variant="caption" color={colors.text.secondary}>
                    Escribiendo...
                  </Text>
                </View>
              </View>
            ) : null}
          />
        )}

        {/* ── Input area ──────────────────────────────────────────────── */}
        <View style={styles.inputArea}>

          {/* Contador de mensajes (solo planes con límite) */}
          {msgLimit !== null && !planLoading && (
            <View style={styles.usageRow}>
              {canSend ? (
                <Text variant="caption" color={colors.text.tertiary}>
                  {remainingMessages()} {remainingMessages() === 1
                    ? 'mensaje restante' : 'mensajes restantes'}
                </Text>
              ) : (
                <TouchableOpacity
                  style={styles.limitRow}
                  onPress={() => router.push('/(app)/plans')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="lock-closed-outline" size={11} color={colors.red} />
                  <Text variant="caption" color={colors.red}>Límite alcanzado · </Text>
                  <Text variant="caption" color={colors.primary}
                    style={{ textDecorationLine: 'underline' }}>
                    Ver planes
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Fila de input */}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, !canSend && styles.textInputDisabled]}
              value={input}
              onChangeText={setInput}
              placeholder={canSend ? `Preguntale a ${bot.name}...` : 'Límite alcanzado'}
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={500}
              selectionColor={bot.color}
              editable={canSend}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: bot.color },
                (!input.trim() || isThinking || !canSend) && styles.sendBtnDisabled,
              ]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || isThinking || !canSend}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              {isThinking
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Ionicons name="send" size={17} color={colors.white} />
              }
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical:   spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor:   colors.bg.card,
  },
  refreshBtn: { padding: spacing[1] },

  // Tab bar — fila de 4 tabs sin scroll
  tabBar: {
    flexDirection:     'row',
    backgroundColor:   colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  tab: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingVertical:   spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap:               2,
  },
  tabLabel: {
    fontSize:   10,
    lineHeight: 14,
  },
  tabDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
    marginTop:    1,
  },

  // Loading / vacío
  loadingCenter: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing[4],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  emptyState: {
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[8],
    paddingBottom:     spacing[6],
    alignItems:        'center',
    gap:               spacing[3],
  },
  emptyAvatar: {
    width:           72,
    height:          72,
    borderRadius:    36,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing[1],
  },
  emptyDesc: {
    paddingHorizontal: spacing[2],
  },
  qaSection: {
    width:     '100%',
    marginTop: spacing[3],
    gap:       spacing[2],
  },
  qaLabel: {
    marginBottom: spacing[1],
  },
  qaChip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing[3],
    borderWidth:    1,
    borderRadius:   12,
    paddingVertical:   12,
    paddingHorizontal: spacing[3],
  },
  qaText: {
    flex:       1,
    lineHeight: 19,
  },

  // Mensajes
  messageList: {
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[4],
    paddingBottom:     spacing[3],
    gap:               spacing[3],
  },
  messageWrapper:     { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  messageWrapperUser: { justifyContent: 'flex-end' },
  messageWrapperAI:   { justifyContent: 'flex-start' },
  avatarAI: {
    width:        28,
    height:       28,
    borderRadius: 14,
    alignItems:   'center',
    justifyContent: 'center',
    borderWidth:  1,
    flexShrink:   0,
  },
  bubble: {
    maxWidth:          '80%',
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[3],
    borderRadius:      16,
  },
  bubbleUser: {
    backgroundColor:      colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor:     colors.bg.card,
    borderWidth:         1,
    borderColor:         colors.border.default,
    borderBottomLeftRadius: 4,
  },
  thinkingRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[2],
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[1],
    paddingBottom:     spacing[2],
  },
  thinkingBubble: {
    flexDirection:       'row',
    alignItems:          'center',
    gap:                 spacing[2],
    backgroundColor:     colors.bg.card,
    borderWidth:         1,
    borderColor:         colors.border.default,
    borderRadius:        16,
    borderBottomLeftRadius: 4,
    paddingHorizontal:   spacing[4],
    paddingVertical:     spacing[3],
  },

  // Input
  inputArea: {
    backgroundColor: colors.bg.card,
    borderTopWidth:  1,
    borderTopColor:  colors.border.subtle,
    paddingBottom:   spacing[4],
  },
  usageRow: {
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[2],
    paddingBottom:     spacing[1],
  },
  limitRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[1],
  },
  inputRow: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    paddingHorizontal: layout.screenPadding,
    paddingTop:        spacing[2],
    gap:               spacing[2],
  },
  textInput: {
    flex:              1,
    ...textVariants.body,
    color:             colors.text.primary,
    backgroundColor:   colors.bg.input,
    borderWidth:       1,
    borderColor:       colors.border.default,
    borderRadius:      22,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[3],
    maxHeight:         120,
    minHeight:         44,
  },
  textInputDisabled: {
    opacity: 0.45,
  },
  sendBtn: {
    width:          44,
    height:         44,
    borderRadius:   22,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
});
