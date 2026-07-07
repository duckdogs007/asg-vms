-- Allow Supervisors (in addition to admins and property managers) to issue
-- lease violations.
--
-- Blocker found: violation_offenders writes were gated on is_admin_or_pm()
-- (admin OR property_manager) — supervisors were rejected at the RLS layer even
-- though the UI message advertised "Supervisor/Admin access". is_admin_or_pm()
-- is shared by every Property Hub write policy, so we must NOT widen it; instead
-- add a dedicated helper and point only the violation_offenders policy at it.

CREATE OR REPLACE FUNCTION public.can_issue_violation()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_assignments
      WHERE user_id = auth.uid()
        AND role IN ('admin_super', 'property_manager', 'supervisor')
    );
$function$;

-- Repoint the violation_offenders write policy at the wider helper.
DROP POLICY IF EXISTS "violation_offenders_write" ON public.violation_offenders;
CREATE POLICY "violation_offenders_write" ON public.violation_offenders
  FOR ALL TO authenticated
  USING (public.can_issue_violation())
  WITH CHECK (public.can_issue_violation());
