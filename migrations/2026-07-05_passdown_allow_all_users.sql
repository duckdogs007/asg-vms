-- Allow all authenticated users (including guests) to submit passdown logs.
-- UPDATE remains non-guest so guests cannot edit other officers' passdowns.

DROP POLICY IF EXISTS "auth insert" ON public.passdown_logs;
CREATE POLICY "auth insert" ON public.passdown_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
