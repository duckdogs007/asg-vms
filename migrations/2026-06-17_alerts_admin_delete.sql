-- Allow admins to delete alerts (cleanup of old/handled alerts on the Alerts page).
-- The alerts table previously had only SELECT/INSERT/UPDATE policies — no DELETE,
-- so deletes were denied for everyone. Mirrors the admin_delete_* pattern used
-- across the schema (is_admin() gate).
drop policy if exists "admin_delete_alerts" on public.alerts;
create policy "admin_delete_alerts"
  on public.alerts for delete
  to authenticated
  using (is_admin());
