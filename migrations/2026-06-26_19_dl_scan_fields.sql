-- Item #19 — DL scan fields on visitor_logs
-- Adds all AAMVA-parsed fields to visitor_logs so a wedge-scanner check-in
-- captures the full license record alongside the visit entry.
-- Also tightens UPDATE on visitor_logs to admin-only (was auth = any officer).

-- ── 1. Add DL columns ─────────────────────────────────────────
ALTER TABLE public.visitor_logs
  ADD COLUMN IF NOT EXISTS middle_name    text,
  ADD COLUMN IF NOT EXISTS dob            date,
  ADD COLUMN IF NOT EXISTS oln            text,
  ADD COLUMN IF NOT EXISTS address        text,
  ADD COLUMN IF NOT EXISTS city           text,
  ADD COLUMN IF NOT EXISTS state_of_issue text,
  ADD COLUMN IF NOT EXISTS zip            text,
  ADD COLUMN IF NOT EXISTS sex            text,
  ADD COLUMN IF NOT EXISTS height         text,
  ADD COLUMN IF NOT EXISTS eye_color      text,
  ADD COLUMN IF NOT EXISTS dl_scanned     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.visitor_logs.dob            IS 'Date of birth from DL scan (AAMVA DBB → ISO date).';
COMMENT ON COLUMN public.visitor_logs.oln            IS 'Driver license number from DL scan (AAMVA DAQ).';
COMMENT ON COLUMN public.visitor_logs.state_of_issue IS 'License-issuing state from DL scan (AAMVA DAJ).';
COMMENT ON COLUMN public.visitor_logs.dl_scanned     IS 'True when this entry was created via a DL wedge scan.';

-- ── 2. Tighten UPDATE to admin-only ──────────────────────────
-- Previously "auth update visitor_logs" allowed any authenticated user
-- to modify entries — forensic records should be immutable by officers.
DROP POLICY IF EXISTS "auth update visitor_logs"  ON public.visitor_logs;
DROP POLICY IF EXISTS "admin_update_visitor_logs" ON public.visitor_logs;

CREATE POLICY "admin_update_visitor_logs" ON public.visitor_logs
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. Ensure anon has no access ─────────────────────────────
REVOKE ALL ON TABLE public.visitor_logs FROM anon;
