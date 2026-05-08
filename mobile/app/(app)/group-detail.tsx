import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
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
  purple:   '#8B5CF6',
  purpleLt: '#F3EEFF',
  green:    '#2E7D32',
  greenLt:  '#DCFCE7',
  text:     '#111111',
  text2:    '#444444',
  muted:    '#757575',
  border:   '#E5E7EB',
  red:      '#EF4444',
  success:  '#10B981',
  amber:    '#F59E0B',
} as const;

const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

const GROUP_COLORS  = ['#8B5CF6', '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#EC4899'];
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
  userId:      string;
  name:        string;
  email:       string;
  initial:     string;
  color:       string;
  role:        MemberRole;
  monthTotal:  number;
  isMe:        boolean;
  permissions: MemberPermissions;
}

interface GroupExpense {
  id:          string;
  amount:      number;
  date:        string;
  description: string;
  paidByName:  string;
  paidById:    string;
  icon:        string;
  iconBg:      string;
  iconColor:   string;
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
  if (d.includes('nafta') || d.includes('combustible') || d.includes('ypf'))
    return { icon: 'car-outline',        iconBg: '#FCE7F3', iconColor: '#9D174D' };
  if (d.includes('viaje') || d.includes('vuelo') || d.includes('hotel'))
    return { icon: 'airplane-outline',   iconBg: '#E0F2FE', iconColor: '#0369A1' };
  if (d.includes('farmacia') || d.includes('medic'))
    return { icon: 'medical-outline',    iconBg: '#FCE7F3', iconColor: '#BE185D' };
  return { icon: 'cash-outline', iconBg: '#F3F4F6', iconColor: '#6B7280' };
}

function buildMemberName(full_name: string, email: string): string {
  const name = full_name?.trim();
  if (name) return name;
  if (email) return email.split('@')[0];
  return 'Usuario sin nombre';
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
      debts.push({
        fromUserId:  debt[di].userId,
        fromName:    debt[di].isMe ? 'Vos' : debt[di].name,
        fromInitial: debt[di].initial,
        fromColor:   debt[di].color,
        toUserId:    cred[ci].userId,
        toName:      cred[ci].isMe ? 'vos' : cred[ci].name,
        amount,
        isMe: debt[di].userId === userId,
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

  // get_group_members RPC obtiene nombre + email desde auth.users (fix nombres vacíos)
  const [membersInfoResult, expResult, groupExpResult] = await Promise.all([
    db.rpc('get_group_members', { p_group_id: groupId }),

    !isFriends
      ? supabase.from('expenses')
          .select('id, user_id, amount, date, description')
          .in('user_id', isAdmin ? allUserIds : [userId])
          .gte('date', currentMonthStart())
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),

    isFriends
      ? db.from('group_expenses')
          .select('id, paid_by, description, amount, date')
          .eq('group_id', groupId)
          .gte('date', currentMonthStart())
          .order('date', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  // Mapa de info de miembros (nombre, email, permisos)
  const membersInfoMap: Record<string, any> = {};
  for (const m of membersInfoResult.data ?? []) membersInfoMap[m.user_id] = m;

  // Totales
  const totals: Record<string, number> = {};
  if (!isFriends) {
    for (const e of expResult.data ?? []) {
      totals[e.user_id] = (totals[e.user_id] ?? 0) + Number(e.amount);
    }
  }

  // Construir members con nombre real desde RPC
  const members: MemberDetail[] = membersRaw.map((m: any) => {
    const info     = membersInfoMap[m.user_id] ?? {};
    const name     = buildMemberName(info.full_name ?? '', info.email ?? '');
    const email    = info.email ?? '';
    const rawPerms = info.permissions;
    const permissions: MemberPermissions =
      rawPerms && typeof rawPerms === 'object'
        ? { ...DEFAULT_PERMS, ...rawPerms }
        : DEFAULT_PERMS;
    return {
      userId:      m.user_id,
      name,
      email,
      initial:     name.charAt(0).toUpperCase(),
      color:       AVATAR_COLORS[hashIdx(m.user_id, AVATAR_COLORS.length)],
      role:        mapRole(m.role),
      monthTotal:  totals[m.user_id] ?? 0,
      isMe:        m.user_id === userId,
      permissions,
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

    expenses = (groupExpResult.data ?? []).map((e: any) => {
      const payer = members.find(m => m.userId === e.paid_by);
      return {
        id:          e.id,
        amount:      Number(e.amount),
        date:        e.date,
        description: e.description || 'Sin descripción',
        paidByName:  payer?.isMe ? 'Vos' : (payer?.name ?? 'Miembro'),
        paidById:    e.paid_by,
        ...expenseIcon(e.description ?? ''),
      };
    });
  } else {
    expenses = (expResult.data ?? []).map((e: any) => {
      const payer = members.find(m => m.userId === e.user_id);
      return {
        id:          e.id,
        amount:      Number(e.amount),
        date:        e.date,
        description: e.description || 'Sin descripción',
        paidByName:  payer?.isMe ? 'Vos' : (payer?.name ?? 'Miembro'),
        paidById:    e.user_id,
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

function TabBar({ tabs, active, onChange }: {
  tabs: { key: Tab; label: string }[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <View style={s.tabBar}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[s.tabItem, active === t.key && s.tabActive]}
          onPress={() => onChange(t.key)}
          activeOpacity={0.7}
        >
          <Text style={[s.tabLabel, active === t.key && s.tabLabelActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense }: { expense: GroupExpense }) {
  return (
    <View style={s.expRow}>
      <View style={[s.expIcon, { backgroundColor: expense.iconBg }]}>
        <Ionicons name={expense.icon as any} size={18} color={expense.iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.expName} numberOfLines={1}>{expense.description}</Text>
        <Text style={s.expMeta}>{dateLabel(expense.date)} · {expense.paidByName}</Text>
      </View>
      <Text style={s.expAmount}>{formatCurrency(expense.amount)}</Text>
    </View>
  );
}

// ─── Modal: Editar miembro ────────────────────────────────────────────────────

const PERM_LABELS: { key: keyof MemberPermissions; label: string; desc: string }[] = [
  { key: 'can_view_expenses', label: 'Ver gastos del grupo',   desc: 'Puede ver todos los gastos del grupo' },
  { key: 'can_add_expenses',  label: 'Cargar gastos',          desc: 'Puede agregar nuevos gastos' },
  { key: 'can_view_members',  label: 'Ver resumen de miembros',desc: 'Puede ver totales de otros miembros' },
  { key: 'can_invite',        label: 'Invitar personas',       desc: 'Puede compartir el código de invitación' },
  { key: 'can_manage_roles',  label: 'Administrar roles',      desc: 'Puede cambiar roles de otros miembros' },
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

    // Proteger último admin
    if (selectedRole === 'Miembro' && member.role === 'Admin') {
      const otherAdmins = allMembers.filter(m => m.role === 'Admin' && m.userId !== member.userId);
      if (otherAdmins.length === 0) {
        Alert.alert(
          'El grupo debe tener al menos un Admin',
          'Promové a otro miembro antes de quitar este rol de Admin.',
        );
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
          <Text style={s.modalTitle}>Editar miembro</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>

          {/* Miembro info */}
          <View style={s.editMemberInfo}>
            <View style={[s.memberAvatar, { backgroundColor: member.color + '22', width: 48, height: 48, borderRadius: 24 }]}>
              <Text style={[s.memberInitial, { color: member.color, fontSize: 18 }]}>{member.initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.editMemberName}>{member.name}</Text>
              {member.email ? (
                <Text style={s.editMemberEmail}>{member.email}</Text>
              ) : null}
            </View>
          </View>

          {/* Cambiar rol */}
          <View style={{ gap: sp.sm }}>
            <Text style={s.inputLabel}>ROL</Text>
            <View style={s.roleRow}>
              {(['Admin', 'Miembro'] as MemberRole[]).map(role => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleBtn, selectedRole === role && s.roleBtnActive]}
                  onPress={() => setSelectedRole(role)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={role === 'Admin' ? 'shield-checkmark-outline' : 'person-outline'}
                    size={16}
                    color={selectedRole === role ? C.purple : C.muted}
                  />
                  <Text style={[s.roleBtnText, selectedRole === role && { color: C.purple }]}>
                    {role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.roleHint}>
              {selectedRole === 'Admin'
                ? 'Puede cambiar roles y configuración del grupo.'
                : 'Acceso limitado según los permisos definidos abajo.'}
            </Text>
          </View>

          {/* Permisos */}
          <View style={{ gap: sp.sm }}>
            <Text style={s.inputLabel}>PERMISOS</Text>
            <View style={s.expCard}>
              {PERM_LABELS.map((p, i) => (
                <View key={p.key}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.permToggleRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.permTitle}>{p.label}</Text>
                      <Text style={s.permDesc}>{p.desc}</Text>
                    </View>
                    <Switch
                      value={perms[p.key]}
                      onValueChange={() => togglePerm(p.key)}
                      trackColor={{ true: C.purple + '60', false: C.border }}
                      thumbColor={perms[p.key] ? C.purple : '#ccc'}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, saving && s.primaryBtnOff]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.primaryBtnText}>Guardar cambios</Text>
            }
          </TouchableOpacity>

        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Tab: Resumen (Familia) ───────────────────────────────────────────────────

function FamilyResumenTab({ detail }: { detail: GroupDetail }) {
  const recent = detail.expenses.slice(0, 6);
  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={s.summaryCard}>
        <View style={s.summaryTop}>
          <Text style={s.summaryMonthLabel}>Resumen del mes</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.summaryTotalLabel}>Total grupal</Text>
            <Text style={s.summaryTotal}>{formatCurrency(detail.totalMonth)}</Text>
          </View>
        </View>
        <Text style={s.summaryMonthSub}>{monthLabel()}</Text>
        <View style={s.summaryDivider} />
        <View style={s.summaryRow}>
          <View style={s.summaryCol}>
            <Text style={s.summaryColLabel}>Tu gasto</Text>
            <Text style={s.summaryColAmt}>{formatCurrency(detail.myMonthTotal)}</Text>
          </View>
          <View style={[s.summaryCol, { alignItems: 'flex-end' }]}>
            <Text style={s.summaryColLabel}>Miembros</Text>
            <Text style={s.summaryColAmt}>{detail.members.length}</Text>
          </View>
        </View>
      </View>

      {recent.length > 0 ? (
        <>
          <Text style={s.sectionLabel}>Gastos recientes</Text>
          <View style={s.expCard}>
            {recent.map((e, i) => (
              <View key={e.id}>
                {i > 0 && <View style={s.divider} />}
                <ExpenseRow expense={e} />
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>Sin gastos este mes</Text>
          <Text style={s.emptySubtitle}>Los gastos del grupo aparecerán acá.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tab: Resumen (Amigos) ────────────────────────────────────────────────────

function FriendsResumenTab({ detail, onAddExpense }: { detail: GroupDetail; onAddExpense: () => void }) {
  const me         = detail.members.find(m => m.isMe);
  const myDebt     = detail.debts.filter(d => d.fromUserId === me?.userId);
  const owedToMe   = detail.debts.filter(d => d.toUserId   === me?.userId);

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={s.summaryCard}>
        <View style={s.summaryTop}>
          <Text style={s.summaryMonthLabel}>Tu balance</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.summaryTotalLabel}>Total grupal</Text>
            <Text style={s.summaryTotal}>{formatCurrency(detail.totalMonth)}</Text>
          </View>
        </View>
        <Text style={s.summaryMonthSub}>{monthLabel()}</Text>
        <View style={s.summaryDivider} />
        <View style={s.summaryRow}>
          <View style={s.summaryCol}>
            <Text style={s.summaryColLabel}>Pagaste</Text>
            <Text style={[s.summaryColAmt, { color: C.purple }]}>{formatCurrency(detail.myMonthTotal)}</Text>
          </View>
          <View style={[s.summaryCol, { alignItems: 'center' }]}>
            <Text style={s.summaryColLabel}>Te deben</Text>
            <Text style={[s.summaryColAmt, { color: C.success }]}>
              {formatCurrency(owedToMe.reduce((s, d) => s + d.amount, 0))}
            </Text>
          </View>
          <View style={[s.summaryCol, { alignItems: 'flex-end' }]}>
            <Text style={s.summaryColLabel}>Debés</Text>
            <Text style={[s.summaryColAmt, { color: myDebt.length > 0 ? C.red : C.text }]}>
              {formatCurrency(myDebt.reduce((s, d) => s + d.amount, 0))}
            </Text>
          </View>
        </View>
      </View>

      {detail.debts.length > 0 && (
        <>
          <Text style={s.sectionLabel}>Deudas pendientes</Text>
          <View style={s.expCard}>
            {detail.debts.slice(0, 3).map((d, i) => (
              <View key={`${d.fromUserId}-${d.toUserId}`}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.debtRow}>
                  <View style={[s.memberAvatar, { backgroundColor: d.fromColor + '22', width: 36, height: 36, borderRadius: 18 }]}>
                    <Text style={[s.memberInitial, { color: d.fromColor, fontSize: 13 }]}>{d.fromInitial}</Text>
                  </View>
                  <Text style={s.debtText} numberOfLines={1}>
                    <Text style={{ fontFamily: 'Montserrat_700Bold' }}>{d.fromName}</Text>
                    {' le debe a '}
                    <Text style={{ fontFamily: 'Montserrat_700Bold' }}>{d.toName}</Text>
                  </Text>
                  <Text style={[s.debtAmount, d.isMe && { color: C.red }]}>{formatCurrency(d.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {detail.expenses.length > 0 && (
        <>
          <Text style={s.sectionLabel}>Gastos recientes</Text>
          <View style={s.expCard}>
            {detail.expenses.slice(0, 5).map((e, i) => (
              <View key={e.id}>
                {i > 0 && <View style={s.divider} />}
                <ExpenseRow expense={e} />
              </View>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={s.ctaBtn} onPress={onAddExpense} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color={C.white} />
        <Text style={s.ctaBtnText}>Agregar gasto compartido</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Tab: Gastos ──────────────────────────────────────────────────────────────

function GastosTab({ detail, onAddExpense, isFriends }: {
  detail: GroupDetail; onAddExpense: () => void; isFriends: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[s.sectionRow, { marginBottom: sp.xs }]}>
        <Text style={s.sectionLabel}>{monthLabel()}</Text>
        {isFriends && (
          <TouchableOpacity style={s.addSmallBtn} onPress={onAddExpense} activeOpacity={0.8}>
            <Ionicons name="add" size={14} color={C.purple} />
            <Text style={s.addSmallText}>Agregar</Text>
          </TouchableOpacity>
        )}
      </View>

      {detail.expenses.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>Sin gastos este mes</Text>
          <Text style={s.emptySubtitle}>
            {isFriends ? 'Agregá el primer gasto compartido.' : 'Los gastos del grupo aparecerán acá.'}
          </Text>
        </View>
      ) : (
        <View style={s.expCard}>
          {detail.expenses.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <View style={s.divider} />}
              <ExpenseRow expense={e} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tab: Deudas (Amigos) ─────────────────────────────────────────────────────

function DeudasTab({ detail }: { detail: GroupDetail }) {
  if (detail.debts.length === 0) {
    return (
      <View style={[s.tabContent, s.centered]}>
        <View style={s.comingSoonIcon}>
          <Ionicons name="checkmark-circle-outline" size={36} color={C.success} />
        </View>
        <Text style={s.emptyTitle}>Todo al día</Text>
        <Text style={s.emptySubtitle}>No hay deudas pendientes en el grupo.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={s.sectionLabel}>DEUDAS PENDIENTES</Text>
      <View style={s.expCard}>
        {detail.debts.map((d, i) => (
          <View key={`${d.fromUserId}-${d.toUserId}`}>
            {i > 0 && <View style={s.divider} />}
            <View style={s.debtRow}>
              <View style={[s.memberAvatar, { backgroundColor: d.fromColor + '22', width: 40, height: 40, borderRadius: 20 }]}>
                <Text style={[s.memberInitial, { color: d.fromColor }]}>{d.fromInitial}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.debtText} numberOfLines={2}>
                  <Text style={{ fontFamily: 'Montserrat_700Bold' }}>{d.fromName}</Text>
                  {' le debe a '}
                  <Text style={{ fontFamily: 'Montserrat_700Bold' }}>{d.toName}</Text>
                </Text>
                {d.isMe && <Text style={[s.debtMeta, { color: C.red }]}>Tenés que pagar esto</Text>}
              </View>
              <Text style={[s.debtAmount, d.isMe && { color: C.red }]}>{formatCurrency(d.amount)}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={C.purple} />
        <Text style={s.infoText}>
          Las deudas se calculan según los gastos compartidos cargados en el grupo.
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Tab: Miembros ────────────────────────────────────────────────────────────

function MiembrosTab({ detail, isAdmin, onEdit }: {
  detail:  GroupDetail;
  isAdmin: boolean;
  onEdit:  (m: MemberDetail) => void;
}) {
  const ROLE_STYLE: Record<MemberRole, { bg: string; color: string }> = {
    Admin:   { bg: '#2E7D3218', color: '#2E7D32' },
    Miembro: { bg: C.purpleLt,  color: C.purple  },
  };

  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={s.sectionRow}>
        <Text style={s.sectionLabel}>
          {detail.members.length} MIEMBRO{detail.members.length !== 1 ? 'S' : ''}
        </Text>
        {isAdmin && (
          <Text style={s.sectionHint}>Solo vos podés editar roles y permisos</Text>
        )}
      </View>

      <View style={s.expCard}>
        {detail.members.map((m, i) => {
          const rs = ROLE_STYLE[m.role];
          const canEdit = isAdmin && !m.isMe;
          return (
            <View key={m.userId}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.memberRow}>
                <View style={[s.memberAvatar, { backgroundColor: m.color + '22' }]}>
                  <Text style={[s.memberInitial, { color: m.color }]}>{m.initial}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {m.isMe ? `${m.name} (vos)` : m.name}
                  </Text>
                  {m.email ? (
                    <Text style={s.memberEmail} numberOfLines={1}>{m.email}</Text>
                  ) : null}
                  <View style={[s.roleBadge, { backgroundColor: rs.bg }]}>
                    <Text style={[s.roleBadgeText, { color: rs.color }]}>{m.role}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: sp.xs }}>
                  <Text style={s.memberTotal}>{formatCurrency(m.monthTotal)}</Text>
                  {canEdit && (
                    <TouchableOpacity
                      style={s.editBtn}
                      onPress={() => onEdit(m)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={13} color={C.purple} />
                      <Text style={s.editBtnText}>Editar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {!isAdmin && (
        <View style={s.infoBox}>
          <Ionicons name="lock-closed-outline" size={14} color={C.muted} />
          <Text style={s.infoText}>Solo el admin puede cambiar roles y permisos.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tab: Permisos (Familia) ──────────────────────────────────────────────────

function PermisosTab({ detail }: { detail: GroupDetail }) {
  const isAdmin = detail.myRole === 'Admin';
  return (
    <ScrollView contentContainerStyle={s.tabContent} showsVerticalScrollIndicator={false}>
      <View style={s.infoCard}>
        <View style={[s.infoCardIcon, { backgroundColor: isAdmin ? '#2E7D3218' : C.purpleLt }]}>
          <Ionicons
            name={isAdmin ? 'shield-checkmark-outline' : 'person-outline'}
            size={24}
            color={isAdmin ? C.green : C.purple}
          />
        </View>
        <Text style={s.infoCardTitle}>Tu rol: {detail.myRole}</Text>
        <Text style={s.infoCardDesc}>
          {isAdmin
            ? 'Podés ver los gastos de todos los miembros, cambiar roles y editar permisos desde la pestaña Miembros.'
            : 'Solo ves tus propios gastos. Un admin puede cambiar tus permisos.'}
        </Text>
      </View>

      <Text style={s.sectionLabel}>REGLAS DEL GRUPO</Text>
      <View style={s.expCard}>
        {[
          { icon: 'eye-outline',         color: '#2563EB', title: 'Admin ve todo',         desc: 'Los admins pueden ver los gastos de todos los miembros.' },
          { icon: 'eye-off-outline',     color: C.muted,   title: 'Miembros ven lo suyo',  desc: 'Los miembros solo ven sus propios gastos por defecto.' },
          { icon: 'create-outline',      color: C.purple,  title: 'Permisos editables',    desc: 'El admin puede personalizar los permisos de cada miembro.' },
          { icon: 'lock-closed-outline', color: C.amber,   title: 'Roles protegidos',      desc: 'Solo Admin puede cambiar roles. Un miembro no puede editarse a sí mismo.' },
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

// ─── Modal: Agregar gasto compartido ─────────────────────────────────────────

function AddExpenseModal({
  visible, onClose, members, groupId, userId, onSaved,
}: {
  visible: boolean; onClose: () => void; members: MemberDetail[];
  groupId: string; userId: string; onSaved: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amountStr,   setAmountStr]   = useState('');
  const [paidById,    setPaidById]    = useState(userId);
  const [saving,      setSaving]      = useState(false);

  const reset = () => { setDescription(''); setAmountStr(''); setPaidById(userId); };

  const handleSave = async () => {
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (!description.trim() || isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const db = supabase as any;
      const { data: expense, error: e1 } = await db
        .from('group_expenses')
        .insert({
          group_id: groupId, paid_by: paidById,
          description: description.trim(), amount,
          date: new Date().toISOString().split('T')[0],
        })
        .select().single();
      if (e1) throw e1;

      const splitAmt = amount / members.length;
      const splits = members.map(m => ({
        group_expense_id: expense.id,
        user_id:          m.userId,
        amount:           parseFloat(splitAmt.toFixed(2)),
        settled:          m.userId === paidById,
      }));
      const { error: e2 } = await db.from('group_expense_splits').insert(splits);
      if (e2) throw e2;

      reset(); onClose(); onSaved();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo guardar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = description.trim().length > 0 && parseFloat(amountStr.replace(',', '.')) > 0 && !saving;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Gasto compartido</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={C.text2} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <View style={{ gap: sp.sm }}>
              <Text style={s.inputLabel}>DESCRIPCIÓN</Text>
              <TextInput
                style={s.textInput} value={description} onChangeText={setDescription}
                placeholder="Ej: Cena en el restorán" placeholderTextColor={C.muted}
                autoFocus returnKeyType="next"
              />
            </View>
            <View style={{ gap: sp.sm }}>
              <Text style={s.inputLabel}>MONTO TOTAL</Text>
              <TextInput
                style={s.textInput} value={amountStr} onChangeText={setAmountStr}
                placeholder="0" placeholderTextColor={C.muted}
                keyboardType="decimal-pad" returnKeyType="done"
              />
            </View>
            <View style={{ gap: sp.sm }}>
              <Text style={s.inputLabel}>¿QUIÉN PAGÓ?</Text>
              {members.map(m => (
                <TouchableOpacity
                  key={m.userId}
                  style={[s.payerBtn, paidById === m.userId && s.payerBtnActive]}
                  onPress={() => setPaidById(m.userId)}
                  activeOpacity={0.8}
                >
                  <View style={[s.memberAvatar, { backgroundColor: m.color + '22', width: 32, height: 32, borderRadius: 16 }]}>
                    <Text style={[s.memberInitial, { color: m.color, fontSize: 13 }]}>{m.initial}</Text>
                  </View>
                  <Text style={[s.payerName, paidById === m.userId && { color: C.purple }]}>
                    {m.isMe ? `${m.name} (vos)` : m.name}
                  </Text>
                  {paidById === m.userId && <Ionicons name="checkmark-circle" size={18} color={C.purple} />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.splitInfo}>
              <Ionicons name="people-outline" size={14} color={C.muted} />
              <Text style={s.splitInfoText}>
                Se dividirá en partes iguales entre los {members.length} miembros.
              </Text>
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, !canSave && s.primaryBtnOff]}
              onPress={handleSave} disabled={!canSave} activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={s.primaryBtnText}>Guardar gasto</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [detail,       setDetail]       = useState<FetchResult | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<Tab>('resumen');
  const [showAddExp,   setShowAddExp]   = useState(false);
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
  const groupColor = detail?.groupColor ?? C.purple;
  const headerIcon = isFriends ? 'people' : 'home';

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

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
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
            <View style={[s.headerIcon, { backgroundColor: groupColor + '18' }]}>
              <Ionicons name={headerIcon} size={20} color={groupColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle} numberOfLines={1}>{detail.name}</Text>
              <TouchableOpacity
                style={s.codeRow}
                onPress={() => router.push({
                  pathname: '/(app)/group-code',
                  params: { code: detail.inviteCode, groupName: detail.name },
                } as any)}
                activeOpacity={0.7}
              >
                <Text style={s.headerSub}>
                  {detail.members.length} miembro{detail.members.length !== 1 ? 's' : ''} · Código: {detail.inviteCode}
                </Text>
                <Ionicons name="copy-outline" size={12} color={C.purple} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={s.headerTitle}>Grupo</Text>
        )}

        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleLeave} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={22} color={C.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={C.purple} size="large" />
        </View>
      ) : !detail ? (
        <View style={s.centered}>
          <Text style={s.emptyTitle}>No se pudo cargar el grupo.</Text>
          <Text style={[s.emptySubtitle, { marginTop: sp.sm }]}>
            Verificá tu conexión e intentá de nuevo.
          </Text>
          <TouchableOpacity onPress={load} style={{ marginTop: sp.md }}>
            <Text style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.purple }}>
              Reintentar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(app)/family' as any)} style={{ marginTop: sp.sm }}>
            <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted }}>
              Volver a Grupos
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TabBar
            tabs={isFriends ? friendsTabs : familyTabs}
            active={activeTab}
            onChange={setActiveTab}
          />

          {isFriends ? (
            <>
              {activeTab === 'resumen'  && <FriendsResumenTab detail={detail} onAddExpense={() => setShowAddExp(true)} />}
              {activeTab === 'gastos'   && <GastosTab detail={detail} onAddExpense={() => setShowAddExp(true)} isFriends />}
              {activeTab === 'deudas'   && <DeudasTab detail={detail} />}
              {activeTab === 'miembros' && <MiembrosTab detail={detail} isAdmin={isAdmin} onEdit={setEditingMember} />}
            </>
          ) : (
            <>
              {activeTab === 'resumen'  && <FamilyResumenTab detail={detail} />}
              {activeTab === 'miembros' && <MiembrosTab detail={detail} isAdmin={isAdmin} onEdit={setEditingMember} />}
              {activeTab === 'gastos'   && <GastosTab detail={detail} onAddExpense={() => {}} isFriends={false} />}
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp.xl, gap: sp.md },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    paddingHorizontal: sp.xl, paddingVertical: sp.md,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text, letterSpacing: -0.2 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSub: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },

  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: sp.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.purple },
  tabLabel: { fontFamily: 'Montserrat_500Medium', fontSize: 12, color: C.muted },
  tabLabelActive: { fontFamily: 'Montserrat_700Bold', color: C.purple },

  tabContent: { paddingHorizontal: sp.xl, paddingTop: sp.xl, paddingBottom: 100, gap: sp.md },

  summaryCard: {
    backgroundColor: C.white, borderRadius: 20, padding: sp.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, gap: sp.md,
  },
  summaryTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryMonthLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text },
  summaryMonthSub:   { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, marginTop: -sp.sm },
  summaryTotalLabel: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  summaryTotal:      { fontFamily: 'Montserrat_800ExtraBold', fontSize: 22, color: C.text, letterSpacing: -0.5 },
  summaryDivider:    { height: 1, backgroundColor: C.border },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCol:        { gap: 3 },
  summaryColLabel:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  summaryColAmt:     { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.text },

  sectionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel:{ fontFamily: 'Montserrat_700Bold', fontSize: 11, color: C.muted, letterSpacing: 0.6 },
  sectionHint: { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },

  expCard: {
    backgroundColor: C.white, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  expRow:    { flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg },
  expIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  expName:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text },
  expMeta:   { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  expAmount: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text, flexShrink: 0 },

  debtRow:    { flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg },
  debtText:   { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.text, flex: 1 },
  debtMeta:   { fontFamily: 'Montserrat_500Medium', fontSize: 11 },
  debtAmount: { fontFamily: 'Montserrat_700Bold', fontSize: 14, color: C.text, flexShrink: 0 },

  ctaBtn: {
    backgroundColor: C.purple, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    paddingVertical: 16,
    shadowColor: C.purple, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  ctaBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.white },

  addSmallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, borderWidth: 1, borderColor: C.purple + '60',
    paddingHorizontal: sp.sm, paddingVertical: sp.xs,
    backgroundColor: C.purpleLt,
  },
  addSmallText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 12, color: C.purple },

  memberRow:    { flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  memberInitial:{ fontFamily: 'Montserrat_700Bold', fontSize: 16 },
  memberName:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text },
  memberEmail:  { fontFamily: 'Montserrat_400Regular', fontSize: 11, color: C.muted },
  memberTotal:  { fontFamily: 'Montserrat_700Bold', fontSize: 13, color: C.text2, flexShrink: 0 },
  roleBadge:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  roleBadgeText:{ fontFamily: 'Montserrat_700Bold', fontSize: 10 },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, borderWidth: 1, borderColor: C.purple + '50',
    paddingHorizontal: 6, paddingVertical: 3, backgroundColor: C.purpleLt,
  },
  editBtnText: { fontFamily: 'Montserrat_600SemiBold', fontSize: 11, color: C.purple },

  infoCard: {
    backgroundColor: C.white, borderRadius: 20, padding: sp.xl,
    alignItems: 'flex-start', gap: sp.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  infoCardIcon:  { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  infoCardTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text },
  infoCardDesc:  { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.text2, lineHeight: 20 },

  permRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: sp.md, padding: sp.lg },
  permIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permTitle:{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, color: C.text },
  permDesc: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, lineHeight: 17 },

  permToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md, padding: sp.lg,
  },

  infoBox: {
    flexDirection: 'row', gap: sp.sm, alignItems: 'flex-start',
    backgroundColor: C.purpleLt, borderRadius: 12, padding: sp.md,
  },
  infoText: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.text2, flex: 1, lineHeight: 17 },

  modal:       { flex: 1, backgroundColor: C.white },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.xl, paddingVertical: sp.lg,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { fontFamily: 'Montserrat_700Bold', fontSize: 18, color: C.text },
  modalBody:  { paddingHorizontal: sp.xl, paddingTop: sp.xl, paddingBottom: 40, gap: sp.xl },

  editMemberInfo: { flexDirection: 'row', alignItems: 'center', gap: sp.md },
  editMemberName: { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text },
  editMemberEmail:{ fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted },

  inputLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 10, color: C.muted, letterSpacing: 0.8 },
  textInput: {
    fontFamily: 'Montserrat_500Medium', fontSize: 16, color: C.text,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: sp.lg, paddingVertical: sp.md, backgroundColor: C.bg,
  },

  roleRow: { flexDirection: 'row', gap: sp.sm },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    paddingVertical: sp.md, backgroundColor: C.bg,
  },
  roleBtnActive: { borderColor: C.purple, backgroundColor: C.purpleLt },
  roleBtnText:   { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.muted },
  roleHint:      { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, lineHeight: 17 },

  payerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: sp.md,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    padding: sp.md, backgroundColor: C.bg,
  },
  payerBtnActive: { borderColor: C.purple, backgroundColor: C.purpleLt },
  payerName:      { fontFamily: 'Montserrat_600SemiBold', fontSize: 14, color: C.text, flex: 1 },

  splitInfo: { flexDirection: 'row', gap: sp.sm, alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, padding: sp.md },
  splitInfoText: { fontFamily: 'Montserrat_400Regular', fontSize: 12, color: C.muted, flex: 1 },

  primaryBtn: {
    backgroundColor: C.purple, borderRadius: 14, paddingVertical: sp.md + 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnOff:  { opacity: 0.4 },
  primaryBtnText: { fontFamily: 'Montserrat_700Bold', fontSize: 15, color: C.white },

  divider:  { height: 1, backgroundColor: C.border, marginHorizontal: sp.lg },
  emptyBox: { alignItems: 'center', paddingVertical: sp.xxl, gap: sp.sm },
  emptyTitle:    { fontFamily: 'Montserrat_700Bold', fontSize: 16, color: C.text, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Montserrat_400Regular', fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
  comingSoonIcon:{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.purpleLt, alignItems: 'center', justifyContent: 'center' },
});
