-- RPC para buscar un grupo por código de invitación sin requerir membresía previa.
-- SECURITY DEFINER bypassa RLS, por eso solo devuelve id/name/group_type (sin datos sensibles).
CREATE OR REPLACE FUNCTION find_group_by_invite_code(p_code TEXT)
RETURNS TABLE(id uuid, name text, group_type text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, group_type
  FROM   family_groups
  WHERE  invite_code = upper(trim(p_code));
$$;
