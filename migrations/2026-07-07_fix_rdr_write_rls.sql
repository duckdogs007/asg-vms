-- Fix: Post Orders report-delivery recipients never saved (0 rows ever persisted).
--
-- The original "rdr_write" policy (FOR ALL) gated writes on a subquery reading
-- auth.users:  admin_users.email = (SELECT email FROM auth.users WHERE id = auth.uid()).
-- The `authenticated` role has NO SELECT privilege on auth.users, so that subquery
-- fails at runtime and every INSERT/DELETE was silently rejected by RLS — for all
-- users and all communities.
--
-- Fix: gate writes on public.is_admin() (STABLE SECURITY DEFINER; reads admin_users
-- as its owner, never touches auth.users). This matches the /admin/post-orders page
-- gate (checkIsAdmin -> admin_users by user_id). Splitting write into per-command
-- policies also clears the "multiple_permissive_policies" advisor on this table
-- (SELECT is served solely by rdr_select).

DROP POLICY IF EXISTS "rdr_write" ON public.report_delivery_recipients;

CREATE POLICY "rdr_insert" ON public.report_delivery_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "rdr_update" ON public.report_delivery_recipients
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "rdr_delete" ON public.report_delivery_recipients
  FOR DELETE TO authenticated
  USING (public.is_admin());
