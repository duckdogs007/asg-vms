-- ============================================================
-- set_my_assignment — officer self-sets their location at sign-on
-- 2026-05-23 (revised post-review same day)
-- ============================================================
-- /api/me/assignment posts here. SECURITY DEFINER so it bypasses
-- the admin-only RLS write policy on user_assignments. The function
-- only ever writes auth.uid() — a caller can NEVER set someone
-- else's row.
--
-- Revision: removed the p_role parameter. Self-assign must not be
-- able to set role='admin_super' (or any non-null role) — that label
-- is reserved for admin-set values via PATCH /api/admin/users. The
-- ON CONFLICT clause explicitly preserves any existing admin-set
-- role rather than clobbering it.
--
-- Companion CHECK constraint on public.user_assignments.role
-- enforces role IN (NULL, 'admin_super') at the DB level.
-- ============================================================

DROP FUNCTION IF EXISTS public.set_my_assignment(uuid, text);

CREATE OR REPLACE FUNCTION public.set_my_assignment(
  p_community_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  INSERT INTO public.user_assignments (user_id, community_id, role, updated_at)
  VALUES (uid, p_community_id, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET community_id = EXCLUDED.community_id,
        -- DO NOT touch role from self-assign. Admin-set role persists.
        updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_assignment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_assignment(uuid) TO authenticated;
