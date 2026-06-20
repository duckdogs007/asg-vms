-- ============================================================================
-- VMS migration — items 26 + 27
-- Structured bldg/apt + HOH snapshot + linked ref #s (item 26)
-- Tenancy history + lifecycle columns (item 27)
--
-- Safe to review/apply in a transaction. Idempotent (IF NOT EXISTS).
-- Does NOT drop or rename existing columns — additive only.
-- Existing free-text `location` fields are kept for back-compat.
-- Verified against live schema 2026-06-19.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ITEM 27a — Resident/tenancy lifecycle columns
-- Live `residents` could only hold the CURRENT occupant (no move_out/lease_to).
-- Add the lifecycle fields the rent roll actually provides (they already exist
-- on the empty `residents_import` staging table but were dropped on import).
-- ----------------------------------------------------------------------------
alter table public.residents
  add column if not exists lease_to   date,
  add column if not exists move_out   date,
  add column if not exists is_hoh     boolean,          -- convenience flag; app sets from `relationship`
  add column if not exists status     text not null default 'active',  -- 'active' | 'archived'
  add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- ITEM 27b — tenancy_history table
-- Mirrors the existing watchlist -> ban_history pattern: a shadow/archive table
-- so prior tenancies persist when a unit turns over. Import archives the prior
-- household here (with move_out) instead of overwriting and discarding it.
-- ----------------------------------------------------------------------------
create table if not exists public.tenancy_history (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid,                                  -- original residents.id (soft ref; may outlive the row)
  community_id    uuid references public.communities(id),
  unit_number     text not null,
  name            text,
  relationship    text,
  is_hoh          boolean,
  move_in         date,
  lease_from      date,
  lease_to        date,
  move_out        date,
  archived_reason text,                                  -- 'rent_roll_import' | 'eviction' | 'move_out' | 'correction'
  archived_by     text,
  archived_at     timestamptz not null default now()
);

create index if not exists tenancy_history_community_unit_idx
  on public.tenancy_history (community_id, unit_number);
create index if not exists tenancy_history_name_idx
  on public.tenancy_history (lower(name));

alter table public.tenancy_history enable row level security;

-- Read: any authenticated user (matches residents visibility). Adjust to mirror
-- your exact residents policies if they are narrower.
drop policy if exists tenancy_history_read on public.tenancy_history;
create policy tenancy_history_read
  on public.tenancy_history for select
  to authenticated
  using (true);

-- Writes: archival is performed by the import job (service role) / admins only.
-- Service role bypasses RLS; this policy gates admin writes via existing is_admin().
drop policy if exists tenancy_history_admin_write on public.tenancy_history;
create policy tenancy_history_admin_write
  on public.tenancy_history for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ITEM 26 — incident_reports: structured location + HOH snapshot + linked ref #s
-- Keep existing free-text `location` (back-compat / common-area free text).
-- ----------------------------------------------------------------------------
alter table public.incident_reports
  -- structured location
  add column if not exists location_type     text default 'unit',   -- 'unit' | 'common_area'
  add column if not exists building          text,
  add column if not exists apartment         text,
  add column if not exists common_area       text,                  -- when location_type = 'common_area'
  -- HOH / household snapshot (FROZEN at creation — never reassigned by later imports)
  add column if not exists hoh_name          text,
  add column if not exists hoh_resident_id   uuid,                  -- soft ref to residents.id at time of event
  add column if not exists household_snapshot jsonb,                -- roster (HOH + others on lease) at time of event
  -- linked reference numbers (item 25)
  add column if not exists reliant_case_no   text,
  add column if not exists hpd_report_no     text,
  add column if not exists asg_report_no     text;

create index if not exists incident_reports_unit_idx
  on public.incident_reports (community_id, building, apartment);
create index if not exists incident_reports_reliant_idx
  on public.incident_reports (reliant_case_no);
create index if not exists incident_reports_hpd_idx
  on public.incident_reports (hpd_report_no);
create index if not exists incident_reports_asg_idx
  on public.incident_reports (asg_report_no);

-- ----------------------------------------------------------------------------
-- ITEM 26 (extend) — same structured location + HOH snapshot on the other
-- unit-locatable report types, so everything joins on the same key.
-- ----------------------------------------------------------------------------
alter table public.parking_violations
  add column if not exists location_type      text default 'unit',
  add column if not exists building           text,
  add column if not exists apartment          text,
  add column if not exists common_area        text,
  add column if not exists hoh_name           text,
  add column if not exists hoh_resident_id    uuid,
  add column if not exists household_snapshot jsonb;

create index if not exists parking_violations_unit_idx
  on public.parking_violations (community_id, building, apartment);

alter table public.vehicle_fi_logs
  add column if not exists location_type      text default 'unit',
  add column if not exists building           text,
  add column if not exists apartment          text,
  add column if not exists common_area        text,
  add column if not exists hoh_name           text,
  add column if not exists hoh_resident_id    uuid,
  add column if not exists household_snapshot jsonb;

create index if not exists vehicle_fi_logs_unit_idx
  on public.vehicle_fi_logs (community_id, building, apartment);

-- ----------------------------------------------------------------------------
-- Helper — resolve the HOH for a unit AS OF a given date.
-- Lets back-dated reports attribute to the correct (then-current) HOH by
-- checking live residents first, then tenancy_history. Used at record creation
-- to populate the snapshot columns above.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_hoh_as_of(
  p_community_id uuid,
  p_unit_number  text,
  p_as_of        date default current_date
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  -- live residents (current tenancy)
  select r.name
  from public.residents r
  where r.community_id = p_community_id
    and r.unit_number  = p_unit_number
    and coalesce(r.is_hoh, lower(coalesce(r.relationship,'')) in ('hoh','head','head of household','primary resident'))
    and (r.move_in  is null or r.move_in  <= p_as_of)
    and (r.move_out is null or r.move_out >= p_as_of)
  order by r.move_in desc nulls last
  limit 1
$$;

-- Note: extend this to also scan tenancy_history once import-archival is live,
-- e.g. UNION the archived tenancy whose [move_in, move_out] window covers p_as_of.

commit;

-- ============================================================================
-- NOT included here (application / follow-up work):
--   * Change the rent-roll IMPORT to archive-on-change instead of overwrite
--     (diff incoming vs current residents per unit; copy prior rows to
--      tenancy_history with move_out before updating). This is app/edge logic.
--   * App: populate hoh_name / hoh_resident_id / household_snapshot at record
--     creation via resolve_hoh_as_of() + the unit's current roster.
--   * App: incident form UI for location_type toggle + bldg/apt vs common_area
--     (item 26) and the linked ref-number fields (item 25).
--   * Security advisor follow-ups (separate from this migration):
--     - review EXECUTE on public.is_admin() / set_my_assignment()
--     - enable leaked-password protection in Auth settings
-- ============================================================================
