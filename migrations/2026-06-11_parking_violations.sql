-- ============================================================
-- #6 Parking Violations — Officer Reports report type
-- 2026-06-11
-- ============================================================
-- New report type under the User Dashboard → Officer Reports tab.
-- Independent of vehicle_fi_logs (which is an observational field
-- interview): a parking violation is an enforcement citation with a
-- structured violation_type, parking space, and a tow workflow, so it
-- gets its own table. Reporting, per-location tow rules (#5), and
-- auto-remit routing all key off the structured violation_type.
--
-- Vehicle columns mirror vehicle_fi_logs so the shared <VehicleFields>
-- component drives both forms. RLS mirrors vehicle_fi_logs /
-- officer_daily_logs: authenticated read/insert/update, admin-only delete.
--
-- Already applied to project xmomsoobriehgrnppewa via Supabase MCP
-- (migration name: parking_violations). This file is the repo record.
-- ============================================================

create table if not exists public.parking_violations (
  id                uuid primary key default gen_random_uuid(),
  date              date,
  "time"            text,
  community_id      uuid references public.communities(id) on delete set null,
  officer_name      text,
  -- vehicle (same shape as vehicle_fi_logs, shared VehicleFields component)
  make              text,
  model             text,
  color             text,
  year              text,
  state             text,
  plate             text,
  -- parking-specific
  location          text,
  space             text,
  violation_type    text,
  notes             text,
  photo_url         text,
  -- tow workflow: manual flag + dispatch log. Auto-rules / tow-company
  -- notification are deferred to the per-location data model (#5).
  tow_requested     boolean default false,
  tow_requested_at  timestamptz,
  tow_requested_by  text,
  tow_reason        text,
  -- snapshot of the active-BOLO plate cross-check at submission time
  bolo_match        boolean default false,
  created_at        timestamptz not null default now()
);

create index if not exists parking_violations_date_idx     on public.parking_violations (date desc);
create index if not exists parking_violations_plate_idx    on public.parking_violations (lower(plate));
create index if not exists parking_violations_community_idx on public.parking_violations (community_id);

alter table public.parking_violations enable row level security;

drop policy if exists "auth read parking violations"   on public.parking_violations;
drop policy if exists "auth insert parking violations"  on public.parking_violations;
drop policy if exists "auth update parking violations"  on public.parking_violations;
drop policy if exists "admin delete parking violations" on public.parking_violations;

create policy "auth read parking violations"   on public.parking_violations for select using (auth.role() = 'authenticated');
create policy "auth insert parking violations"  on public.parking_violations for insert with check (auth.role() = 'authenticated');
create policy "auth update parking violations"  on public.parking_violations for update using (auth.role() = 'authenticated');
create policy "admin delete parking violations" on public.parking_violations for delete using (is_admin());
