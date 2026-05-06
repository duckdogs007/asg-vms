-- ============================================================
-- RLS Tightening + Admin Gate — VMS
-- 2026-05-05
-- ============================================================
-- Builds on 2026-04-26_rls_hardening.sql.
--
-- Goals:
--   1. Add a public.admin_users allowlist + public.is_admin() helper
--      and use it to gate write access on management tables
--   2. Lock down sensitive PII tables (watchlist, residents, units,
--      etc.) to admin-only writes
--   3. Tighten DELETE on operational tables (officer-generated logs,
--      notes, BOLOs, passdowns, etc.) to admin-only for forensic
--      integrity. INSERT/UPDATE remain auth-only so officers can
--      still do their jobs.
--   4. Remove residual qual=true SELECT policies that left
--      watchlist, communities, visitor_logs, and visitors readable
--      via the public anon key (which is shipped in every client
--      bundle and easy to extract).
--
-- Schema prerequisites are included as CREATE/ALTER ... IF NOT EXISTS
-- so the file is safely replayable from scratch on an empty DB.
--
-- Run order (already applied to production via Supabase MCP):
--   20260504233820  create_post_orders_table
--   20260504234609  add_admin_users_and_gate_post_orders
--   20260505002449  add_admin_write_policies_to_communities
--   20260505002730  add_admin_write_policies_to_notification_recipients
--   20260505003931  allow_admin_writes_to_admin_users_with_self_protection
--   20260505020950  tighten_watchlist_writes_to_admin_only
--   20260505021805  add_firearm_flag_to_watchlist
--   2026-05-05      drop_anon_read_on_watchlist
--   2026-05-05      tighten_rls_communities_and_operational
--   2026-05-05      restore_communities_select_and_drop_anon_reads
--
-- This file consolidates all of the above and is idempotent.
-- ============================================================

-- ── 1. Schema prerequisites ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.admin_users IS 'Allowlist of admin user_ids. Writes restricted to service role / Studio / current admins.';
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.post_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL UNIQUE REFERENCES public.communities(id) ON DELETE CASCADE,
  last_updated date NOT NULL DEFAULT current_date,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.post_orders IS 'Per-community post orders document. data jsonb shape: {contacts, procedures, reportExamples}.';
ALTER TABLE public.post_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS firearm_flag boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.watchlist.firearm_flag IS
  'Subject is known to carry a firearm — surfaced as a high-priority alert flag.';

-- ── 2. is_admin() helper used by every admin-gated policy ──

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── 3. admin_users own policies (with self-demote protection) ─

DROP POLICY IF EXISTS "auth_read_admin_users"    ON public.admin_users;
DROP POLICY IF EXISTS "admin_insert_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "admin_delete_admin_users" ON public.admin_users;

-- Authenticated users can read (so the client can check their own admin status)
CREATE POLICY "auth_read_admin_users" ON public.admin_users
  FOR SELECT TO authenticated USING (true);

-- Admins can promote others
CREATE POLICY "admin_insert_admin_users" ON public.admin_users
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Admins can demote others — but NOT themselves (prevents lockout)
CREATE POLICY "admin_delete_admin_users" ON public.admin_users
  FOR DELETE TO authenticated USING (public.is_admin() AND user_id <> auth.uid());

-- ── 4. Drop qual=true SELECT policies (anon-readable PII) ──

DROP POLICY IF EXISTS "Allow public read"                ON public.watchlist;
DROP POLICY IF EXISTS "allow read watchlist"             ON public.watchlist;
DROP POLICY IF EXISTS "Allow public read"                ON public.communities;
DROP POLICY IF EXISTS "allow read logs"                  ON public.visitor_logs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.visitors;
DROP POLICY IF EXISTS "allow read visitors"              ON public.visitors;

-- ── 5. Restore SELECT (auth-only) on tables touched in step 4 ──

DROP POLICY IF EXISTS "auth_read_communities" ON public.communities;
CREATE POLICY "auth_read_communities" ON public.communities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_read_post_orders" ON public.post_orders;
CREATE POLICY "auth_read_post_orders" ON public.post_orders
  FOR SELECT TO authenticated USING (true);

-- ── 6. Admin-only writes on management tables ─────────────
-- These are tables curated by management — officers shouldn't be
-- creating/editing/deleting locations, residents, units, watchlist
-- entries, etc. directly.

DO $$
DECLARE
  rec   record;
  t     text;
  admin_tables text[] := ARRAY[
    'communities', 'notification_recipients', 'post_orders',
    'watchlist', 'residents', 'residents_import', 'units',
    'vehicle_watchlist'
  ];
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    FOR rec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', rec.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin())',
                   'admin_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
                   'admin_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin())',
                   'admin_delete_' || t, t);
  END LOOP;
END $$;

-- ── 7. Operational tables: DELETE locked to admin only ────
-- Officers create incidents, BOLOs, passdowns, contacts, etc. in
-- normal duty (auth INSERT + UPDATE preserved by the 2026-04-26
-- hardening migration). DELETE is admin-only for forensic integrity.

DO $$
DECLARE
  rec   record;
  t     text;
  op_tables text[] := ARRAY[
    'ban_history', 'bolos', 'contact_history',
    'incident_reports', 'officer_daily_logs', 'passdown_logs',
    'person_flags', 'person_notes', 'persons',
    'vehicle_entries', 'vehicle_fi_logs', 'vehicles',
    'visitor_logs', 'visitors'
  ];
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    FOR rec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', rec.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin())',
                   'admin_delete_' || t, t);
  END LOOP;
END $$;
