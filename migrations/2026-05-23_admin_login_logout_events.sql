-- ============================================================
-- admin_login_logout_events — last login + last logout per user
-- 2026-05-23
-- ============================================================
-- Powers the /admin User Dashboard "On Duty" tab. Reads
-- auth.audit_log_entries (which PostgREST can't expose via the
-- public schema), aggregates per actor_username (email), and
-- returns one row per user.
--
-- SECURITY DEFINER so it can read the auth schema. EXECUTE is
-- restricted to service_role — callers must hit this through the
-- /api/admin/* routes that already gate on ADMIN_EMAILS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_login_logout_events()
RETURNS TABLE (
  email       text,
  last_login  timestamptz,
  last_logout timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    payload->>'actor_username' AS email,
    max(created_at) FILTER (WHERE payload->>'action' = 'login')  AS last_login,
    max(created_at) FILTER (WHERE payload->>'action' = 'logout') AS last_logout
  FROM auth.audit_log_entries
  WHERE payload->>'actor_username' IS NOT NULL
    AND payload->>'action' IN ('login', 'logout')
  GROUP BY payload->>'actor_username';
$$;

REVOKE ALL ON FUNCTION public.admin_login_logout_events() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_logout_events() TO service_role;
