-- ══════════════════════════════════════════════════════
--  Garantiza que los SELECT policies de grupos existan.
--  Idempotente: DROP IF EXISTS antes de CREATE.
--  Necesario para que miembros (no admin) vean el grupo al que pertenecen.
-- ══════════════════════════════════════════════════════

-- family_groups: cualquier miembro puede ver el grupo al que pertenece
DROP POLICY IF EXISTS "family_groups_select" ON family_groups;
CREATE POLICY "family_groups_select" ON family_groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM family_members WHERE user_id = auth.uid())
  );

-- family_members: cualquier miembro puede ver a los otros miembros del mismo grupo
DROP POLICY IF EXISTS "family_members_select" ON family_members;
CREATE POLICY "family_members_select" ON family_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM family_members WHERE user_id = auth.uid())
  );

-- family_members: insert propio (para poder unirse a un grupo)
DROP POLICY IF EXISTS "family_members_insert" ON family_members;
CREATE POLICY "family_members_insert" ON family_members
  FOR INSERT WITH CHECK (user_id = auth.uid());
