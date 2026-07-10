-- Security-audit hardening (findings #2, #5, #9).

-- #2 ai_location_summaries: lock cache writes to admins. The on-demand summary
-- route writes the cache with the service-role client (which bypasses RLS), so
-- supervisors still get caching; regular/guest users can no longer poison it.
drop policy if exists "ai_ls_insert" on public.ai_location_summaries;
drop policy if exists "ai_ls_update" on public.ai_location_summaries;
create policy "ai_ls_insert" on public.ai_location_summaries for insert to authenticated with check (public.is_admin());
create policy "ai_ls_update" on public.ai_location_summaries for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- #5 report_queue: block guests/anon from enqueuing (was WITH CHECK (true)).
drop policy if exists "rq_insert" on public.report_queue;
create policy "rq_insert" on public.report_queue for insert to authenticated
  with check ((select auth.role()) = 'authenticated' and not public.is_guest());

-- #9 pin search_path on flagged SECURITY DEFINER / helper functions.
alter function public.is_guest() set search_path = public, pg_temp;
alter function public.is_admin_or_pm() set search_path = public, pg_temp;
alter function public.import_rent_roll(uuid, jsonb, boolean) set search_path = public, pg_temp;
