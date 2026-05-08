import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/format';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  purple:   '#8B5CF6',
  purpleLt: '#F3EEFF',
  green:    '#2E7D32',
  greenLt:  '#EEF7EF',
  text:     '#111111',
  text2:    '#444444',
  muted:    '#757575',
  border:   '#E5E7EB',
  red:      '#EF4444',
} as const;

const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type GroupKind  = 'familiar' | 'amigos';
type CreateKind = GroupKind;
type MemberRole = 'Admin' | 'Miembro';

interface Member {
  name:       string;
  initial:    string;
  color:      string;
  monthTotal: number;
  isMe:       boolean;
}

interface Group {
  id:           string;
  name:         string;
  kind:         GroupKind;
  myRole:       MemberRole;
  totalMonth:   number;
  myMonthTotal: number;
  hasActivity:  boolean;
  members:      Member[];
  color:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROUP_COLORS  = ['#8B5CF6', '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#EC4899'];
const AVATAR_COLORS = ['#4361ee', '#e63946', '#2d6a4f', '#f4a261', '#7209b7', '#3a86ff'];

function hashIdx(str: string, len: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h) % len;
}

function mapRole(dbRole: string): MemberRole {
  return dbRole === 'parent' || dbRole === 'partner' || dbRole === 'admin' ? 'Admin' : 'Miembro';
}

function mapKind(dbType: string): GroupKind {
  return dbType === 'friends' ? 'amigos' : 'familiar';
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function sevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchGroups(userId: string): Promise<Group[]> {
  const db = supabase as any;

  const { data: memberships } = await db
    .from('family_members').select('role, group_id').eq('user_id', userId);
  if (!memberships?.length) return [];

  const groupIds: string[] = memberships.map((m: any) => m.group_id);

  const [{ data: groupsRaw }, { data: membersRaw }] = await Promise.all([
    db.from('family_groups').select('id, name, group_type').in('id', groupIds),
    db.from('family_members').select('user_id, role, group_id').in('group_id', groupIds),
  ]);

  const allUserIds: string[] = [...new Set((membersRaw ?? []).map((m: any) => m.user_id as string))];

  const [{ data: profilesRaw }, { data: expensesRaw }] = await Promise.all([
    db.from('profiles').select('id, full_name, email').in('id', allUserIds),
    supabase.from('expenses').select('user_id, amount, date')
      .in('user_id', allUserIds).gte('date', currentMonthStart()).is('deleted_at', null),
  ]);

  const profileMap: Record<string, { full_name?: string; email?: string }> = {};
  for (const p of profilesRaw ?? []) profileMap[p.id] = p;

  const totals: Record<string, number> = {};
  const lastDate: Record<string, string> = {};
  for (const e of expensesRaw ?? []) {
    totals[e.user_id] = (totals[e.user_id] ?? 0) + Number(e.amount);
    if (!lastDate[e.user_id] || e.date > lastDate[e.user_id]) lastDate[e.user_id] = e.date;
  }

  const recentDate = sevenDaysAgo();

  return (groupsRaw ?? []).map((g: any): Group => {
    const myMembership = memberships.find((m: any) => m.group_id === g.id);
    const groupMembers: any[] = (membersRaw ?? []).filter((m: any) => m.group_id === g.id);

    const members: Member[] = groupMembers.map((m: any) => {
      const p = profileMap[m.user_id];
      const name = p?.full_name || (p?.email ? p.email.split('@')[0] : null) || 'Miembro';
      return {
        name, initial: name.charAt(0).toUpperCase(),
        color: AVATAR_COLORS[hashIdx(m.user_id, AVATAR_COLORS.length)],
        monthTotal: totals[m.user_id] ?? 0,
        isMe: m.user_id === userId,
      };
    });

    const totalMonth    = members.reduce((s, m) => s + m.monthTotal, 0);
    const myMonthTotal  = members.find(m => m.isMe)?.monthTotal ?? 0;
    const hasActivity   = groupMembers.some(m => (lastDate[m.user_id] ?? '') >= recentDate);

    return {
      id: g.id, name: g.name,
      kind:         mapKind(g.group_type),
      myRole:       mapRole(myMembership?.role ?? 'child'),
      totalMonth, myMonthTotal, hasActivity, members,
      color: GROUP_COLORS[hashIdx(g.id, GROUP_COLORS.length)],
    };
  });
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const pct = group.totalMonth > 0 ? (group.myMonthTotal / group.totalMonth) * 100 : 0;
  const icon = group.kind === 'amigos' ? 'people' : 'home';

  return (
    <TouchableOpacity style={s.groupCard} onPress={onPress} activeOpacity={0.85}>

      {/* Top row */}
      <View style={s.gcTop}>
        <View style={[s.gcIcon, { backgroundColor: group.color + '18' }]}>
          <Ionicons name={icon} size={22} color={group.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.gcName} numberOfLines={1}>{group.name}</Text>
          <Text style={s.gcMeta}>
            {group.members.length} miembro{group.members.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <Text style={s.gcTotalLbl}>Total del mes</Text>
          <Text style={[s.gcTotalAmt, { color: group.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {formatCurrency(group.totalMonth)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.gcBar}>
        <View style={[s.gcBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: group.color }]} />
      </View>

      {/* Bottom row */}
      <View style={s.gcBottom}>
        <View>
          <Text style={s.gcPartLbl}>Tu parte</Text>
          <Text style={s.gcPartAmt}>{formatCurrency(group.myMonthTotal)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.gcPartLbl}>Pagaste</Text>
          <Text style={s.gcPartAmt}>{formatCurrency(group.myMonthTotal)}</Text>
        </View>
      </View>

    </TouchableOpacity>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function FamilyScreen() {
  const { user } = useAuthStore();

  const [groups,     setGroups]     = useState<Group[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showJoin,    setShowJoin]    = useState(false);
  const [joinCode,    setJoinCode]    = useState('');
  const [joinError,   setJoinError]   = useState<string | null>(null);
  const [joiningLoad, setJoiningLoad] = useState(false);

  const [showCreate,   setShowCreate]   = useState(false);
  const [createKind,   setCreateKind]   = useState<CreateKind>('familiar');
  const [groupName,    setGroupName]    = useState('');
  const [creatingLoad, setCreatingLoad] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    const data = await fetchGroups(user.id);
    setGroups(data);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const openCreate = (kind: CreateKind = 'familiar') => {
    setCreateKind(kind);
    setGroupName('');
    setShowCreate(true);
  };

  const handleJoin = async () => {
    if (joinCode.length < 6 || !user?.id) return;
    setJoiningLoad(true);
    setJoinError(null);
    try {
      const db = supabase as any;
      const { data: rows } = await db.rpc('find_group_by_invite_code', { p_code: joinCode.toUpperCase() });
      const group = rows?.[0] ?? null;
      if (!group) { setJoinError('Código inválido. Verificalo e intentá de nuevo.'); return; }
      const role = 'member';
      const { error } = await db
        .from('family_members').insert({ group_id: group.id, user_id: user.id, role });
      if (error?.code === '23505') { setJoinError('Ya sos miembro de ese grupo.'); return; }
      if (error) {
        setJoinError(`No pudimos unirte al grupo. ${error.message ?? 'Revisá el código e intentá de nuevo.'}`);
        return;
      }
      setShowJoin(false);
      setJoinCode('');
      await loadGroups();
      Alert.alert('¡Listo!', `Te uniste a "${group.name}".`);
    } catch (err: any) {
      setJoinError(err?.message ?? 'No pudimos unirte al grupo. Revisá el código e intentá de nuevo.');
    } finally {
      setJoiningLoad(false);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim() || !user?.id) return;
    setCreatingLoad(true);
    try {
      const code   = generateCode();
      const db     = supabase as any;
      const dbType = createKind === 'amigos' ? 'friends' : 'family';
      const role   = 'admin';
      const { data: g, error: e1 } = await db
        .from('family_groups')
        .insert({ name: groupName.trim(), invite_code: code, group_type: dbType })
        .select().single();
      if (e1) throw e1;
      const { error: e2 } = await db
        .from('family_members').insert({ group_id: g.id, user_id: user.id, role });
      if (e2) throw e2;
      setShowCreate(false);
      setGroupName('');
      await loadGroups();
      Alert.alert('Grupo creado 🎉', `Tu código de invitación: ${code}\n\nCompartilo para que otros se unan.`);
    } catch (err: any) {
      const msg = err?.message ?? err?.details ?? JSON.stringify(err) ?? 'Error desconocido.';
      Alert.alert('No pudimos crear el grupo', msg + '\n\nAsegurate de haber corrido la migración groups_v2.sql en Supabase.');
    } finally {
      setCreatingLoad(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Grupos</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => openCreate()} activeOpacity={0.85}>
          <Ionicons name="add" size={24} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadGroups(); }}
            tintColor={C.purple}
          />
        }
      >

        {/* Promo card */}
        <View style={s.promoCard}>
          <View style={s.promoIconWrap}>
            <Ionicons name="people" size={26} color={C.green} />
          </View>
          <Text style={s.promoTitle}>Organizá tus gastos en grupo</Text>
          <Text style={s.promoSub}>
            Creá un grupo para compartir gastos, ver resúmenes y mantener todo claro.
          </Text>
          <TouchableOpacity style={s.promoBtn} onPress={() => openCreate()} activeOpacity={0.85}>
            <Text style={s.promoBtnText}>Crear grupo</Text>
          </TouchableOpacity>
        </View>

        {/* Mis grupos */}
        {(loading || groups.length > 0) && (
          <Text style={s.sectionLabel}>Mis grupos</Text>
        )}

        {loading ? (
          <ActivityIndicator color={C.purple} style={{ marginVertical: 20 }} />
        ) : (
          groups.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              onPress={() =>
                router.push({ pathname: '/(app)/group-detail', params: { id: g.id } } as any)
              }
            />
          ))
        )}

        {/* Unirme con código */}
        <TouchableOpacity
          style={s.joinDashed}
          onPress={() => { setJoinCode(''); setJoinError(null); setShowJoin(true); }}
          activeOpacity={0.8}
        >
          <Ionicons name="enter-outline" size={18} color={C.purple} />
          <Text style={s.joinDashedText}>Unirme con código</Text>
        </TouchableOpacity>

        {/* Crear nuevo grupo */}
        <TouchableOpacity style={s.createDashed} onPress={() => openCreate()} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={C.muted} />
          <Text style={s.createDashedText}>Crear nuevo grupo</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* MODAL: Unirme ──────────────────────────────────────────────────────── */}
      <Modal
        visible={showJoin} animationType="slide" presentationStyle="formSheet"
        onRequestClose={() => setShowJoin(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal} edges={['top', 'bottom']}>

            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Unirme a un grupo</Text>
              <TouchableOpacity onPress={() => setShowJoin(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.text2} />
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              <Text style={s.modalSub}>
                Ingresá el código de 6 caracteres que te compartió el admin del grupo.
              </Text>

              <View style={s.codeBoxRow}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.codeBox,
                      joinCode.length > i && { borderColor: C.purple, backgroundColor: C.purpleLt },
                    ]}
                  >
                    <Text style={s.codeChar}>{joinCode[i] ?? ''}</Text>
                  </View>
                ))}
              </View>

              <TextInput
                style={s.hiddenInput}
                value={joinCode}
                onChangeText={t => {
                  setJoinError(null);
                  setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={6}
              />

              {joinError && (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color={C.red} />
                  <Text style={s.errorText}>{joinError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.primaryBtn, (joinCode.length < 6 || joiningLoad) && s.primaryBtnOff]}
                onPress={handleJoin}
                disabled={joinCode.length < 6 || joiningLoad}
                activeOpacity={0.85}
              >
                {joiningLoad
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.primaryBtnText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>

          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Crear ───────────────────────────────────────────────────────── */}
      <Modal
        visible={showCreate} animationType="slide" presentationStyle="formSheet"
        onRequestClose={() => setShowCreate(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal} edges={['top', 'bottom']}>

            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Nuevo grupo</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.text2} />
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              {/* Tipo */}
              <Text style={s.inputLabel}>TIPO</Text>
              <View style={s.typeRow}>
                {([
                  ['familiar', 'home',   'Familiar'],
                  ['amigos',   'people', 'Amigos'],
                ] as const).map(([kind, icon, label]) => (
                  <TouchableOpacity
                    key={kind}
                    style={[s.typeBtn, createKind === kind && s.typeBtnActive]}
                    onPress={() => setCreateKind(kind)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={icon} size={18} color={createKind === kind ? C.purple : C.muted} />
                    <Text style={[s.typeBtnText, createKind === kind && { color: C.purple }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Nombre */}
              <View style={{ gap: sp.sm }}>
                <Text style={s.inputLabel}>NOMBRE</Text>
                <TextInput
                  style={s.textInput}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder={createKind === 'amigos' ? 'Ej: Viaje a Bariloche' : 'Ej: Familia García'}
                  placeholderTextColor={C.muted}
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
              </View>

              <TouchableOpacity
                style={[s.primaryBtn, (!groupName.trim() || creatingLoad) && s.primaryBtnOff]}
                onPress={handleCreate}
                disabled={!groupName.trim() || creatingLoad}
                activeOpacity={0.85}
              >
                {creatingLoad
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.primaryBtnText}>Crear grupo</Text>
                }
              </TouchableOpacity>
            </View>

          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.xl, paddingTop: sp.lg, paddingBottom: sp.md,
  },
  headerTitle: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 34, color: C.text, letterSpacing: -0.5 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },

  // Scroll
  scroll: { paddingHorizontal: sp.xl, paddingBottom: 100, gap: sp.md },

  // Promo card
  promoCard: {
    backgroundColor: C.greenLt, borderRadius: 20, padding: sp.xl, gap: sp.md,
  },
  promoIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff60',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  promoTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text },
  promoSub: {
    fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.text2, lineHeight: 20,
  },
  promoBtn: {
    backgroundColor: C.green, borderRadius: 999,
    paddingVertical: 14, paddingHorizontal: sp.xxl,
    alignItems: 'center', alignSelf: 'flex-start',
  },
  promoBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.white },

  sectionLabel: {
    fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text, marginTop: sp.xs,
  },

  // Group card
  groupCard: {
    backgroundColor: C.white, borderRadius: 20, padding: sp.xl, gap: sp.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  gcTop:     { flexDirection: 'row', alignItems: 'center', gap: sp.md },
  gcIcon:    { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  gcName:    { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text, letterSpacing: -0.2 },
  gcMeta:    { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted },
  gcTotalLbl:{ fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  gcTotalAmt:{ fontFamily: 'Montserrat_700Bold', fontSize: 20, letterSpacing: -0.5 },
  gcBar:     { height: 6, backgroundColor: C.border, borderRadius: 999, overflow: 'hidden' },
  gcBarFill: { height: '100%', borderRadius: 999 },
  gcBottom:  { flexDirection: 'row', justifyContent: 'space-between' },
  gcPartLbl: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted },
  gcPartAmt: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text2, marginTop: 2 },

  // Dashed buttons
  joinDashed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.purple + '60', borderStyle: 'dashed',
    padding: sp.lg, backgroundColor: C.purpleLt + '80',
  },
  joinDashedText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.purple },
  createDashed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
    padding: sp.lg, backgroundColor: C.white,
  },
  createDashedText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 15, color: C.muted },

  // Modal
  modal: { flex: 1, backgroundColor: C.white },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.xl, paddingVertical: sp.lg,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: C.text },
  modalBody:  { paddingHorizontal: sp.xl, paddingTop: sp.xl, gap: sp.xl },
  modalSub:   { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.text2, lineHeight: 20 },

  codeBoxRow: { flexDirection: 'row', gap: sp.sm, justifyContent: 'center' },
  codeBox: {
    width: 46, height: 56, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  codeChar:    { fontFamily: 'Montserrat_700Bold', fontSize: 22, color: C.text },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: sp.sm,
    backgroundColor: '#ef44441a', borderRadius: 10,
    paddingHorizontal: sp.md, paddingVertical: sp.sm,
    borderWidth: 1, borderColor: '#ef444430',
  },
  errorText: { fontFamily: 'Montserrat_500Medium', fontSize: 13, color: C.red, flex: 1 },

  inputLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: C.muted, letterSpacing: 0.8 },
  typeRow:    { flexDirection: 'row', gap: sp.sm },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    paddingVertical: sp.md, backgroundColor: C.bg,
  },
  typeBtnActive: { borderColor: C.purple, backgroundColor: C.purpleLt },
  typeBtnText:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.muted },

  textInput: {
    fontFamily: 'Montserrat_500Medium', fontSize: 16, color: C.text,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: sp.lg, paddingVertical: sp.md, backgroundColor: C.bg,
  },

  primaryBtn: {
    backgroundColor: C.purple, borderRadius: 14, paddingVertical: sp.md + 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnOff:  { opacity: 0.4 },
  primaryBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },
});
