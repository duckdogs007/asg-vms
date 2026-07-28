-- Admins can delete a report's review-queue entry when the report itself is
-- deleted (report detail page → Delete Report), so no orphaned report_queue row
-- is left pointing at a missing report. The source report tables already have
-- their own is_admin() DELETE policies. Already applied to prod.

drop policy if exists admin_delete_report_queue on public.report_queue;
create policy admin_delete_report_queue on public.report_queue
  for delete to authenticated using (public.is_admin());
