-- ============================================================================
-- VMS migration — items 24 + 25
-- Lease violation as a STAGE on the unified report record (item 24)
-- Cross-record unit activity roll-up + source tagging (item 25)
--
-- Builds on migration_items_26_27.sql (structured bldg/apt, HOH snapshot,
-- linked ref #s must already exist). Additive + idempotent. Does not drop/rename.
-- Verified against live schema 2026-06-19.
--
-- DESIGN DECISION (per discussion): a lease violation is NOT a separate table.
-- It is an optional post-incident STAGE on the same `incident_reports` record
-- (one real-world event = one record). `incident_reports` is treated as the
-- unified report/case record. A standalone violation (trash, late rent) is a
-- record whose incident fields are light and whose violation stage is filled.
-- (Optional future cleanup: rename `incident_reports` -> `reports`/`case_records`
--  to reflect its broadened role. Deferred — rename is riskier than it's worth now.)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ITEM 24a — violation_types lookup (configurable / extensible, not hard-coded)
-- Two categories so security/community violations and lease-compliance/financial
-- (late rent) don't share a bucket.
-- ----------------------------------------------------------------------------
create table if not exists public.violation_types (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,            -- 'security_community' | 'lease_compliance'
  label      text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category, label)
);

insert into public.violation_types (category, label, sort_order) values
  ('security_community','Trash / sanitation',10),
  ('security_community','Noise',20),
  ('security_community','Fighting / altercation',30),
  ('security_community','Curfew',40),
  ('security_community','Loitering',50),
  ('security_community','Pet',60),
  ('security_community','Unauthorized occupant',70),
  ('security_community','Parking',80),
  ('lease_compliance','Late rent',10),
  ('lease_compliance','Lease term breach',20)
on conflict (category, label) do nothing;

alter table public.violation_types enable row level security;
drop policy if exists violation_types_read on public.violation_types;
create policy violation_types_read on public.violation_types
  for select to authenticated using (true);
drop policy if exists violation_types_admin_write on public.violation_types;
create policy violation_types_admin_write on public.violation_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ITEM 24b — violation STAGE columns on the unified record (incident_reports)
-- A record can be incident-only (these stay null), incident->violation, a
-- standalone community violation, or a management-issued late-rent violation.
-- ----------------------------------------------------------------------------
alter table public.incident_reports
  add column if not exists record_source       text default 'officer',  -- 'officer' | 'reliant' | 'management'
  add column if not exists lvl_issued          boolean not null default false,
  add column if not exists violation_category  text,                    -- 'security_community' | 'lease_compliance' (null if no violation stage)
  add column if not exists violation_type      text,                    -- label from violation_types
  add column if not exists lvl_posted_date     date,                    -- date the LVL was posted/distributed
  add column if not exists notice_level        text,                    -- '1st' | '2nd' | 'final' | 'fine_lease_action'
  add column if not exists distribution_method text,                    -- 'door' | 'mailed' | 'emailed' | 'handed'
  add column if not exists hoh_ack             boolean not null default false,  -- HOH delivery acknowledged
  add column if not exists hoh_ack_at          timestamptz,
  add column if not exists issued_by           text;                    -- who issued the violation stage

create index if not exists incident_reports_lvl_idx
  on public.incident_reports (lvl_issued) where lvl_issued = true;
create index if not exists incident_reports_vcat_idx
  on public.incident_reports (violation_category);
create index if not exists incident_reports_source_idx
  on public.incident_reports (record_source);

-- ----------------------------------------------------------------------------
-- ITEM 24c — offenders child table (multiple per record; drives ban-list check)
-- Distinct from the HOH responsible party (snapshotted on the record itself).
-- ----------------------------------------------------------------------------
create table if not exists public.violation_offenders (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.incident_reports(id) on delete cascade,
  name             text,
  relationship     text,                  -- 'hoh' | 'dependent' | 'guest' | 'other_unknown'
  description      text,                  -- physical/vehicle description when unidentified
  ban_match        boolean not null default false,
  ban_watchlist_id uuid references public.watchlist(id),  -- existing ban list (526 rows)
  created_at       timestamptz not null default now()
);

create index if not exists violation_offenders_report_idx
  on public.violation_offenders (report_id);
create index if not exists violation_offenders_name_idx
  on public.violation_offenders (lower(name));

alter table public.violation_offenders enable row level security;
drop policy if exists violation_offenders_read on public.violation_offenders;
create policy violation_offenders_read on public.violation_offenders
  for select to authenticated using (true);
-- Writes: supervisor/admin/property-management gate the violation stage.
-- Until a property_manager role exists (item 7b), gate on is_admin(); broaden later.
drop policy if exists violation_offenders_write on public.violation_offenders;
create policy violation_offenders_write on public.violation_offenders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ITEM 24d — ban-list cross-check helper
-- Returns the matching watchlist id for a name at a community (or null).
-- App calls this when an offender is named; stores result on the offender row.
-- ----------------------------------------------------------------------------
create or replace function public.match_ban_list(
  p_community_id uuid,
  p_first_name   text,
  p_last_name    text
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select w.id
  from public.watchlist w
  where lower(coalesce(w.first_name,'')) = lower(coalesce(p_first_name,''))
    and lower(coalesce(w.last_name,''))  = lower(coalesce(p_last_name,''))
    and (w.community_id = p_community_id or w.community_id is null)
    and coalesce(lower(w.status),'active') <> 'inactive'
  order by (w.community_id = p_community_id) desc nulls last
  limit 1
$$;

-- ----------------------------------------------------------------------------
-- ITEM 25 — unit_activity roll-up VIEW (cross-record, by community + bldg/apt)
-- Normalizes all unit-locatable record types into one timeline. "Lease
-- Violations" reporting = filter this view where record_type = 'Lease Violation'.
-- security_invoker = on so each querying user sees only what their RLS allows.
-- ----------------------------------------------------------------------------
create or replace view public.unit_activity
with (security_invoker = on) as
  -- incidents + lease violations (same unified record)
  select
    'incident_reports'::text as source_table,
    ir.id                    as source_id,
    ir.community_id,
    ir.building,
    ir.apartment,
    coalesce((ir.date + coalesce(ir.time,'00:00'::time)), ir.created_at::timestamp) as event_at,
    case when ir.lvl_issued then 'Lease Violation' else 'Incident' end as record_type,
    coalesce(ir.violation_type, ir.incident_type)  as detail,
    ir.hoh_name,
    ir.record_source,
    ir.reliant_case_no,
    ir.hpd_report_no,
    ir.asg_report_no
  from public.incident_reports ir
  where ir.building is not null or ir.apartment is not null

  union all
  -- parking violations
  select
    'parking_violations', pv.id, pv.community_id, pv.building, pv.apartment,
    coalesce((pv.date + coalesce(pv.time::time,'00:00'::time)), pv.created_at::timestamp),
    'Parking', pv.violation_type, pv.hoh_name, 'officer',
    null, null, null
  from public.parking_violations pv
  where pv.building is not null or pv.apartment is not null

  union all
  -- vehicle field interviews
  select
    'vehicle_fi_logs', vf.id, vf.community_id, vf.building, vf.apartment,
    coalesce((vf.date + coalesce(vf.time::time,'00:00'::time)), vf.created_at::timestamp),
    'Vehicle FI', vf.reason, vf.hoh_name, 'officer',
    null, null, null
  from public.vehicle_fi_logs vf
  where vf.building is not null or vf.apartment is not null

  union all
  -- visitor check-ins (unit_number / apartment already captured)
  select
    'visitor_logs', vl.id, vl.community_id, null::text,
    coalesce(vl.unit_number, vl.apartment),
    coalesce(vl.timestamp, vl.created_at),
    'Visitor', vl.visitor_type, vl.resident_name, 'officer',
    null, null, null
  from public.visitor_logs vl
  where coalesce(vl.unit_number, vl.apartment) is not null;

commit;

-- ============================================================================
-- NOT included here (application / follow-up work):
--   ITEM 24 (app):
--     * Violation-stage UI on the report record (notice level, distribution,
--       HOH ack, offenders) — supervisor/admin/PM only.
--     * On offender entry, call match_ban_list() and store ban_match +
--       ban_watchlist_id; surface the red ban-list flag.
--     * Late-rent path issued from Management (record_source='management',
--       violation_category='lease_compliance'); later, auto-flag from rent-roll
--       overdue balances.
--     * Escalation logic (1st->2nd->final) + repeat-offense rollup per unit.
--   ITEM 25 (app):
--     * Unit history view reads public.unit_activity filtered by community +
--       bldg/apt + date range; "Lease Violations" report = record_type filter.
--     * Reliant email INGEST -> create incident_reports rows with
--       record_source='reliant', reliant_case_no, attached PDFs.
--     * De-dup: when officer entry and Reliant ingest share a reliant_case_no /
--       hpd_report_no / asg_report_no, merge into one record (don't double-count).
--     * Extend resolve_hoh_as_of() to scan tenancy_history (from migration 26/27)
--       so the snapshot resolves correctly for back-dated records.
--   * Re-run the Supabase security advisor after applying (new tables/policies).
-- ============================================================================
