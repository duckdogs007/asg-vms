-- Root cause of "scan destinations not saving": the DL-scan flow auto-logs the
-- visitor (INSERT, destination empty) then enriches unit/resident/type/destination
-- via UPDATE — but the UPDATE policy was is_admin() only, so non-admin guards'
-- enrichment (including destination) was silently denied by RLS. Allow non-guest
-- officers to UPDATE visitor_logs, matching the INSERT permission. Admin-only
-- DELETE is unchanged.
drop policy if exists "admin_update_visitor_logs" on public.visitor_logs;
create policy "auth update visitor_logs" on public.visitor_logs for update to authenticated
  using ((auth.role() = 'authenticated') and not public.is_guest())
  with check ((auth.role() = 'authenticated') and not public.is_guest());
