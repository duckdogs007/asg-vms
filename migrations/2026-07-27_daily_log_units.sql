-- DAR "Units Referenced" → Unit Activity tracking.
-- A DAR (officer_daily_logs) is a shift-level narrative that can mention several
-- units. Officers tag those units (with an optional per-unit note) in the report;
-- each tag becomes its own row here and surfaces on the Unit Activity timeline via
-- the unit_activity view, linking back to the parent DAR. Already applied to prod.

create table if not exists public.daily_log_units (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid not null references public.officer_daily_logs(id) on delete cascade,
  community_id  uuid references public.communities(id) on delete set null,
  unit_number   text,
  building      text,                 -- split from unit_number (splitUnit) for the filters
  apartment     text,
  note          text,                 -- officer's per-unit note; shown as the timeline detail
  hoh_name      text,                 -- HOH snapshot as of the shift date
  created_at    timestamptz not null default now()
);

create index if not exists daily_log_units_log_idx  on public.daily_log_units (daily_log_id);
create index if not exists daily_log_units_unit_idx on public.daily_log_units (community_id, building, apartment);

alter table public.daily_log_units enable row level security;

drop policy if exists dlu_read   on public.daily_log_units;
create policy dlu_read   on public.daily_log_units for select to authenticated using (true);
drop policy if exists dlu_insert on public.daily_log_units;
create policy dlu_insert on public.daily_log_units for insert to authenticated with check (not public.is_guest());
drop policy if exists dlu_delete on public.daily_log_units;
create policy dlu_delete on public.daily_log_units for delete to authenticated using (public.is_admin());

-- Append a "Daily Log" branch to unit_activity. source_id = parent DAR id so the
-- timeline View link (/vms/reports/daily-log/[id]) opens the full report.
-- event_at is cast to `timestamp without time zone` to match the view's column type.
create or replace view public.unit_activity as
 SELECT 'incident_reports'::text AS source_table, ir.id AS source_id, ir.community_id, ir.building, ir.apartment,
    COALESCE(ir.date + COALESCE(ir."time", '00:00:00'::time without time zone), ir.created_at) AS event_at,
    CASE WHEN ir.lvl_issued THEN 'Lease Violation'::text ELSE 'Incident'::text END AS record_type,
    COALESCE(ir.violation_type, ir.incident_type) AS detail, ir.hoh_name, ir.record_source,
    ir.reliant_case_no, ir.hpd_report_no, ir.asg_report_no
   FROM incident_reports ir WHERE ir.building IS NOT NULL OR ir.apartment IS NOT NULL
UNION ALL
 SELECT 'parking_violations'::text, pv.id, pv.community_id, pv.building, pv.apartment,
    COALESCE(pv.date + COALESCE(pv."time"::time without time zone, '00:00:00'::time without time zone), pv.created_at::timestamp without time zone),
    'Parking'::text, pv.violation_type, pv.hoh_name, 'officer'::text, NULL::text, NULL::text, NULL::text
   FROM parking_violations pv WHERE pv.building IS NOT NULL OR pv.apartment IS NOT NULL
UNION ALL
 SELECT 'vehicle_fi_logs'::text, vf.id, vf.community_id, vf.building, vf.apartment,
    COALESCE(vf.date + COALESCE(vf."time"::time without time zone, '00:00:00'::time without time zone), vf.created_at::timestamp without time zone),
    'Vehicle FI'::text, vf.reason, vf.hoh_name, 'officer'::text, NULL::text, NULL::text, NULL::text
   FROM vehicle_fi_logs vf WHERE vf.building IS NOT NULL OR vf.apartment IS NOT NULL
UNION ALL
 SELECT 'visitor_logs'::text, vl.id, vl.community_id, NULL::text, COALESCE(vl.unit_number, vl.apartment),
    COALESCE(vl."timestamp", vl.created_at), 'Visitor'::text, vl.visitor_type, vl.resident_name, 'officer'::text, NULL::text, NULL::text, NULL::text
   FROM visitor_logs vl WHERE COALESCE(vl.unit_number, vl.apartment) IS NOT NULL
UNION ALL
 SELECT 'officer_daily_logs'::text, dlu.daily_log_id, dlu.community_id, dlu.building, dlu.apartment,
    COALESCE(dl.date::timestamp without time zone, dl.created_at::timestamp without time zone),
    'Daily Log'::text, COALESCE(NULLIF(dlu.note, ''), 'Referenced in Daily Log'::text), dlu.hoh_name, 'officer'::text, NULL::text, NULL::text, NULL::text
   FROM daily_log_units dlu
   JOIN officer_daily_logs dl ON dl.id = dlu.daily_log_id
  WHERE dlu.building IS NOT NULL OR dlu.apartment IS NOT NULL;
