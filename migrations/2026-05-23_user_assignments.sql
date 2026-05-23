-- ============================================================
-- user_assignments — officer → home community
-- 2026-05-23
-- ============================================================
-- One row per user. Drives the Location column on /admin/system
-- Users tab and the location grouping on /admin On Duty tab.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_assignments (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id)        ON DELETE CASCADE,
  community_id uuid          REFERENCES public.communities(id) ON DELETE SET NULL,
  role         text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.user_assignments.role IS
  'Optional role override. When "admin_super", user is displayed/grouped as Admin/Super regardless of community_id.';

COMMENT ON TABLE public.user_assignments IS
  'Per-user home community assignment. Set by admins via /admin/system Users tab.';

ALTER TABLE public.user_assignments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (so an officer can see their own assignment
-- and the admin pages can list everyone's). RLS doesn't leak more than the
-- /api/admin/users endpoint already returns.
DROP POLICY IF EXISTS "auth_read_user_assignments" ON public.user_assignments;
CREATE POLICY "auth_read_user_assignments" ON public.user_assignments
  FOR SELECT TO authenticated USING (true);

-- Only admins can set/update/delete assignments
DROP POLICY IF EXISTS "admin_write_user_assignments" ON public.user_assignments;
CREATE POLICY "admin_write_user_assignments" ON public.user_assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
