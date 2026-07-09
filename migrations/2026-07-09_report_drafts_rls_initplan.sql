-- Perf hygiene: wrap auth.uid() in a scalar subselect so it evaluates once per
-- query rather than once per row (clears the auth_rls_initplan advisory).
drop policy if exists "rd_select" on public.report_drafts;
drop policy if exists "rd_insert" on public.report_drafts;
drop policy if exists "rd_update" on public.report_drafts;
drop policy if exists "rd_delete" on public.report_drafts;

create policy "rd_select" on public.report_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy "rd_insert" on public.report_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rd_update" on public.report_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rd_delete" on public.report_drafts for delete to authenticated using ((select auth.uid()) = user_id);
