import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/format';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  purple:   '#7C3AED',
  purpleLt: '#F5F0FF',
  green:    '#2E7D32',
  greenLt:  '#EEF7EF',
  text:     '#111111',
  text2:    '#444444',
  muted:    '#9E9E9E',
  border:   '#E5E7EB',
  red:      '#C62828',
  success:  '#2E7D32',
} as const;

const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

const GROUP_COLORS  = ['#7C3AED', '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#EC4899'];
const AVATAR_COLORS = ['#4361ee', '#e63946', '#2d6a4f', '#f4a261', '#7209b7', '#3a86ff'];

function hashIdx(str: string, len: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h) % len;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type FamilyTab  = 'resumen' | 'miembros' | 'gastos' | 'permisos';
type FriendsTab = 'resumen' | 'gastos' | 'deudas' | 'miembros';
type Tab        = FamilyTab | FriendsTab;
type MemberRole = 'Admin' | 'Miembro';
type GroupKind  = 'familiar' | 'amigos';

interface MemberPermissions {
  can_view_expenses: boolean;
  can_add_expenses:  boolean;
  can_view_members:  boolean;
  can_invite:        boolean;
  can_manage_roles:  boolean;
}

const DEFAULT_PERMS: MemberPermissions = {
  can_view_expenses: true,
  can_add_expenses:  true,
  can_view_members:  true,
  can_invite:        false,
  can_manage_roles:  false,
};

interface MemberDetail {
  userId:       string;
  name:         string;
  email:        string;
  initial:      string;
  color:        string;
  role:         MemberRole;
  monthTotal:   number;
  isMe:         boolean;
  permissions:  MemberPermissions;
  expenseCount:  number;
  pendingCount:  number;
  topCategory:   string;
}

interface GroupExpense {
  id:             string;
  amount:         number;
  date:           string;
  description:    string;
  paidByName:     string;
  paidById:       string;
  icon:           string;
  iconBg:         string;
  iconColor:      string;
  participantCount: number;
  splitType:      string;
}

interface PersonalExpense {
  id:            string;
  amount:        number;
  date:          string;
  description:   string;
  categoryName:  string;
  categoryIcon:  string | null;
  categoryColor: string | null;
}

interface DebtEntry {
  fromUserId:   string;
  fromName:     string;
  fromInitial:  string;
  fromColor:    string;
  toUserId:     string;
  toName:       string;
  amount:       number;
  isMe:         boolean;
  iOweThem:     boolean;
}

interface GroupDetail {
  id:           string;
  name:         string;
  kind:         GroupKind;
  inviteCode:   string;
  groupColor:   string;
  myRole:       MemberRole;
  members:      MemberDetail[];
  totalMonth:   number;
  myMonthTotal: number;
  expenses:     GroupExpense[];
  debts:        DebtEntry[];
}

interface FetchResult extends GroupDetail {
  rawExpenses: { id: string; paid_by: string }[];
  rawSplits:   { group_expense_id: string; user_id: string; amount: number; settled: boolean }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRole(dbRole: string): MemberRole {
  return dbRole === 'parent' || dbRole === 'partner' || dbRole === 'admin' ? 'Admin' : 'Miembro';
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(): string {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function dateLabel(dateStr: string): string {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today)     return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${months[d.getMonth()]}.`;
}

function expenseIcon(desc: string): { icon: string; iconBg: string; iconColor: string } {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('super') || d.includes('mercado') || d.includes('carrefour') || d.includes('coto'))
    return { icon: 'cart-outline',       iconBg: '#DCFCE7', iconColor: '#16A34A' };
  if (d.includes('restau') || d.includes('cena') || d.includes('comida') || d.includes('pizza'))
    return { icon: 'restaurant-outline', iconBg: '#FEF3C7', iconColor: '#D97706' };
  if (d.includes('internet') || d.includes('wifi'))
    return { icon: 'wifi-outline',       iconBg: '#DBEAFE', iconColor: '#2563EB' };
  if (d.includes('luz') || d.includes('electric'))
    return { icon: 'flash-outline',      iconBg: '#FEF9C3', iconColor: '#CA8A04' };
  if (d.includes('nafta') || d.includes('combustible'))
    return { icon: 'car-outline',        iconBg: '#FCE7F3', iconColor: '#9D174D' };
  if (d.includes('viaje') || d.includes('vuelo') || d.includes('hotel'))
    return { icon: 'airplane-outline',   iconBg: '#E0F2FE', iconColor: '#0369A1' };
  return { icon: 'cash-outline', iconBg: '#F3F4F6', iconColor: '#6B7280' };
}

function buildMemberName(full_name: string, email: string): string {
  const name = full_name?.trim();
  if (name) return name;
  if (email) return email.split('@')[0];
  return 'Usuario';
}

// ─── Debt calculation ─────────────────────────────────────────────────────────

function computeDebts(
  splits: { group_expense_id: string; user_id: string; amount: number; settled: boolean }[],
  expenses: { id: string; paid_by: string }[],
  members: MemberDetail[],
  userId: string,
): DebtEntry[] {
  const net: Record<string, number> = {};
  for (const m of members) net[m.userId] = 0;

  const paidByMap: Record<string, string> = {};
  for (const e of expenses) paidByMap[e.id] = e.paid_by;

  for (const split of splits) {
    if (split.settled) continue;
    const payer = paidByMap[split.group_expense_id];
    if (!payer || payer === split.user_id) continue;
    net[payer]         = (net[payer] ?? 0) + split.amount;
    net[split.user_id] = (net[split.user_id] ?? 0) - split.amount;
  }

  const creditors = members.filter(m => (net[m.userId] ?? 0) > 0.01).sort((a, b) => net[b.userId] - net[a.userId]);
  const debtors   = members.filter(m => (net[m.userId] ?? 0) < -0.01).sort((a, b) => net[a.userId] - net[b.userId]);

  const debts: DebtEntry[] = [];
  const cred = creditors.map(m => ({ ...m, bal: net[m.userId] }));
  const debt = debtors.map(m => ({ ...m, bal: -net[m.userId] }));
  let ci = 0, di = 0;

  while (ci < cred.length && di < debt.length) {
    const amount = Math.min(cred[ci].bal, debt[di].bal);
    if (amount > 0.01) {
      const iOweThem = debt[di].userId === userId;
      debts.push({
        fromUserId:  debt[di].userId,
        fromName:    debt[di].isMe ? 'Vos' : debt[di].name,
        fromInitial: debt[di].initial,
        fromColor:   debt[di].color,
        toUserId:    cred[ci].userId,
        toName:      cred[ci].isMe ? 'vos' : cred[ci].name,
        amount,
        isMe: debt[di].userId === userId,
        iOweThem,
      });
    }
    cred[ci].bal -= amount;
    debt[di].bal -= amount;
    if (cred[ci].bal < 0.01) ci++;
    if (debt[di].bal < 0.01) di++;
  }
  return debts;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchGroupDetail(groupId: string, userId: string): Promise<FetchResult | null> {
  const db = supabase as any;

  const { data: group, error: gErr } = await db
    .from('family_groups')
    .select('id, name, group_type, invite_code')
    .eq('id', groupId)
    .single();
  if (gErr || !group) return null;

  const { data: membersRaw, error: mErr } = await db
    .from('family_members').select('user_id, role').eq('group_id', groupId);
  if (mErr || !membersRaw?.length) return null;

  const myMembership = membersRaw.find((m: any) => m.user_id === userId);
  if (!myMembership) return null;

  const myRole    = mapRole(myMembership.role);
  const isAdmin   = myRole === 'Admin';
  const isFriends = group.group_type === 'friends';
  const allUserIds: string[] = membersRaw.map((m: any) => m.user_id as string);

  // Para grupos familiares: solo gastos de miembros (no admins)
  const adminRoles   = ['parent', 'partner', 'admin'];
  const nonAdminIds: string[] = !isFriends
    ? membersRaw.filter((m: any) => !adminRoles.includes(m.role)).map((m: any) => m.user_id as string)
    : [];

  const [membersInfoResult, expResult, groupExpResult] = await Promise.all([
    db.rpc('get_group_members', { p_group_id: groupId }),
    // Familia: política RLS permite al admin leer gastos de sus miembros.
    // Admin → trae gastos de miembros (no-admin). Miembro → solo los propios.
    !isFriends
      ? nonAdminIds.length > 0
        ? supabase.from('expenses')
            .select('id, user_id, amount, date, description, category_id, category:expense_categories(name_es, icon, color)')
            .in('user_id', isAdmin ? nonAdminIds : [userId])
            .gte('date', currentMonthStart())
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    isFriends
      ? db.from('group_expenses')
          .select('id, paid_by, description, amount, date, split_type')
          .eq('group_id', groupId)
          .order('date', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  const membersInfoMap: Record<string, any> = {};
  for (const m of membersInfoResult.data ?? []) membersInfoMap[m.user_id] = m;

  const totals:    Record<string, number>   = {};
  const expByUser: Record<string, any[]>    = {};
  if (!isFriends) {
    for (const e of (expResult.data as any[]) ?? []) {
      totals[e.user_id] = (totals[e.user_id] ?? 0) + Number(e.amount);
      if (!expByUser[e.user_id]) expByUser[e.user_id] = [];
      expByUser[e.user_id].push(e);
    }
  }

  const members: MemberDetail[] = membersRaw.map((m: any) => {
    const info     = membersInfoMap[m.user_id] ?? {};
    const name     = buildMemberName(info.full_name ?? '', info.email ?? '');
    const email    = info.email ?? '';
    const rawPerms = info.permissions;
    const permissions: MemberPermissions =
      rawPerms && typeof rawPerms === 'object'
        ? { ...DEFAULT_PERMS, ...rawPerms }
        : DEFAULT_PERMS;

    // Stats por miembro (solo grupos familiares)
    const userExps     = expByUser[m.user_id] ?? [];
    const expenseCount = !isFriends ? userExps.length : 0;
    const pendingCount = !isFriends ? userExps.filter((e: any) => !e.category_id).length : 0;
    const catMap: Record<string, { name: string; total: number }> = {};
    for (const e of userExps) {
      if (!e.category_id) continue; // unclassified: skip from top category calc
      const catId   = e.category_id;
      const catName = (e.category as any)?.name_es ?? 'Sin categoría';
      if (!catMap[catId]) catMap[catId] = { name: catName, total: 0 };
      catMap[catId].total += Number(e.amount);
    }
    const topCat = Object.values(catMap).sort((a, b) => b.total - a.total)[0];

    return {
      userId:      m.user_id,
      name, email,
      initial:     name.charAt(0).toUpperCase(),
      color:       AVATAR_COLORS[hashIdx(m.user_id, AVATAR_COLORS.length)],
      role:        mapRole(m.role),
      monthTotal:  totals[m.user_id] ?? 0,
      isMe:        m.user_id === userId,
      permissions,
      expenseCount,
      pendingCount,
      topCategory: topCat?.name ?? '',
    };
  });

  const groupColor  = GROUP_COLORS[hashIdx(groupId, GROUP_COLORS.length)];
  const kind: GroupKind = isFriends ? 'amigos' : 'familiar';

  let rawExpenses: { id: string; paid_by: string }[] = [];
  let rawSplits:   { group_expense_id: string; user_id: string; amount: number; settled: boolean }[] = [];
  let debts: DebtEntry[] = [];
  let expenses: GroupExpense[] = [];

  if (isFriends) {
    rawExpenses = (groupExpResult.data ?? []).map((e: any) => ({ id: e.id, paid_by: e.paid_by }));
    const groupExpIds = rawExpenses.map(e => e.id);

    if (groupExpIds.length > 0) {
      const { data: splitsRaw } = await db
        .from('group_expense_splits')
        .select('group_expense_id, user_id, amount, settled')
        .in('group_expense_id', groupExpIds);
      rawSplits = splitsRaw ?? [];
    }

    for (const e of groupExpResult.data ?? []) {
      totals[e.paid_by] = (totals[e.paid_by] ?? 0) + Number(e.amount);
    }
    for (const m of members) m.monthTotal = totals[m.userId] ?? 0;

    debts = computeDebts(rawSplits, rawExpenses, members, userId);

    // Build a participant count map from rawSplits
    const participantCountMap: Record<string, number> = {};
    for (const split of rawSplits) {
      participantCountMap[split.group_expense_id] = (participantCountMap[split.group_expense_id] ?? 0) + 1;
    }

    expenses = (groupExpResult.data ?? []).map((e: any) => {
      const payer = members.find(m => m.userId === e.paid_by);
      return {
        id:               e.id,
        amount:           Number(e.amount),
        date:             e.date,
        description:      e.description || 'Sin descripción',
        paidByName:       payer?.isMe ? 'Vos' : (payer?.name ?? 'Miembro'),
        paidById:         e.paid_by,
        participantCount: participantCountMap[e.id] ?? 0,
        splitType:        e.split_type ?? 'equal',
        ...expenseIcon(e.description ?? ''),
      };
    });
  } else {
    expenses = (expResult.data ?? []).map((e: any) => {
      const payer = members.find(m => m.userId === e.user_id);
      return {
        id:               e.id,
        amount:           Number(e.amount),
        date:             e.date,
        description:      e.description || 'Sin descripción',
        paidByName:       payer?.isMe ? 'Vos' : (payer?.name ?? 'Miembro'),
        paidById:         e.user_id,
        participantCount: 0,
        splitType:        'equal',
        ...expenseIcon(e.description ?? ''),
      };
    });
  }

  const totalMonth   = members.reduce((s, m) => s + m.monthTotal, 0);
  const myMonthTotal = members.find(m => m.isMe)?.monthTotal ?? 0;

  return {
    id: group.id, name: group.name, kind, inviteCode: group.invite_code,
    groupColor, myRole, members, totalMonth, myMonthTotal, expenses, debts,
    rawExpenses, rawSplits,
  };
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange, accentColor }: {
  tabs:        { key: Tab; label: string }[];
  active:      Tab;
  onChange:    (t: Tab) => void;
  accentColor: string;
}) {
  return (
    <View style={s.tabBar}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[s.tabItem, active === t.key && { borderBottomColor: accentColor }]}
          onPress={() => onChange(t.key)}
          activeOpacity={0.7}
        >
          <Text style={[s.tabLabel, active === t.key && { color: accentColor, fontFamily: 'Montserrat_700Bold' }]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <View style={[s.avatarBase, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22' }]}>
      <Text style={[s.avatarInitial, { color, fontSize: size * 0.38 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense }: { expense: GroupExpense }) {
  const splitLabel = expense.splitType === 'equal' ? 'Partes iguales' : 'Personalizado';
  return (
    <View style={s.expRow}>
      <View style={[s.expIcon, { backgroundColor: expense.iconBg }]}>
        <Ionicons name={expense.icon as any} size={18} color={expense.iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.expName} numberOfLines={1}>{expense.description}</Text>
        <Text style={s.expMeta}>{dateLabel(expense.date)} · Pagó: {expense.paidByName}</Text>
        {expense.participantCount > 0 && (
          <View style={s.expSplitRow}>
            <Text style={s.expSplitText}>{splitLabel}</Text>
            <View style={s.expParticipants}>
              <Ionicons name="people-outline" size={11} color={C.purple} />
              <Text style={s.expParticipantsText}>{expense.participantCount}</Text>
            </View>
          </View>
        )}
      </View>
      <Text style={s.expAmount}>{formatCurrency(expense.amount)}</Text>
    </View>
  );
}

// ─── Modal: Editar miembro ────────────────────────────────────────────────────

const PERM_LABELS: { key: keyof MemberPermissions; label: string }[] = [
  { key: 'can_add_expenses',  label: 'Puede cargar gastos'     },
  { key: 'can_view_members',  label: 'Ver resumen de miembros' },
  { key: 'can_invite',        label: 'Invitar personas'        },
  { key: 'can_manage_roles',  label: 'Administrar roles'       },
];

function MemberEditModal({
  visible, member, groupId, allMembers, onClose, onSaved,
}: {
  visible:    boolean;
  member:     MemberDetail | null;
  groupId:    string;
  allMembers: MemberDetail[];
  onClose:    () => void;
  onSaved:    () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<MemberRole>('Miembro');
  const [perms,        setPerms]        = useState<MemberPermissions>(DEFAULT_PERMS);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (member) {
      setSelectedRole(member.role);
      setPerms({ ...DEFAULT_PERMS, ...member.permissions });
    }
  }, [member]);

  const togglePerm = (key: keyof MemberPermissions) => {
    setPerms(p => ({ ...p, [key]: !p[key] }));
  };

  const handleSave = async () => {
    if (!member) return;
    if (selectedRole === 'Miembro' && member.role === 'Admin') {
      const otherAdmins = allMembers.filter(m => m.role === 'Admin' && m.userId !== member.userId);
      if (otherAdmins.length === 0) {
        Alert.alert('El grupo debe tener al menos un Admin', 'Promové a otro miembro antes de quitar este rol de Admin.');
        return;
      }
    }
    setSaving(true);
    try {
      const db = supabase as any;
      const dbRole = selectedRole === 'Admin' ? 'admin' : 'member';
      if (selectedRole !== member.role) {
        const { error: e1 } = await db.rpc('update_member_role', {
          p_group_id: groupId, p_user_id: member.userId, p_role: dbRole,
        });
        if (e1) throw e1;
      }
      const { error: e2 } = await db.rpc('update_member_permissions', {
        p_group_id: groupId, p_user_id: member.userId, p_permissions: perms,
      });
      if (e2) throw e2;
      onClose();
      onSaved();
      Alert.alert('Listo', 'Rol y permisos actualizados.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!member) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal} edges={['top', 'bottom']}>

        <View style={s.modalHeader}>
          <View style={{ width: 30 }} />
          <Text style={s.modalTitle}>Editar miembro</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>

          {/* Avatar centrado */}
          <View style={{ alignItems: 'center', gap: sp.sm }}>
            <View style={[s.avatarBase, { width: 72, height: 72, borderRadius: 36, backgroundColor: member.color + '22' }]}>
              <Text style={[s.avatarInitial, { color: member.color, fontSize: 28 }]}>{member.initial}</Text>
            </View>
            <Text style={s.editName}>{member.name}</Text>
            {member.email ? <Text style={s.editEmail}>{member.email}</Text> : null}
          </View>

          {/* Rol */}
          <View style={{ gap: sp.md }}>
            <Text style={s.sectionLabel}>ROL EN EL GRUPO</Text>
            {([
              { role: 'Miembro' as MemberRole, desc: 'Puede ver su información y los gastos que el admin permita.' },
              { role: 'Admin'   as MemberRole, desc: 'Puede ver los gastos de todos los miembros y administrar el grupo.' },
            ]).map(({ role, desc }) => (
              <TouchableOpacity
                key={role}
                style={[s.radioRow, selectedRole === role && s.radioRowActive]}
                onPress={() => setSelectedRole(role)}
                activeOpacity={0.8}
              >
                <View style={[s.radioCircle, selectedRole === role && s.radioCircleActive]}>
                  {selectedRole === role && <View style={s.radioDot} />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.radioTitle, selectedRole === role && { color: C.green }]}>{role}</Text>
                  <Text style={s.radioDesc}>{desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Permisos adicionales */}
          <View style={{ gap: sp.md }}>
            <Text style={s.sectionLabel}>PERMISOS ADICIONALES</Text>
            <View style={s.card}>
              {PERM_LABELS.map((p, i) => (
                <View key={p.key}>
                  {i > 0 && <View style={s.divider} />}
                  <TouchableOpacity style={s.checkRow} onPress={() => togglePerm(p.key)} activeOpacity={0.8}>
                    <View style={[s.checkbox, perms[p.key] && s.checkboxActive]}>
                      {perms[p.key] && <Ionicons name="checkmark" size={13} color={C.white} />}
                    </View>
                    <Text style={s.checkLabel}>{p.label}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.greenBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.greenBtnText}>Guardar cambios</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Tab: Resumen (Familia) ───────────────────────────────────────────────────

function FamilyResumenTab({ detail, isAdmin, onInvite, onMemberPress }: {
  detail: GroupDetail; isAdmin: boolean; onInvite: () => void;
  onMemberPress: (m: MemberDetail) => void;
}) {
  const membersList  = detail.members.filter(m => m.role === 'Miembro');
  const membersTotal = membersList.reduce((s, m) => s + m.monthTotal, 0);

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>

      {/* Admin info card */}
      {isAdmin && (
        <View style={s.adminCard}>
          <View style={s.adminCardIconWrap}>
            <Ionicons name="shield-checkmark" size={22} color={C.green} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.adminCardTitle}>Sos el admin</Text>
            <Text style={s.adminCardDesc}>
              Podés ver los gastos de los miembros. Tus gastos no se comparten automáticamente.
            </Text>
          </View>
        </View>
      )}

      {/* Resumen del mes */}
      <View style={s.card}>
        <Text style={s.cardSectionTitle}>Resumen del mes</Text>
        <View style={s.summaryRow}>
          <View style={s.summaryCol}>
            <Text style={s.summaryLabel}>Total del grupo</Text>
            <Text style={s.summaryAmt}>{formatCurrency(membersTotal)}</Text>
          </View>
          <View style={[s.summaryCol, { alignItems: 'flex-end' }]}>
            <Text style={s.summaryLabel}>Miembros</Text>
            <Text style={s.summaryAmt}>{membersList.length}</Text>
          </View>
        </View>
        {!isAdmin && (
          <>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <View style={s.summaryCol}>
                <Text style={s.summaryLabel}>Tus gastos</Text>
                <Text style={s.summaryAmt}>{formatCurrency(detail.myMonthTotal)}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Gastos por miembro */}
      <Text style={s.sectionTitle}>Gastos por miembro</Text>

      {membersList.length === 0 ? (
        <View style={s.emptyBox}>
          <Ionicons name="people-outline" size={36} color={C.border} />
          <Text style={s.emptyTitle}>Sin miembros todavía</Text>
          <Text style={s.emptySub}>Invitá personas para ver sus gastos acá.</Text>
        </View>
      ) : (
        <View style={s.card}>
          {membersList.map((m, i) => (
            <View key={m.userId}>
              {i > 0 && <View style={s.divider} />}
              <TouchableOpacity
                style={s.memberCardRow}
                onPress={() => onMemberPress(m)}
                activeOpacity={isAdmin ? 0.8 : 1}
                disabled={!isAdmin}
              >
                <Avatar name={m.name} color={m.color} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.memberName} numberOfLines={1}>{m.isMe ? `Vos (${m.name})` : m.name}</Text>
                  <Text style={s.memberMeta}>
                    {formatCurrency(m.monthTotal)} · {m.expenseCount} gasto{m.expenseCount !== 1 ? 's' : ''}
                  </Text>
                  {m.topCategory ? (
                    <Text style={s.memberTopCat}>Principal: {m.topCategory}</Text>
                  ) : null}
                  {m.pendingCount > 0 && (
                    <Text style={s.memberPending}>
                      {m.pendingCount} sin clasificar
                    </Text>
                  )}
                </View>
                {isAdmin && <Ionicons name="chevron-forward" size={16} color={C.muted} />}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Nota informativa */}
      <View style={[s.infoBox, { backgroundColor: C.greenLt, borderColor: C.green + '30' }]}>
        <Ionicons name="information-circle-outline" size={16} color={C.green} style={{ marginTop: 1 }} />
        <Text style={[s.infoText, { color: C.text2 }]}>
          Los miembros no tienen que cargar nada manualmente. Sus gastos se asocian automáticamente al grupo familiar.
        </Text>
      </View>

      {/* Botón agregar miembro */}
      <TouchableOpacity style={s.greenBtn} onPress={onInvite} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color={C.white} />
        <Text style={s.greenBtnText}>Agregar miembro</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ─── Modal: Recordar pago ────────────────────────────────────────────────────

type ReminderTone = 'friendly' | 'direct' | 'fun';

function RecordarModal({
  visible, debtorName, amount, onClose,
}: {
  visible:     boolean;
  debtorName:  string;
  amount:      number;
  onClose:     () => void;
}) {
  const [tone, setTone] = useState<ReminderTone>('friendly');

  const messages: Record<ReminderTone, string> = {
    friendly: `Hola ${debtorName} 👋\nSolo paso a recordarte que quedaron pendientes ${formatCurrency(amount)} 😊\n\n¡Gracias!`,
    direct:   `Hola ${debtorName}, te recuerdo que tenés pendientes ${formatCurrency(amount)}.`,
    fun:      `Hola ${debtorName} 😎\nSolo paso a recordarte que están esos ${formatCurrency(amount)}...\nMi paciencia tiene límites 😂\n¡No te olvides!`,
  };

  const handleSend = () => {
    const encoded = encodeURIComponent(messages[tone]);
    Linking.openURL(`whatsapp://send?text=${encoded}`).catch(() =>
      Linking.openURL(`https://wa.me/?text=${encoded}`)
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={['top', 'bottom']}>
        <View style={rm.header}>
          <Text style={rm.headerTitle}>Recordar a {debtorName}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={rm.body} keyboardShouldPersistTaps="handled">
          <Text style={rm.label}>Elegí el tono del mensaje</Text>

          <View style={rm.toneRow}>
            {([
              { key: 'friendly' as const, emoji: '😊', label: 'Amigable', sub: 'Cercano y\nconsiderado' },
              { key: 'direct'   as const, emoji: '🫡', label: 'Directo',  sub: 'Claro y\nal grano'     },
              { key: 'fun'      as const, emoji: '😎', label: 'Divertido', sub: 'Con humor\ny buena onda' },
            ]).map(t => (
              <TouchableOpacity
                key={t.key}
                style={[rm.toneCard, tone === t.key && rm.toneCardActive]}
                onPress={() => setTone(t.key)}
                activeOpacity={0.75}
              >
                <Text style={rm.toneEmoji}>{t.emoji}</Text>
                <Text style={[rm.toneName, tone === t.key && { color: C.purple }]}>{t.label}</Text>
                <Text style={rm.toneSub}>{t.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Preview estilo WhatsApp */}
          <View style={rm.previewWrap}>
            <View style={rm.bubble}>
              <Text style={rm.bubbleText}>{messages[tone]}</Text>
              <Text style={rm.bubbleTime}>11:30 ✓✓</Text>
            </View>
          </View>

          <TouchableOpacity style={rm.sendBtn} onPress={handleSend} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={20} color={C.white} />
            <Text style={rm.sendText}>Enviar por WhatsApp</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Tab: Resumen (Amigos) ────────────────────────────────────────────────────

function FriendsResumenTab({ detail, onAddExpense, myUserId, rawSplits, rawExpenses }: {
  detail:      GroupDetail;
  onAddExpense: () => void;
  myUserId:    string;
  rawSplits:   FetchResult['rawSplits'];
  rawExpenses: FetchResult['rawExpenses'];
}) {
  const [recTarget, setRecTarget] = useState<{ name: string; amount: number } | null>(null);

  const me      = detail.members.find(m => m.isMe);
  const owedToMe = detail.debts.filter(d => d.toUserId === me?.userId);
  const myDebts  = detail.debts.filter(d => d.fromUserId === me?.userId);
  const owedAmt  = owedToMe.reduce((s, d) => s + d.amount, 0);
  const iOweAmt  = myDebts.reduce((s, d) => s + d.amount, 0);

  // Ranking: cuántos splits saldó cada persona (excluyendo cuando fue el pagador)
  const paidByMap: Record<string, string> = {};
  for (const e of rawExpenses) paidByMap[e.id] = e.paid_by;

  const settledCount: Record<string, number> = {};
  for (const sp of rawSplits) {
    const payer = paidByMap[sp.group_expense_id];
    if (sp.settled && sp.user_id !== payer) {
      settledCount[sp.user_id] = (settledCount[sp.user_id] ?? 0) + 1;
    }
  }
  const ranking = detail.members
    .map(m => ({ ...m, pts: (settledCount[m.userId] ?? 0) * 10 }))
    .sort((a, b) => b.pts - a.pts);

  // SmartPesos tip dinámico
  const tip = owedAmt > 0 && myDebts.length === 0
    ? `Tenés ${formatCurrency(owedAmt)} por cobrar entre ${owedToMe.length} persona${owedToMe.length !== 1 ? 's' : ''}. ¡Recordá a tiempo para que no se olviden!`
    : iOweAmt > 0
      ? `Tenés ${formatCurrency(iOweAmt)} pendientes. Pagando a tiempo mejorás tu reputación en el grupo 💪`
      : '¡El grupo está al día! Excelente trabajo a todos 🎉';

  const handleRecordarTodos = () => {
    if (owedToMe.length === 0) return;
    const names = owedToMe.map(d => d.fromName).join(', ');
    const encoded = encodeURIComponent(
      `Hola a todos 👋 Paso a recordarles que hay pagos pendientes en el grupo. ¡Gracias! 😊\nDeben: ${owedToMe.map(d => `${d.fromName} (${formatCurrency(d.amount)})`).join(', ')}`
    );
    Linking.openURL(`whatsapp://send?text=${encoded}`).catch(() =>
      Linking.openURL(`https://wa.me/?text=${encoded}`)
    );
  };

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>

      {/* ── Cards resumen ──────────────────────────────────────────────────── */}
      <View style={fr.statsRow}>
        <View style={[fr.statCard, { backgroundColor: '#F0FDF4', borderColor: C.green + '30' }]}>
          <Text style={fr.statLabel}>A cobrar</Text>
          <Text style={[fr.statAmt, { color: C.green }]}>{formatCurrency(owedAmt)}</Text>
          <Text style={fr.statSub}>de {owedToMe.length} persona{owedToMe.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={[fr.statCard, { backgroundColor: '#FFF5F5', borderColor: C.red + '30' }]}>
          <Text style={fr.statLabel}>Yo debo</Text>
          <Text style={[fr.statAmt, { color: C.red }]}>{formatCurrency(iOweAmt)}</Text>
          <Text style={fr.statSub}>a {myDebts.length} persona{myDebts.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* ── SmartPesos tip ─────────────────────────────────────────────────── */}
      <View style={fr.tipCard}>
        <Text style={fr.tipIcon}>💡</Text>
        <Text style={fr.tipText}>{tip}</Text>
      </View>

      {/* ── Balances del grupo ─────────────────────────────────────────────── */}
      {detail.debts.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Balances del grupo</Text>
          {detail.debts.map(d => {
            const theyOweMe = d.toUserId === myUserId;
            const iOweThem  = d.fromUserId === myUserId;
            const isMyDebt  = theyOweMe || iOweThem;
            const accent    = theyOweMe ? C.green : iOweThem ? C.red : C.text2;
            const badge     = theyOweMe ? 'Te debe' : iOweThem ? 'Vos debés' : 'Pendiente';
            const badgeBg   = theyOweMe ? '#F0FDF4' : iOweThem ? '#FFF5F5' : C.bg;
            const person    = theyOweMe ? d : { ...d, fromName: d.toName, fromColor: d.fromColor };

            return (
              <View key={`${d.fromUserId}-${d.toUserId}`} style={fr.balanceCard}>
                <Avatar
                  name={theyOweMe ? d.fromName : iOweThem ? d.toName : d.fromName}
                  color={d.fromColor}
                  size={44}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={fr.balanceName}>
                    {theyOweMe ? d.fromName : iOweThem ? d.toName : `${d.fromName} → ${d.toName}`}
                  </Text>
                  <View style={[fr.balanceBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[fr.balanceBadgeText, { color: accent }]}>{badge}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[fr.balanceAmt, { color: accent }]}>{formatCurrency(d.amount)}</Text>
                  {theyOweMe && (
                    <TouchableOpacity
                      style={fr.remindBtn}
                      onPress={() => setRecTarget({ name: d.fromName, amount: d.amount })}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="paper-plane-outline" size={11} color={C.purple} />
                      <Text style={fr.remindBtnText}>Recordar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* ── Recordar a todos ───────────────────────────────────────────────── */}
      {owedToMe.length > 0 && (
        <TouchableOpacity style={fr.recAllBtn} onPress={handleRecordarTodos} activeOpacity={0.85}>
          <Ionicons name="paper-plane-outline" size={16} color={C.purple} />
          <Text style={fr.recAllText}>Recordar a todos</Text>
        </TouchableOpacity>
      )}

      {/* ── Ranking de cumplidores ─────────────────────────────────────────── */}
      {ranking.some(r => r.pts > 0) && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sectionTitle}>Ranking de cumplidores 🏆</Text>
          </View>
          <View style={fr.rankCard}>
            {ranking.map((m, i) => (
              <View key={m.userId}>
                {i > 0 && <View style={s.divider} />}
                <View style={fr.rankRow}>
                  <Text style={fr.rankMedal}>{MEDALS[i] ?? `${i + 1}.`}</Text>
                  <Avatar name={m.name} color={m.color} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={fr.rankName}>{m.isMe ? 'Vos' : m.name}</Text>
                    <Text style={fr.rankSub}>{settledCount[m.userId] ?? 0} pago{(settledCount[m.userId] ?? 0) !== 1 ? 's' : ''} a tiempo</Text>
                  </View>
                  <Text style={[fr.rankPts, i === 0 && { color: '#F59E0B' }]}>+{m.pts} pts</Text>
                </View>
              </View>
            ))}
            {ranking.some(r => r.pts > 0) && (
              <View style={[s.divider]} />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: sp.lg, paddingVertical: sp.md }}>
              <Text style={{ fontSize: 18 }}>⭐</Text>
              <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 12, color: C.text2, flex: 1 }}>
                {ranking.filter(r => r.pts > 0).length} miembro{ranking.filter(r => r.pts > 0).length !== 1 ? 's' : ''} mejoraron su puntualidad este mes.
              </Text>
            </View>
          </View>
        </>
      )}

      {/* ── Agregar gasto ──────────────────────────────────────────────────── */}
      <TouchableOpacity style={s.purpleBtn} onPress={onAddExpense} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color={C.white} />
        <Text style={s.purpleBtnText}>Agregar gasto compartido</Text>
      </TouchableOpacity>

      <Text style={s.microcopy}>
        Solo se muestran los gastos que se cargan manualmente en el grupo.
      </Text>

      {/* Modal recordar */}
      <RecordarModal
        visible={recTarget !== null}
        debtorName={recTarget?.name ?? ''}
        amount={recTarget?.amount ?? 0}
        onClose={() => setRecTarget(null)}
      />

    </ScrollView>
  );
}

// ─── Modal: Detalle de gasto ──────────────────────────────────────────────────

function ExpenseDetailModal({
  visible, expense, splits, members, myUserId, onClose, onRefresh,
}: {
  visible:    boolean;
  expense:    GroupExpense | null;
  splits:     FetchResult['rawSplits'];
  members:    MemberDetail[];
  myUserId:   string;
  onClose:    () => void;
  onRefresh:  () => void;
}) {
  const [settling, setSettling] = useState<string | null>(null);
  const PURPLE = '#8B5CF6';

  if (!expense) return null;

  const expSplits = splits.filter(sp => sp.group_expense_id === expense.id);

  const handleSettle = async (splitUserId: string) => {
    setSettling(splitUserId);
    try {
      const { error } = await (supabase as any)
        .from('group_expense_splits')
        .update({ settled: true })
        .eq('group_expense_id', expense.id)
        .eq('user_id', splitUserId);
      if (error) throw error;
      onRefresh();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo saldar.');
    } finally {
      setSettling(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
        <View style={s.modalHeader}>
          <View style={{ width: 22 }} />
          <Text style={s.modalTitle}>Detalle del gasto</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
          {/* Expense preview */}
          <View style={s.miniExpCard}>
            <View style={[s.expIcon, { backgroundColor: expense.iconBg }]}>
              <Ionicons name={expense.icon as any} size={18} color={expense.iconColor} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.expName} numberOfLines={1}>{expense.description}</Text>
              <Text style={s.expMeta}>{dateLabel(expense.date)} · Pagó: {expense.paidByName}</Text>
            </View>
            <Text style={[s.expAmount, { color: PURPLE }]}>{formatCurrency(expense.amount)}</Text>
          </View>

          {/* Balances */}
          <View style={{ gap: sp.md }}>
            <Text style={s.sectionLabel}>BALANCES DEL GASTO</Text>
            <View style={s.card}>
              {expSplits.map((split, i) => {
                const member    = members.find(m => m.userId === split.user_id);
                const isPayer   = split.user_id === expense.paidById;
                const isMe      = split.user_id === myUserId;
                const iAmPayer  = expense.paidById === myUserId;
                const canSettle = iAmPayer && !split.settled && !isPayer;

                let badge: { label: string; color: string; bg: string };
                if (isPayer) {
                  badge = { label: 'Pagó', color: PURPLE, bg: PURPLE + '14' };
                } else if (split.settled) {
                  badge = { label: 'Saldado', color: C.muted, bg: '#F3F4F6' };
                } else if (iAmPayer) {
                  badge = { label: 'Te debe', color: C.green, bg: C.greenLt };
                } else if (isMe) {
                  badge = { label: 'Debés', color: C.red, bg: '#FFF0F0' };
                } else {
                  badge = { label: 'Debe', color: C.text2, bg: C.bg };
                }

                return (
                  <View key={split.user_id}>
                    {i > 0 && <View style={s.divider} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingHorizontal: sp.lg, paddingVertical: sp.md }}>
                      <Avatar name={member?.name ?? '?'} color={member?.color ?? C.muted} size={38} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={s.memberName}>{member?.isMe ? 'Vos' : (member?.name ?? 'Miembro')}</Text>
                        <View style={[s.roleBadge, { backgroundColor: badge.bg, alignSelf: 'flex-start' }]}>
                          <Text style={[s.roleBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: sp.xs }}>
                        <Text style={s.expAmount}>{formatCurrency(split.amount)}</Text>
                        {canSettle && (
                          <TouchableOpacity
                            style={{ backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                            onPress={() => handleSettle(split.user_id)}
                            disabled={settling === split.user_id}
                          >
                            {settling === split.user_id
                              ? <ActivityIndicator size="small" color={C.white} />
                              : <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 11, color: C.white }}>Saldar</Text>
                            }
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {expense.paidById === myUserId && expSplits.some(s => !s.settled && s.user_id !== myUserId) && (
            <View style={[s.infoBox, { backgroundColor: C.greenLt, borderColor: C.green + '30' }]}>
              <Ionicons name="information-circle-outline" size={15} color={C.green} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: C.text2 }]}>
                Tocá "Saldar" en el deudor cuando te hayan pagado para marcar la deuda como saldada.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Tipos: solicitudes de edición ───────────────────────────────────────────

interface EditRequest {
  id:                   string;
  expense_id:           string;
  requester_id:         string;
  requesterName:        string;
  proposed_amount:      number | null;
  proposed_description: string | null;
  reason:               string;
  status:               'pending' | 'approved' | 'rejected';
  created_at:           string;
}

// ─── Modal: solicitar edición (miembros) ──────────────────────────────────────

function RequestEditModal({
  visible, expense, groupId, myUserId, onClose, onSubmitted,
}: {
  visible:     boolean;
  expense:     GroupExpense | null;
  groupId:     string;
  myUserId:    string;
  onClose:     () => void;
  onSubmitted: () => void;
}) {
  const [amount,      setAmount]      = useState('');
  const [description, setDescription] = useState('');
  const [reason,      setReason]      = useState('');
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setDescription(expense.description);
      setReason('');
    }
  }, [expense?.id]);

  const submit = async () => {
    if (!expense || !reason.trim()) {
      Alert.alert('Motivo requerido', 'Contanos por qué querés editar este gasto.');
      return;
    }
    setSaving(true);
    const db  = supabase as any;
    const amt = parseFloat(amount.replace(',', '.'));
    const { error } = await db.from('expense_edit_requests').insert({
      group_id:             groupId,
      expense_id:           expense.id,
      requester_id:         myUserId,
      proposed_amount:      !isNaN(amt) && amt !== expense.amount ? amt : null,
      proposed_description: description.trim() !== expense.description ? description.trim() || null : null,
      reason:               reason.trim(),
    });
    setSaving(false);
    if (error) { Alert.alert('Error', 'No se pudo enviar la solicitud.'); return; }
    onSubmitted();
    Alert.alert('Solicitud enviada', 'El admin va a revisar tu pedido pronto.');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={req.header}>
          <Text style={req.title}>Solicitar edición</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        {expense && (
          <ScrollView contentContainerStyle={req.body} keyboardShouldPersistTaps="handled">
            <View style={req.currentCard}>
              <Text style={req.currentLabel}>GASTO ACTUAL</Text>
              <Text style={req.currentName}>{expense.description}</Text>
              <Text style={req.currentMeta}>
                {formatCurrency(expense.amount)} · Pagó {expense.paidByName}
              </Text>
            </View>

            <Text style={req.fieldLabel}>Monto propuesto</Text>
            <TextInput
              style={req.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={C.muted}
            />

            <Text style={req.fieldLabel}>Descripción propuesta</Text>
            <TextInput
              style={req.input}
              value={description}
              onChangeText={setDescription}
              placeholderTextColor={C.muted}
            />

            <Text style={req.fieldLabel}>
              Motivo <Text style={{ color: C.red }}>*</Text>
            </Text>
            <TextInput
              style={[req.input, req.inputMulti]}
              value={reason}
              onChangeText={setReason}
              placeholder="Ej: Pagué solo la mitad, el resto fue de otra persona"
              placeholderTextColor={C.muted}
              multiline
            />

            <TouchableOpacity
              style={[req.submitBtn, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={req.submitText}>Enviar solicitud</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Solicitudes pendientes (admin) ───────────────────────────────────────────

function PendingRequestsSection({
  requests, expenses, onApprove, onReject,
}: {
  requests:  EditRequest[];
  expenses:  GroupExpense[];
  onApprove: (r: EditRequest) => void;
  onReject:  (r: EditRequest) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <View style={prs.wrap}>
      <View style={prs.titleRow}>
        <Ionicons name="pencil-outline" size={15} color={C.purple} />
        <Text style={prs.title}>Solicitudes pendientes</Text>
        <View style={prs.badge}><Text style={prs.badgeText}>{requests.length}</Text></View>
      </View>
      {requests.map(r => {
        const exp = expenses.find(e => e.id === r.expense_id);
        return (
          <View key={r.id} style={prs.card}>
            <View style={prs.cardTop}>
              <Text style={prs.requester}>{r.requesterName}</Text>
              <Text style={prs.dateText}>{dateLabel(r.created_at.split('T')[0])}</Text>
            </View>
            <Text style={prs.expName} numberOfLines={1}>{exp?.description ?? '—'}</Text>
            {r.proposed_amount !== null && (
              <Text style={prs.change}>
                Monto: {formatCurrency(r.proposed_amount)}
                {exp ? ` (antes ${formatCurrency(exp.amount)})` : ''}
              </Text>
            )}
            {r.proposed_description !== null && (
              <Text style={prs.change}>Descripción: "{r.proposed_description}"</Text>
            )}
            <Text style={prs.reason}>"{r.reason}"</Text>
            <View style={prs.actions}>
              <TouchableOpacity style={prs.rejectBtn} onPress={() => onReject(r)} activeOpacity={0.8}>
                <Text style={prs.rejectText}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={prs.approveBtn} onPress={() => onApprove(r)} activeOpacity={0.8}>
                <Text style={prs.approveText}>Aprobar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Mis solicitudes (miembros) ───────────────────────────────────────────────

const STATUS_LABEL: Record<EditRequest['status'], { label: string; color: string }> = {
  pending:  { label: 'Pendiente', color: '#D97706' },
  approved: { label: 'Aprobada',  color: C.success  },
  rejected: { label: 'Rechazada', color: C.red      },
};

function MyRequestsList({ requests, expenses }: { requests: EditRequest[]; expenses: GroupExpense[] }) {
  if (requests.length === 0) return null;
  return (
    <View style={prs.wrap}>
      <View style={prs.titleRow}>
        <Ionicons name="time-outline" size={15} color={C.muted} />
        <Text style={prs.title}>Mis solicitudes</Text>
      </View>
      {requests.map(r => {
        const exp    = expenses.find(e => e.id === r.expense_id);
        const status = STATUS_LABEL[r.status];
        return (
          <View key={r.id} style={[prs.card, { borderLeftWidth: 3, borderLeftColor: status.color }]}>
            <View style={prs.cardTop}>
              <Text style={prs.expName}>{exp?.description ?? '—'}</Text>
              <Text style={[prs.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
            <Text style={prs.reason}>"{r.reason}"</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Tab: Gastos ──────────────────────────────────────────────────────────────

function GastosTab({ detail, onAddExpense, isFriends, rawSplits, myUserId, isAdmin, groupId, onRefresh }: {
  detail:       GroupDetail;
  onAddExpense: () => void;
  isFriends:    boolean;
  rawSplits:    FetchResult['rawSplits'];
  myUserId:     string;
  isAdmin:      boolean;
  groupId:      string;
  onRefresh:    () => void;
}) {
  const [selectedExpense, setSelectedExpense] = useState<GroupExpense | null>(null);
  const [editingExpense,  setEditingExpense]  = useState<GroupExpense | null>(null);
  const [editRequests,    setEditRequests]    = useState<EditRequest[]>([]);

  const loadRequests = useCallback(async () => {
    if (isFriends || !groupId) return;
    const db = supabase as any;
    const q = db
      .from('expense_edit_requests')
      .select('id, expense_id, requester_id, proposed_amount, proposed_description, reason, status, created_at, requester:profiles!requester_id(full_name, email)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    const { data } = isAdmin ? await q.eq('status', 'pending') : await q.eq('requester_id', myUserId);
    if (!data) return;
    setEditRequests(data.map((r: any) => ({
      id:                   r.id,
      expense_id:           r.expense_id,
      requester_id:         r.requester_id,
      requesterName:        buildMemberName(r.requester?.full_name ?? '', r.requester?.email ?? ''),
      proposed_amount:      r.proposed_amount   !== null ? Number(r.proposed_amount)   : null,
      proposed_description: r.proposed_description ?? null,
      reason:               r.reason,
      status:               r.status,
      created_at:           r.created_at,
    })));
  }, [isFriends, groupId, isAdmin, myUserId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = (r: EditRequest) => {
    if (r.proposed_amount === null && r.proposed_description === null) {
      Alert.alert('Sin cambios', 'La solicitud no propone ningún cambio concreto.');
      return;
    }
    Alert.alert('Aprobar solicitud', '¿Querés aplicar los cambios propuestos?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar', onPress: async () => {
          const db = supabase as any;
          const { data, error } = await db.rpc('approve_expense_edit_request', {
            p_request_id: r.id,
          });
          if (error || data?.error) {
            const msg = data?.error === 'no_changes'   ? 'La solicitud no propone cambios concretos.'
                      : data?.error === 'not_admin'    ? 'Solo los admins pueden aprobar solicitudes.'
                      : data?.error === 'already_reviewed' ? 'Esta solicitud ya fue revisada.'
                      : 'No se pudo aprobar la solicitud.';
            Alert.alert('Error', msg);
            return;
          }
          loadRequests();
          onRefresh();
        },
      },
    ]);
  };

  const handleReject = (r: EditRequest) => {
    Alert.alert('Rechazar solicitud', '¿Seguro que querés rechazar esta solicitud?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar', style: 'destructive', onPress: async () => {
          const db = supabase as any;
          await db.from('expense_edit_requests').update({
            status: 'rejected', reviewed_by: myUserId, reviewed_at: new Date().toISOString(),
          }).eq('id', r.id);
          loadRequests();
        },
      },
    ]);
  };

  return (
    <>
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.sectionTitle}>{monthLabel()}</Text>
        {isFriends && (
          <TouchableOpacity style={s.addSmallBtn} onPress={onAddExpense} activeOpacity={0.8}>
            <Ionicons name="add" size={14} color={C.purple} />
            <Text style={s.addSmallText}>Agregar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Admin: solicitudes pendientes (solo grupos familiares) */}
      {!isFriends && isAdmin && (
        <PendingRequestsSection
          requests={editRequests}
          expenses={detail.expenses}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Miembro: historial de sus solicitudes (solo grupos familiares) */}
      {!isFriends && !isAdmin && (
        <MyRequestsList requests={editRequests} expenses={detail.expenses} />
      )}

      {detail.expenses.length === 0 ? (
        <View style={s.emptyBox}>
          <Ionicons name="receipt-outline" size={36} color={C.border} />
          <Text style={s.emptyTitle}>Sin gastos todavía</Text>
          <Text style={s.emptySub}>
            {isFriends ? 'Agregá el primer gasto compartido.' : 'Los gastos del grupo aparecerán acá.'}
          </Text>
        </View>
      ) : (() => {
        const byDate: { date: string; label: string; items: GroupExpense[] }[] = [];
        for (const e of detail.expenses) {
          const last = byDate[byDate.length - 1];
          if (last && last.date === e.date) { last.items.push(e); }
          else byDate.push({ date: e.date, label: dateLabel(e.date), items: [e] });
        }
        return (
          <>
            {byDate.map(group => (
              <View key={group.date} style={{ gap: sp.sm }}>
                <Text style={s.sectionLabel}>{group.label.toUpperCase()}</Text>
                <View style={s.card}>
                  {group.items.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <View style={s.divider} />}
                      <TouchableOpacity
                        onPress={() => isFriends ? setSelectedExpense(e) : undefined}
                        activeOpacity={isFriends ? 0.75 : 1}
                        disabled={!isFriends}
                      >
                        <ExpenseRow expense={e} />
                      </TouchableOpacity>
                      {/* Solicitar edición — solo miembros en grupos familiares */}
                      {!isFriends && !isAdmin && (
                        <TouchableOpacity
                          style={gt.editRequestBtn}
                          onPress={() => setEditingExpense(e)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pencil-outline" size={12} color={C.green} />
                          <Text style={[gt.editRequestText, { color: C.green }]}>Solicitar edición</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        );
      })()}
    </ScrollView>

    {isFriends && (
      <ExpenseDetailModal
        visible={selectedExpense !== null}
        expense={selectedExpense}
        splits={rawSplits}
        members={detail.members}
        myUserId={myUserId}
        onClose={() => setSelectedExpense(null)}
        onRefresh={() => { setSelectedExpense(null); onRefresh(); }}
      />
    )}

    {!isFriends && (
      <RequestEditModal
        visible={editingExpense !== null}
        expense={editingExpense}
        groupId={groupId}
        myUserId={myUserId}
        onClose={() => setEditingExpense(null)}
        onSubmitted={() => { setEditingExpense(null); loadRequests(); }}
      />
    )}
    </>
  );
}

// ─── Tab: Deudas ─────────────────────────────────────────────────────────────

function DeudasTab({ detail, myUserId }: { detail: GroupDetail; myUserId: string }) {
  const owedToMe  = detail.debts.filter(d => d.toUserId === myUserId);
  const myDebts   = detail.debts.filter(d => d.fromUserId === myUserId);
  const otherDebts = detail.debts.filter(d => d.fromUserId !== myUserId && d.toUserId !== myUserId);
  const owedAmt   = owedToMe.reduce((s, d) => s + d.amount, 0);
  const iOweAmt   = myDebts.reduce((s, d) => s + d.amount, 0);
  const netBalance = owedAmt - iOweAmt;
  const netColor  = netBalance > 0.01 ? C.green : netBalance < -0.01 ? C.red : C.text2;

  if (detail.debts.length === 0) {
    return (
      <View style={[s.tabContent, s.centered]}>
        <Ionicons name="checkmark-circle-outline" size={48} color={C.green} />
        <Text style={s.emptyTitle}>Todo al día</Text>
        <Text style={s.emptySub}>No hay deudas pendientes en el grupo.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>

      {/* Balance neto */}
      <View style={s.card}>
        <Text style={s.cardSectionTitle}>Tu balance neto</Text>
        <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 26, color: netColor, paddingHorizontal: sp.lg, paddingBottom: sp.md, letterSpacing: -0.5 }}>
          {netBalance > 0.01 ? '+' : ''}{formatCurrency(netBalance)}
        </Text>
        <View style={s.divider} />
        <View style={[s.summaryRow, { paddingVertical: sp.md }]}>
          <View style={s.summaryCol}>
            <Text style={s.summaryLabel}>Te deben</Text>
            <Text style={[s.summaryAmt, { color: C.green, fontSize: 16 }]}>{formatCurrency(owedAmt)}</Text>
          </View>
          <View style={[s.summaryCol, { alignItems: 'flex-end' }]}>
            <Text style={s.summaryLabel}>Debés</Text>
            <Text style={[s.summaryAmt, { color: C.red, fontSize: 16 }]}>{formatCurrency(iOweAmt)}</Text>
          </View>
        </View>
      </View>

      {/* TE DEBEN */}
      {owedToMe.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Te deben</Text>
          <View style={s.card}>
            {owedToMe.map((d, i) => (
              <View key={`${d.fromUserId}-${d.toUserId}`}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.debtRow}>
                  <Avatar name={d.fromName} color={d.fromColor} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.debtLabel}>{d.fromName}</Text>
                    <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted }}>te debe</Text>
                  </View>
                  <Text style={[s.debtAmt, { color: C.green }]}>{formatCurrency(d.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* DEBÉS */}
      {myDebts.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Debés</Text>
          <View style={s.card}>
            {myDebts.map((d, i) => (
              <View key={`${d.fromUserId}-${d.toUserId}`}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.debtRow}>
                  <Avatar name={d.toName} color={d.fromColor} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.debtLabel}>a {d.toName}</Text>
                    <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 11, color: C.red }}>tenés que pagar</Text>
                  </View>
                  <Text style={[s.debtAmt, { color: C.red }]}>{formatCurrency(d.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ENTRE EL GRUPO */}
      {otherDebts.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Entre el grupo</Text>
          <View style={s.card}>
            {otherDebts.map((d, i) => (
              <View key={`${d.fromUserId}-${d.toUserId}`}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.debtRow}>
                  <Avatar name={d.fromName} color={d.fromColor} size={40} />
                  <Text style={s.debtLabel} numberOfLines={1}>{d.fromName} le debe a {d.toName}</Text>
                  <Text style={[s.debtAmt, { color: C.text2 }]}>{formatCurrency(d.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={s.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={C.purple} />
        <Text style={s.infoText}>Las deudas se calculan según los gastos compartidos cargados en el grupo.</Text>
      </View>
    </ScrollView>
  );
}

// ─── Tab: Miembros ────────────────────────────────────────────────────────────

function MiembrosTab({ detail, isAdmin, isFriends, onEdit, onInvite }: {
  detail:    GroupDetail;
  isAdmin:   boolean;
  isFriends: boolean;
  onEdit:    (m: MemberDetail) => void;
  onInvite:  () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={s.sectionTitle}>Miembros del grupo</Text>

      <View style={s.card}>
        {detail.members.map((m, i) => {
          const canEdit = isAdmin && !m.isMe && !isFriends;
          const ROLE_STYLE: Record<MemberRole, { bg: string; color: string }> = {
            Admin:   { bg: '#2E7D3218', color: C.green  },
            Miembro: { bg: C.purpleLt,  color: C.purple },
          };
          const rs = ROLE_STYLE[m.role];
          return (
            <View key={m.userId}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.memberRow}>
                <Avatar name={m.name} color={m.color} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {m.isMe ? `Vos (${m.name})` : m.name}
                  </Text>
                  {m.email ? <Text style={s.memberEmail} numberOfLines={1}>{m.email}</Text> : null}
                </View>
                {!isFriends && (
                  <View style={[s.roleBadge, { backgroundColor: rs.bg }]}>
                    <Text style={[s.roleBadgeText, { color: rs.color }]}>{m.role}</Text>
                  </View>
                )}
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => onEdit(m)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={C.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Info card */}
      {!isFriends && (
        <View style={s.adminCard}>
          <Ionicons name="information-circle-outline" size={18} color={C.green} style={{ marginTop: 2 }} />
          <Text style={[s.adminCardDesc, { flex: 1 }]}>
            {isAdmin
              ? 'Los admins pueden ver los gastos de los miembros. Los miembros ven solo su información.'
              : 'Solo el admin puede cambiar roles y permisos.'}
          </Text>
        </View>
      )}

      {/* Invitar */}
      <TouchableOpacity style={s.inviteBtn} onPress={onInvite} activeOpacity={0.85}>
        <Ionicons name="enter-outline" size={18} color={C.green} />
        <Text style={s.inviteBtnText}>Invitar con código</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ─── Tab: Permisos ────────────────────────────────────────────────────────────

function PermisosTab({ detail }: { detail: GroupDetail }) {
  const isAdmin = detail.myRole === 'Admin';
  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[s.adminCard, { backgroundColor: isAdmin ? C.greenLt : C.purpleLt }]}>
        <View style={[s.adminCardIconWrap, { backgroundColor: isAdmin ? '#fff8' : '#fff8' }]}>
          <Ionicons name={isAdmin ? 'shield-checkmark' : 'person'} size={20} color={isAdmin ? C.green : C.purple} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.adminCardTitle, { color: isAdmin ? C.green : C.purple }]}>Tu rol: {detail.myRole}</Text>
          <Text style={s.adminCardDesc}>
            {isAdmin
              ? 'Podés ver los gastos de todos los miembros, cambiar roles y editar permisos.'
              : 'Solo ves tus propios gastos. Un admin puede cambiar tus permisos.'}
          </Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Reglas del grupo</Text>
      <View style={s.card}>
        {[
          { icon: 'eye-outline',         color: '#2563EB', title: 'Admin ve todo',         desc: 'Los admins pueden ver los gastos de todos los miembros.' },
          { icon: 'eye-off-outline',     color: C.muted,   title: 'Miembros ven lo suyo',  desc: 'Los miembros solo ven sus propios gastos por defecto.' },
          { icon: 'create-outline',      color: C.purple,  title: 'Permisos editables',    desc: 'El admin puede personalizar los permisos de cada miembro.' },
          { icon: 'lock-closed-outline', color: '#F59E0B', title: 'Roles protegidos',      desc: 'Solo Admin puede cambiar roles.' },
        ].map((item, i) => (
          <View key={item.title}>
            {i > 0 && <View style={s.divider} />}
            <View style={s.permRow}>
              <View style={[s.permIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.permTitle}>{item.title}</Text>
                <Text style={s.permDesc}>{item.desc}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Modal: Agregar gasto compartido (multi-step) ────────────────────────────

type AddExpenseStep = 'source' | 'pick' | 'form' | 'details' | 'confirm';
type SplitMode      = 'equal' | 'custom';

function AddExpenseModal({
  visible, onClose, members, groupId, userId, onSaved,
}: {
  visible: boolean; onClose: () => void; members: MemberDetail[];
  groupId: string; userId: string; onSaved: () => void;
}) {
  const [step,              setStep]             = useState<AddExpenseStep>('source');
  const [source,            setSource]           = useState<'manual' | 'existing'>('manual');
  const [personalExpenses,  setPersonalExpenses] = useState<PersonalExpense[]>([]);
  const [loadingExp,        setLoadingExp]       = useState(false);
  const [expSearch,         setExpSearch]        = useState('');
  const [selectedExpId,     setSelectedExpId]    = useState<string | null>(null);
  const [description,       setDescription]      = useState('');
  const [amountStr,         setAmountStr]        = useState('');
  const [dateStr,           setDateStr]          = useState(new Date().toISOString().split('T')[0]);
  const [paidById,          setPaidById]         = useState(userId);
  const [splitMode,         setSplitMode]        = useState<SplitMode>('equal');
  const [included,          setIncluded]         = useState<Set<string>>(new Set(members.map(m => m.userId)));
  const [customAmounts,    setCustomAmounts]    = useState<Record<string, string>>({});
  const [saving,            setSaving]           = useState(false);
  const [savedExpense,      setSavedExpense]      = useState<{ description: string; amount: number; myShare: number; paidByName: string; count: number; isPayer: boolean } | null>(null);

  const reset = useCallback(() => {
    setStep('source'); setSource('manual'); setPersonalExpenses([]); setExpSearch('');
    setSelectedExpId(null); setDescription(''); setAmountStr('');
    setDateStr(new Date().toISOString().split('T')[0]);
    setPaidById(userId); setSplitMode('equal'); setCustomAmounts({});
    setIncluded(new Set(members.map(m => m.userId)));
    setSaving(false); setSavedExpense(null);
  }, [userId, members]);

  useEffect(() => { if (!visible) reset(); }, [visible, reset]);

  const loadPersonalExpenses = async () => {
    setLoadingExp(true);
    try {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
      const { data } = await (supabase as any)
        .from('expenses')
        .select('id, amount, date, description, category_id, category:expense_categories(name_es, icon, color)')
        .eq('user_id', userId)
        .gte('date', since)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(100);
      setPersonalExpenses((data ?? []).map((e: any) => ({
        id:            e.id,
        amount:        Number(e.amount),
        date:          e.date,
        description:   e.description || 'Sin descripción',
        categoryName:  (e.category as any)?.name_es ?? 'Sin clasificar',
        categoryIcon:  (e.category as any)?.icon ?? null,
        categoryColor: (e.category as any)?.color ?? null,
      })));
    } finally {
      setLoadingExp(false);
    }
  };

  const handleContinueSource = () => {
    if (source === 'existing') { setStep('pick'); loadPersonalExpenses(); }
    else setStep('form');
  };

  const handleSelectExpense = (exp: PersonalExpense) => {
    setSelectedExpId(exp.id); setDescription(exp.description);
    setAmountStr(String(exp.amount)); setDateStr(exp.date);
  };

  const handleContinuePick = () => {
    if (!selectedExpId) { Alert.alert('Seleccioná un gasto para continuar.'); return; }
    setStep('details');
  };

  const handleContinueForm = () => {
    const amt = parseFloat(amountStr.replace(',', '.'));
    if (!description.trim() || isNaN(amt) || amt <= 0) {
      Alert.alert('Completá la descripción y el monto.'); return;
    }
    setStep('details');
  };

  const handleSave = async () => {
    const amount = parseFloat(amountStr.replace(',', '.'));
    const participantes = members.filter(m => included.has(m.userId));
    if (participantes.length === 0) { Alert.alert('Seleccioná al menos un participante.'); return; }
    if (splitMode === 'custom') {
      const ct = participantes.reduce(
        (s, m) => s + (parseFloat((customAmounts[m.userId] || '0').replace(',', '.')) || 0), 0
      );
      if (Math.abs(ct - amount) >= 0.5) {
        Alert.alert('Los montos no cuadran', `El total asignado (${formatCurrency(ct)}) no coincide con el gasto (${formatCurrency(amount)}).`);
        return;
      }
    }
    setSaving(true);
    try {
      const db = supabase as any;
      // Check for duplicate if sharing an existing expense
      if (source === 'existing' && selectedExpId) {
        const { data: existing } = await db
          .from('group_expenses')
          .select('id')
          .eq('group_id', groupId)
          .eq('source_expense_id', selectedExpId)
          .maybeSingle();
        if (existing) {
          Alert.alert('Gasto ya compartido', 'Este gasto ya fue compartido en este grupo.');
          setSaving(false); return;
        }
      }
      const insertData: any = {
        group_id: groupId, paid_by: paidById,
        description: description.trim(), amount,
        date: dateStr, split_type: splitMode, created_by: userId,
      };
      if (source === 'existing' && selectedExpId) insertData.source_expense_id = selectedExpId;

      const { data: expense, error: e1 } = await db
        .from('group_expenses').insert(insertData).select().single();
      if (e1) throw e1;

      const splits = participantes.map(m => {
        const amt = splitMode === 'custom'
          ? parseFloat((customAmounts[m.userId] || '0').replace(',', '.')) || 0
          : parseFloat((amount / participantes.length).toFixed(2));
        return { group_expense_id: expense.id, user_id: m.userId, amount: amt, settled: m.userId === paidById };
      });
      const { error: e2 } = await db.from('group_expense_splits').insert(splits);
      if (e2) throw e2;

      // Si el usuario actual es el pagador y vinculó un gasto existente,
      // actualizar el monto de ese gasto a su parte real (lo que le cuesta a él)
      if (paidById === userId && source === 'existing' && selectedExpId) {
        const myShare = splits.find(s => s.user_id === userId)?.amount
          ?? parseFloat((amount / participantes.length).toFixed(2));
        await db.from('expenses')
          .update({ amount: myShare })
          .eq('id', selectedExpId)
          .eq('user_id', userId);
      }

      const payer   = members.find(m => m.userId === paidById);
      const myShare = splits.find(s => s.user_id === userId)?.amount
        ?? parseFloat((amount / participantes.length).toFixed(2));
      setSavedExpense({
        description: description.trim(), amount,
        myShare,
        paidByName: payer?.isMe ? 'Vos' : (payer?.name ?? 'Miembro'),
        count:      participantes.length,
        isPayer:    paidById === userId,
      });
      setStep('confirm');
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo guardar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 'pick' || step === 'form') setStep('source');
    else if (step === 'details') setStep(source === 'existing' ? 'pick' : 'form');
  };

  const filteredExpenses = expSearch.trim()
    ? personalExpenses.filter(e =>
        e.description.toLowerCase().includes(expSearch.toLowerCase()) ||
        e.categoryName.toLowerCase().includes(expSearch.toLowerCase())
      )
    : personalExpenses;

  const totalAmt       = parseFloat(amountStr.replace(',', '.')) || 0;
  const includedMembers = members.filter(m => included.has(m.userId));
  const customTotal    = includedMembers.reduce(
    (s, m) => s + (parseFloat((customAmounts[m.userId] || '0').replace(',', '.')) || 0), 0
  );
  const isCustomValid  = splitMode === 'equal' || Math.abs(customTotal - totalAmt) < 0.5;

  const PURPLE = '#8B5CF6';
  const PURPLE_LT = '#F5F3FF';

  const stepTitle: Record<AddExpenseStep, string> = {
    source:  'Agregar gasto compartido',
    pick:    'Elegir de mis gastos',
    form:    'Crear gasto manual',
    details: 'Detalles del gasto',
    confirm: 'Gasto compartido',
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={step === 'confirm' ? () => { reset(); onClose(); } : onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={s.modal} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={s.modalHeader}>
            {step === 'confirm' ? (
              <View style={{ width: 22 }} />
            ) : (
              <TouchableOpacity
                onPress={step === 'source' ? onClose : handleBack}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={step === 'source' ? 'close' : 'arrow-back'} size={22} color={C.text2} />
              </TouchableOpacity>
            )}
            <Text style={s.modalTitle}>{stepTitle[step]}</Text>
            <View style={{ width: 22 }} />
          </View>

          {/* ── Step: source ── */}
          {step === 'source' && (
            <ScrollView contentContainerStyle={[s.modalBody, { gap: sp.xl }]} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionLabel}>¿QUÉ GASTO QUERÉS COMPARTIR?</Text>
              {([
                { val: 'existing' as const, title: 'Elegir de mis gastos', sub: 'Seleccioná un gasto existente y compartilo con el grupo.', icon: 'receipt-outline' },
                { val: 'manual'   as const, title: 'Crear gasto manual',   sub: 'Ingresá un gasto nuevo para compartir.',                  icon: 'create-outline'  },
              ]).map(opt => (
                <TouchableOpacity
                  key={opt.val}
                  style={[s.sourceCard, source === opt.val && { borderColor: PURPLE, backgroundColor: PURPLE_LT }]}
                  onPress={() => setSource(opt.val)}
                  activeOpacity={0.8}
                >
                  <View style={[s.sourceIcon, { backgroundColor: source === opt.val ? PURPLE + '18' : C.bg }]}>
                    <Ionicons name={opt.icon as any} size={22} color={source === opt.val ? PURPLE : C.muted} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[s.radioTitle, source === opt.val && { color: PURPLE }]}>{opt.title}</Text>
                    <Text style={s.radioDesc}>{opt.sub}</Text>
                  </View>
                  <View style={[s.radioCircle, source === opt.val && { borderColor: PURPLE }]}>
                    {source === opt.val && <View style={[s.radioDot, { backgroundColor: PURPLE }]} />}
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.purpleBtn} onPress={handleContinueSource} activeOpacity={0.85}>
                <Text style={s.purpleBtnText}>Continuar</Text>
              </TouchableOpacity>
              <View style={[s.infoBox, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
                <Ionicons name="lock-closed-outline" size={15} color={PURPLE} style={{ marginTop: 1 }} />
                <Text style={[s.infoText, { color: C.text2 }]}>
                  Tus gastos personales siguen privados. Solo se comparte lo que elegís cargar.
                </Text>
              </View>
            </ScrollView>
          )}

          {/* ── Step: pick personal expense ── */}
          {step === 'pick' && (
            <>
              <View style={{ paddingHorizontal: sp.xl, paddingTop: sp.md, paddingBottom: sp.sm }}>
                <View style={s.searchBox}>
                  <Ionicons name="search-outline" size={16} color={C.muted} />
                  <TextInput
                    style={s.searchInput} value={expSearch} onChangeText={setExpSearch}
                    placeholder="Buscar gasto..." placeholderTextColor={C.muted}
                  />
                  {expSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setExpSearch('')}>
                      <Ionicons name="close-circle" size={16} color={C.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {loadingExp ? (
                <View style={s.centered}><ActivityIndicator color={PURPLE} /></View>
              ) : (
                <ScrollView
                  contentContainerStyle={{ paddingHorizontal: sp.xl, paddingTop: sp.sm, paddingBottom: 120, gap: sp.sm }}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredExpenses.length === 0 ? (
                    <View style={[s.emptyBox, { marginTop: sp.xxl }]}>
                      <Ionicons name="receipt-outline" size={36} color={C.border} />
                      <Text style={s.emptyTitle}>{expSearch ? 'Sin resultados' : 'Sin gastos recientes'}</Text>
                      <Text style={s.emptySub}>
                        {expSearch ? 'Probá con otra búsqueda.' : 'No tenés gastos en los últimos 90 días.'}
                      </Text>
                    </View>
                  ) : (
                    filteredExpenses.map(exp => {
                      const isSelected = selectedExpId === exp.id;
                      const ic = expenseIcon(exp.description);
                      return (
                        <TouchableOpacity
                          key={exp.id}
                          style={[s.pickExpRow, isSelected && { borderColor: PURPLE, backgroundColor: '#F5F3FF' }]}
                          onPress={() => handleSelectExpense(exp)}
                          activeOpacity={0.8}
                        >
                          <View style={[s.expIcon, { backgroundColor: exp.categoryColor ? exp.categoryColor + '20' : ic.iconBg }]}>
                            <Ionicons name={(exp.categoryIcon ?? ic.icon) as any} size={18} color={exp.categoryColor ?? ic.iconColor} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={s.expName} numberOfLines={1}>{exp.description}</Text>
                            <Text style={s.expMeta}>{dateLabel(exp.date)} · {exp.categoryName}</Text>
                          </View>
                          <Text style={[s.expAmount, isSelected && { color: PURPLE }]}>{formatCurrency(exp.amount)}</Text>
                          <View style={[s.radioCircle, { marginLeft: sp.sm, flexShrink: 0 }, isSelected && { borderColor: PURPLE }]}>
                            {isSelected && <View style={[s.radioDot, { backgroundColor: PURPLE }]} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  <TouchableOpacity
                    style={s.createManualRow}
                    onPress={() => { setSource('manual'); setStep('form'); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={17} color={PURPLE} />
                    <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: PURPLE, flex: 1 }}>
                      Crear gasto manual
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={PURPLE} />
                  </TouchableOpacity>
                </ScrollView>
              )}

              <View style={{ padding: sp.xl, paddingTop: sp.md }}>
                <TouchableOpacity
                  style={[s.purpleBtn, !selectedExpId && { opacity: 0.4 }]}
                  onPress={handleContinuePick} disabled={!selectedExpId} activeOpacity={0.85}
                >
                  <Text style={s.purpleBtnText}>Continuar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Step: manual form ── */}
          {step === 'form' && (
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <View style={{ gap: sp.sm }}>
                <Text style={s.sectionLabel}>DESCRIPCIÓN</Text>
                <TextInput
                  style={s.textInput} value={description} onChangeText={setDescription}
                  placeholder="Ej: Cena en el restorán" placeholderTextColor={C.muted}
                  autoFocus autoCapitalize="sentences"
                />
              </View>
              <View style={{ gap: sp.sm }}>
                <Text style={s.sectionLabel}>MONTO TOTAL (ARS)</Text>
                <TextInput
                  style={s.textInput} value={amountStr} onChangeText={setAmountStr}
                  placeholder="$ 0" placeholderTextColor={C.muted} keyboardType="decimal-pad"
                />
              </View>
              <View style={{ gap: sp.sm }}>
                <Text style={s.sectionLabel}>FECHA</Text>
                <TextInput
                  style={s.textInput} value={dateStr} onChangeText={setDateStr}
                  placeholder="YYYY-MM-DD" placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <TouchableOpacity
                style={[s.purpleBtn, (!description.trim() || !amountStr) && { opacity: 0.4 }]}
                onPress={handleContinueForm} disabled={!description.trim() || !amountStr} activeOpacity={0.85}
              >
                <Text style={s.purpleBtnText}>Continuar</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── Step: details (payer, participants, split) ── */}
          {step === 'details' && (
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              {/* Mini expense preview */}
              <View style={s.miniExpCard}>
                <View style={[s.expIcon, { backgroundColor: expenseIcon(description).iconBg }]}>
                  <Ionicons name={expenseIcon(description).icon as any} size={18} color={expenseIcon(description).iconColor} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.expName} numberOfLines={1}>{description || 'Sin descripción'}</Text>
                  <Text style={s.expMeta}>{dateStr}</Text>
                </View>
                <Text style={s.expAmount}>{formatCurrency(parseFloat(amountStr.replace(',', '.')) || 0)}</Text>
              </View>

              {/* Quién pagó */}
              <View style={{ gap: sp.md }}>
                <Text style={s.sectionLabel}>¿QUIÉN PAGÓ?</Text>
                <View style={s.card}>
                  {members.map((m, i) => (
                    <View key={m.userId}>
                      {i > 0 && <View style={s.divider} />}
                      <TouchableOpacity style={s.payerRow} onPress={() => setPaidById(m.userId)} activeOpacity={0.8}>
                        <Avatar name={m.name} color={m.color} size={36} />
                        <Text style={s.payerName}>{m.isMe ? `${m.name} (vos)` : m.name}</Text>
                        {paidById === m.userId && <Ionicons name="checkmark-circle" size={20} color={PURPLE} />}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>

              {/* Entre quiénes */}
              <View style={{ gap: sp.md }}>
                <Text style={s.sectionLabel}>¿ENTRE QUIÉNES SE DIVIDE?</Text>
                <View style={s.avatarRow}>
                  {members.map(m => {
                    const isIn = included.has(m.userId);
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        onPress={() => setIncluded(prev => {
                          const next = new Set(prev);
                          if (next.has(m.userId)) next.delete(m.userId); else next.add(m.userId);
                          return next;
                        })}
                        activeOpacity={0.8}
                        style={{ alignItems: 'center', gap: sp.xs }}
                      >
                        <View style={[
                          s.avatarBase,
                          { width: 52, height: 52, borderRadius: 26, backgroundColor: m.color + '22' },
                          isIn && { borderWidth: 2.5, borderColor: PURPLE },
                          !isIn && { opacity: 0.35 },
                        ]}>
                          {isIn && (
                            <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: PURPLE, borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.white }}>
                              <Ionicons name="checkmark" size={11} color={C.white} />
                            </View>
                          )}
                          <Text style={[s.avatarInitial, { color: m.color, fontSize: 20 }]}>{m.initial}</Text>
                        </View>
                        <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 10, color: isIn ? C.text : C.muted }}>
                          {m.isMe ? 'Vos' : m.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Cómo se divide */}
              <View style={{ gap: sp.md }}>
                <Text style={s.sectionLabel}>¿CÓMO SE DIVIDE?</Text>
                {([
                  { val: 'equal'  as SplitMode, label: 'Partes iguales',   desc: `${formatCurrency(totalAmt / Math.max(included.size, 1))} c/u` },
                  { val: 'custom' as SplitMode, label: 'Personalizado',    desc: 'Definir montos diferentes por persona' },
                ]).map(opt => (
                  <TouchableOpacity
                    key={opt.val}
                    style={[s.radioRow, splitMode === opt.val && { borderColor: PURPLE + '80', backgroundColor: PURPLE + '06' }]}
                    onPress={() => setSplitMode(opt.val)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.radioCircle, splitMode === opt.val && { borderColor: PURPLE }]}>
                      {splitMode === opt.val && <View style={[s.radioDot, { backgroundColor: PURPLE }]} />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.radioTitle, splitMode === opt.val && { color: PURPLE }]}>{opt.label}</Text>
                      <Text style={s.radioDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom amount inputs */}
              {splitMode === 'custom' && (
                <View style={{ gap: sp.md }}>
                  <Text style={s.sectionLabel}>MONTOS POR PERSONA</Text>
                  {includedMembers.map(m => (
                    <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: sp.md }}>
                      <Avatar name={m.name} color={m.color} size={34} />
                      <Text style={[s.payerName, { flex: 1 }]}>{m.isMe ? 'Vos' : m.name.split(' ')[0]}</Text>
                      <TextInput
                        style={[s.textInput, { width: 130, textAlign: 'right', paddingVertical: sp.sm }]}
                        value={customAmounts[m.userId] ?? ''}
                        onChangeText={v => setCustomAmounts(prev => ({ ...prev, [m.userId]: v }))}
                        placeholder="$ 0"
                        placeholderTextColor={C.muted}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: sp.xs }}>
                    {isCustomValid
                      ? <><Ionicons name="checkmark-circle" size={15} color={C.green} /><Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 12, color: C.green }}>Montos completos</Text></>
                      : totalAmt - customTotal > 0
                        ? <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 12, color: '#D97706' }}>Faltan {formatCurrency(totalAmt - customTotal)} por asignar</Text>
                        : <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 12, color: C.red }}>Te pasaste por {formatCurrency(customTotal - totalAmt)}</Text>
                    }
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[s.purpleBtn, (saving || included.size === 0 || !isCustomValid) && { opacity: 0.4 }]}
                onPress={handleSave} disabled={saving || included.size === 0 || !isCustomValid} activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.purpleBtnText}>Guardar gasto</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && savedExpense && (
            <ScrollView contentContainerStyle={[s.modalBody, { alignItems: 'center', paddingTop: sp.xxl }]}>
              <Ionicons name="checkmark-circle" size={80} color={PURPLE} />
              <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 22, color: C.text, textAlign: 'center', marginTop: sp.md }}>
                ¡Gasto compartido!
              </Text>
              <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.muted, textAlign: 'center' }}>
                El gasto se agregó correctamente al grupo.
              </Text>

              {/* Si el usuario pagó, mostrar su parte real destacada */}
              {savedExpense.isPayer && (
                <View style={{ backgroundColor: PURPLE_LT, borderRadius: 14, padding: sp.lg, width: '100%', marginTop: sp.xl, alignItems: 'center', gap: sp.xs }}>
                  <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: PURPLE }}>Tu gasto real</Text>
                  <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 32, color: PURPLE }}>
                    {formatCurrency(savedExpense.myShare)}
                  </Text>
                  <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted }}>
                    de {formatCurrency(savedExpense.amount)} totales — los demás te deben el resto
                  </Text>
                </View>
              )}

              <View style={[s.card, { width: '100%', marginTop: savedExpense.isPayer ? sp.md : sp.xl }]}>
                <View style={{ padding: sp.lg, gap: sp.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.expName, { flex: 1 }]} numberOfLines={1}>{savedExpense.description}</Text>
                    <Text style={[s.expAmount, { color: PURPLE }]}>{formatCurrency(savedExpense.amount)}</Text>
                  </View>
                  <View style={s.divider} />
                  <View style={{ gap: sp.sm }}>
                    {[
                      { label: 'Pagó', value: savedExpense.paidByName },
                      { label: 'Se divide entre', value: `${savedExpense.count} personas` },
                      { label: 'Por persona', value: formatCurrency(savedExpense.amount / savedExpense.count) },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: 'row', gap: sp.sm, alignItems: 'center' }}>
                        <Text style={s.radioDesc}>{row.label}:</Text>
                        <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text }}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[s.purpleBtn, { width: '100%', marginTop: sp.xl }]}
                onPress={() => { reset(); onClose(); }} activeOpacity={0.85}
              >
                <Text style={s.purpleBtnText}>Ver en el grupo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingVertical: sp.md, marginTop: sp.sm }}
                onPress={() => {
                  setStep('source'); setSavedExpense(null); setSource('manual');
                  setDescription(''); setAmountStr('');
                  setDateStr(new Date().toISOString().split('T')[0]);
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text2 }}>
                  Agregar otro gasto
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [detail,        setDetail]        = useState<FetchResult | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<Tab>('resumen');
  const [showAddExp,    setShowAddExp]    = useState(false);
  const [editingMember, setEditingMember] = useState<MemberDetail | null>(null);

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    const data = await fetchGroupDetail(id, user.id);
    setDetail(data);
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const isFriends  = detail?.kind === 'amigos';
  const isAdmin    = detail?.myRole === 'Admin';
  const accentColor = isFriends ? C.purple : C.green;
  const headerBg    = isFriends ? C.purpleLt : C.greenLt;

  const familyTabs: { key: Tab; label: string }[] = [
    { key: 'resumen',  label: 'Resumen'  },
    { key: 'miembros', label: 'Miembros' },
    { key: 'gastos',   label: 'Gastos'   },
    { key: 'permisos', label: 'Permisos' },
  ];
  const friendsTabs: { key: Tab; label: string }[] = [
    { key: 'resumen',  label: 'Resumen'  },
    { key: 'gastos',   label: 'Gastos'   },
    { key: 'deudas',   label: 'Deudas'   },
    { key: 'miembros', label: 'Miembros' },
  ];

  const handleLeave = () => {
    Alert.alert('Salir del grupo', '¿Querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive', onPress: async () => {
          if (!id || !user?.id) return;
          await (supabase as any).from('family_members')
            .delete().eq('group_id', id).eq('user_id', user.id);
          router.replace('/(app)/family' as any);
        },
      },
    ]);
  };

  const handleInvite = () => {
    if (detail?.inviteCode) {
      router.push({
        pathname: '/(app)/group-code',
        params: { code: detail.inviteCode, groupName: detail.name, groupId: id },
      } as any);
    }
  };

  const handleMemberPress = (m: MemberDetail) => {
    if (!isAdmin || !id) return;
    router.push({
      pathname: '/(app)/member-detail',
      params: { userId: m.userId, groupId: id, memberName: m.name },
    } as any);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { borderBottomColor: accentColor + '20' }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.replace('/(app)/family' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>

        {detail ? (
          <View style={s.headerCenter}>
            <View style={[s.headerIconBox, { backgroundColor: headerBg }]}>
              <Ionicons name={isFriends ? 'people' : 'home'} size={22} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle} numberOfLines={1}>{detail.name}</Text>
              <Text style={s.headerSub}>
                {detail.members.length} miembro{detail.members.length !== 1 ? 's' : ''} · {isFriends ? 'Grupo de amigos' : 'Grupo familiar'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Grupo</Text>
          </View>
        )}

        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={handleLeave}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={22} color={C.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={accentColor} size="large" />
        </View>
      ) : !detail ? (
        <View style={s.centered}>
          <Text style={s.emptyTitle}>No se pudo cargar el grupo.</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: sp.md }}>
            <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.purple }}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(app)/family' as any)} style={{ marginTop: sp.sm }}>
            <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted }}>Volver a Grupos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TabBar
            tabs={isFriends ? friendsTabs : familyTabs}
            active={activeTab}
            onChange={setActiveTab}
            accentColor={accentColor}
          />

          {isFriends ? (
            <>
              {activeTab === 'resumen'  && (
                <FriendsResumenTab
                  detail={detail} onAddExpense={() => setShowAddExp(true)} myUserId={user!.id}
                  rawSplits={detail.rawSplits} rawExpenses={detail.rawExpenses}
                />
              )}
              {activeTab === 'gastos'   && (
                <GastosTab
                  detail={detail} onAddExpense={() => setShowAddExp(true)} isFriends
                  rawSplits={detail.rawSplits} myUserId={user!.id}
                  isAdmin={isAdmin} groupId={id!} onRefresh={load}
                />
              )}
              {activeTab === 'deudas'   && <DeudasTab detail={detail} myUserId={user!.id} />}
              {activeTab === 'miembros' && (
                <MiembrosTab detail={detail} isAdmin={isAdmin} isFriends={true} onEdit={setEditingMember} onInvite={handleInvite} />
              )}
            </>
          ) : (
            <>
              {activeTab === 'resumen'  && (
                <FamilyResumenTab detail={detail} isAdmin={isAdmin} onInvite={handleInvite} onMemberPress={handleMemberPress} />
              )}
              {activeTab === 'miembros' && (
                <MiembrosTab detail={detail} isAdmin={isAdmin} isFriends={false} onEdit={setEditingMember} onInvite={handleInvite} />
              )}
              {activeTab === 'gastos'   && (
                <GastosTab detail={detail} onAddExpense={() => {}} isFriends={false}
                  rawSplits={[]} myUserId={user!.id}
                  isAdmin={isAdmin} groupId={id!} onRefresh={load}
                />
              )}
              {activeTab === 'permisos' && <PermisosTab detail={detail} />}
            </>
          )}

          {isFriends && (
            <AddExpenseModal
              visible={showAddExp}
              onClose={() => setShowAddExp(false)}
              members={detail.members}
              groupId={id!}
              userId={user!.id}
              onSaved={load}
            />
          )}

          <MemberEditModal
            visible={editingMember !== null}
            member={editingMember}
            groupId={id!}
            allMembers={detail.members}
            onClose={() => setEditingMember(null)}
            onSaved={() => { setEditingMember(null); load(); }}
          />
        </>
      )}

    </SafeAreaView>
  );
}

// ─── Estilos: RecordarModal ───────────────────────────────────────────────────

const rm = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp.xl, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text },
  body:          { padding: sp.xl, gap: sp.lg, paddingBottom: 48 },
  label:         { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text2 },
  toneRow:       { flexDirection: 'row', gap: sp.sm },
  toneCard:      { flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, padding: sp.md, alignItems: 'center', gap: 4, backgroundColor: C.white },
  toneCardActive:{ borderColor: C.purple, backgroundColor: C.purpleLt },
  toneEmoji:     { fontSize: 26 },
  toneName:      { fontFamily: 'Montserrat_700Bold', fontSize: 12, color: C.text },
  toneSub:       { fontFamily: 'Montserrat_400Regular', fontSize: 10, color: C.muted, textAlign: 'center' },
  previewWrap:   { backgroundColor: '#E8F5E9', borderRadius: 16, padding: sp.lg },
  bubble:        { backgroundColor: C.white, borderRadius: 14, padding: sp.md, gap: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  bubbleText:    { fontFamily: 'Montserrat_400Regular', fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTime:    { fontFamily: 'Montserrat_400Regular', fontSize: 10, color: C.muted, textAlign: 'right' },
  sendBtn:       { backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText:      { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },
});

// ─── Estilos: FriendsResumenTab ───────────────────────────────────────────────

const fr = StyleSheet.create({
  statsRow:          { flexDirection: 'row', gap: sp.sm },
  statCard:          { flex: 1, borderRadius: 16, borderWidth: 1, padding: sp.lg, gap: 4 },
  statLabel:         { fontFamily: 'Montserrat_600SemiBold', fontSize: 11, color: C.text2 },
  statAmt:           { fontFamily: 'Montserrat_700Bold', fontSize: 22, letterSpacing: -0.5 },
  statSub:           { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  tipCard:           { backgroundColor: C.purpleLt, borderRadius: 14, padding: sp.lg, flexDirection: 'row', gap: sp.sm, alignItems: 'flex-start' },
  tipIcon:           { fontSize: 18, marginTop: 1 },
  tipText:           { fontFamily: 'Montserrat_500Medium', fontSize: 13, color: C.purple, flex: 1, lineHeight: 18 },
  balanceCard:       { backgroundColor: C.white, borderRadius: 16, padding: sp.lg, flexDirection: 'row', alignItems: 'center', gap: sp.md, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  balanceName:       { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text },
  balanceBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  balanceBadgeText:  { fontFamily: 'Montserrat_600SemiBold', fontSize: 11 },
  balanceAmt:        { fontFamily: 'Montserrat_700Bold', fontSize: 16 },
  remindBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.purpleLt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  remindBtnText:     { fontFamily: 'Montserrat_600SemiBold', fontSize: 11, color: C.purple },
  recAllBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.purple, paddingVertical: 14 },
  recAllText:        { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.purple },
  rankCard:          { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  rankRow:           { flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingHorizontal: sp.lg, paddingVertical: sp.md },
  rankMedal:         { fontSize: 20, width: 28, textAlign: 'center' },
  rankName:          { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.text },
  rankSub:           { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  rankPts:           { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.green },
});

// ─── Estilos: solicitar edición ──────────────────────────────────────────────

const req = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp.xl, borderBottomWidth: 1, borderBottomColor: C.border },
  title:       { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text },
  body:        { padding: sp.xl, gap: sp.md, paddingBottom: 48 },
  currentCard: { backgroundColor: C.purpleLt, borderRadius: 12, padding: sp.lg, gap: 4, marginBottom: sp.sm },
  currentLabel:{ fontFamily: 'Montserrat_700Bold', fontSize: 9, letterSpacing: 1.2, color: C.purple },
  currentName: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text },
  currentMeta: { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.text2 },
  fieldLabel:  { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text2 },
  input:       { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'Montserrat_400Regular', fontSize: 15, color: C.text, backgroundColor: C.white },
  inputMulti:  { height: 90, textAlignVertical: 'top' },
  submitBtn:   { backgroundColor: C.purple, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: sp.sm },
  submitText:  { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },
});

// ─── Estilos: pending requests section ───────────────────────────────────────

const prs = StyleSheet.create({
  wrap:       { gap: sp.sm, marginBottom: sp.md },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:      { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.text, flex: 1 },
  badge:      { backgroundColor: C.purple, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:  { fontFamily: 'Montserrat_700Bold', fontSize: 11, color: C.white },
  card:       { backgroundColor: C.white, borderRadius: 12, padding: sp.md, gap: 6, borderWidth: 1, borderColor: C.border },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requester:  { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.text },
  dateText:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  expName:    { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text },
  change:     { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.text2 },
  reason:     { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, fontStyle: 'italic' },
  actions:    { flexDirection: 'row', gap: sp.sm, marginTop: sp.xs },
  rejectBtn:  { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  rejectText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text2 },
  approveBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: C.purple },
  approveText:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.white },
});

// ─── Estilos: GastosTab extras ───────────────────────────────────────────────

const gt = StyleSheet.create({
  editRequestBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: sp.lg, paddingBottom: sp.sm },
  editRequestText: { fontFamily: 'Montserrat_500Medium', fontSize: 11, color: C.purple },
});

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp.xl, gap: sp.md },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    paddingHorizontal: sp.xl, paddingVertical: sp.md,
    backgroundColor: C.white, borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerCenter:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp.md },
  headerIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:   { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text, letterSpacing: -0.2 },
  headerSub:     { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted, marginTop: 2 },

  // Tabs
  tabBar:  { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabLabel:{ fontFamily: 'Montserrat_500Medium', fontSize: 12, color: C.muted },

  // Content
  tabContent: { paddingHorizontal: sp.xl, paddingTop: sp.xl, paddingBottom: 100, gap: sp.lg },

  // Card
  card: {
    backgroundColor: C.white, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardSectionTitle: {
    fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text,
    paddingHorizontal: sp.lg, paddingTop: sp.lg, paddingBottom: sp.sm,
  },

  // Sections
  sectionTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text },
  sectionLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: C.muted, letterSpacing: 0.8 },

  // Summary
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: sp.lg, paddingVertical: sp.md,
  },
  summaryCol:   { gap: 4 },
  summaryLabel: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  summaryAmt:   { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: C.text, letterSpacing: -0.4 },

  divider: { height: 1, backgroundColor: C.border },

  // Admin card
  adminCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: sp.md,
    backgroundColor: C.greenLt, borderRadius: 14,
    padding: sp.lg,
  },
  adminCardIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#ffffff80',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  adminCardTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.green },
  adminCardDesc:  { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.text2, lineHeight: 19 },

  // Members
  memberRow:     { flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingHorizontal: sp.lg, paddingVertical: sp.md },
  memberCardRow: { flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingHorizontal: sp.lg, paddingVertical: sp.md },
  memberName:    { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text },
  memberEmail:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  memberAmt:     { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text2, flexShrink: 0, marginLeft: 'auto' },
  memberMeta:    { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted },
  memberTopCat:  { fontFamily: 'Montserrat_500Medium', fontSize: 11, color: C.green },
  memberPending: { fontFamily: 'Montserrat_500Medium', fontSize: 11, color: '#D97706' },

  // Role badge
  roleBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  roleBadgeText: { fontFamily: 'Montserrat_700Bold', fontSize: 10, letterSpacing: 0.2 },

  // Avatar
  avatarBase:    { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial: { fontFamily: 'Montserrat_700Bold' },
  avatarRow:     { flexDirection: 'row', gap: sp.md, flexWrap: 'wrap' },

  // Expense row
  expRow:    { flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg },
  expIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  expName:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text },
  expMeta:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  expAmount: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text, flexShrink: 0 },

  // Debt
  debtRow:   { flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingHorizontal: sp.lg, paddingVertical: sp.md },
  debtLabel: { fontFamily: 'Montserrat_500Medium', fontSize: 13, color: C.text, flex: 1 },
  debtAmt:   { fontFamily: 'Montserrat_700Bold', fontSize: 14, flexShrink: 0 },

  // Buttons
  greenBtn: {
    backgroundColor: C.green, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    paddingVertical: 16,
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  greenBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },

  purpleBtn: {
    backgroundColor: C.purple, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    paddingVertical: 16,
    shadowColor: C.purple, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  purpleBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },

  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.green + '60',
    paddingVertical: 14, backgroundColor: C.greenLt,
  },
  inviteBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.green },

  addSmallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, borderWidth: 1, borderColor: C.purple + '60',
    paddingHorizontal: sp.sm, paddingVertical: sp.xs,
    backgroundColor: C.purpleLt,
  },
  addSmallText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 12, color: C.purple },

  microcopy: {
    fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted,
    textAlign: 'center', lineHeight: 18,
  },

  // Info box
  infoBox: {
    flexDirection: 'row', gap: sp.sm, alignItems: 'flex-start',
    backgroundColor: C.purpleLt, borderRadius: 12, padding: sp.md,
  },
  infoText: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.text2, flex: 1, lineHeight: 17 },

  // Empty
  emptyBox:   { alignItems: 'center', gap: sp.md, paddingVertical: sp.xxl },
  emptyTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text },
  emptySub:   { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted, textAlign: 'center' },

  // Permisos
  permRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: sp.md, padding: sp.lg },
  permIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permTitle:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text },
  permDesc: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, lineHeight: 17 },

  // Modal
  modal: { flex: 1, backgroundColor: C.white },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.xl, paddingVertical: sp.lg,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 17, color: C.text },
  modalBody:  { paddingHorizontal: sp.xl, paddingTop: sp.xl, paddingBottom: 40, gap: sp.xl },

  // Edit member
  editName:  { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: C.text },
  editEmail: { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted },

  // Radio
  radioRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: sp.md,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    padding: sp.lg, backgroundColor: C.white,
  },
  radioRowActive: { borderColor: C.green + '80', backgroundColor: C.greenLt },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  radioCircleActive: { borderColor: C.green, backgroundColor: C.white },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green },
  radioTitle: { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text },
  radioDesc:  { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, lineHeight: 17 },

  // Checkbox
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxActive: { backgroundColor: C.green, borderColor: C.green },
  checkLabel: { fontFamily: 'Montserrat_500Medium', fontSize: 14, color: C.text, flex: 1 },

  // Text input
  textInput: {
    fontFamily: 'Montserrat_500Medium', fontSize: 16, color: C.text,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: sp.lg, paddingVertical: sp.md, backgroundColor: C.bg,
  },

  // Payer
  payerRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    paddingHorizontal: sp.lg, paddingVertical: sp.md,
  },
  payerName: { fontFamily: 'Montserrat_500Medium', fontSize: 14, color: C.text, flex: 1 },

  // Source cards (step 1)
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 16,
    padding: sp.lg, backgroundColor: C.white,
  },
  sourceIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Personal expense picker (step 2)
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: sp.sm,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: sp.md, paddingVertical: sp.sm,
  },
  searchInput: {
    flex: 1, fontFamily: 'Montserrat_400Regular', fontSize: 14,
    color: C.text, paddingVertical: 0,
  },
  pickExpRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, padding: sp.md,
  },
  createManualRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    borderRadius: 12, borderWidth: 1, borderColor: '#8B5CF630',
    backgroundColor: '#F5F3FF', padding: sp.md, marginTop: sp.sm,
  },

  // Mini expense preview (details step)
  miniExpCard: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: sp.md,
  },

  // Expense row split info
  expSplitRow: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  expSplitText: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  expParticipants: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#8B5CF614', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  expParticipantsText: { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: '#8B5CF6' },
});
