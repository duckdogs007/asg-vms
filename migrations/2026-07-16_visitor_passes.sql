-- Visitor Passes / Vehicle Temp Passes (numbered + logged)
-- Every printed pass is recorded here so it can be reprinted / looked up, and
-- each issuance is also written to audit_logs by the app. Already applied to
-- prod; this file is the repo record.

create table if not exists public.visitor_passes (
  id             uuid primary key default gen_random_uuid(),
  pass_number    text not null,                          -- V-XXXXX (visitor) / P-XXXXX (parking)
  pass_type      text not null check (pass_type in ('visitor','vehicle')),
  community_id   uuid references public.communities(id) on delete set null,
  visitor_log_id uuid references public.visitor_logs(id) on delete set null,
  visitor_name   text,
  person_type    text,
  unit_number    text,
  resident_name  text,
  plate          text,                                   -- vehicle passes only
  plate_state    text,
  vehicle        text,                                   -- make / model / color
  valid_from     date,                                   -- vehicle passes only
  valid_to       date,
  issued_by      text,                                   -- officer email
  created_at     timestamptz not null default now()
);

create index if not exists visitor_passes_community_idx on public.visitor_passes (community_id, created_at desc);
create index if not exists visitor_passes_number_idx    on public.visitor_passes (pass_number);
create index if not exists visitor_passes_log_idx       on public.visitor_passes (visitor_log_id);

alter table public.visitor_passes enable row level security;

-- Any authenticated user may look up / reprint passes.
drop policy if exists vp_read on public.visitor_passes;
create policy vp_read on public.visitor_passes
  for select to authenticated using (true);

-- Guards (non-guest) may issue passes.
drop policy if exists vp_insert on public.visitor_passes;
create policy vp_insert on public.visitor_passes
  for insert to authenticated with check (not public.is_guest());

-- Only admins may remove a pass record.
drop policy if exists vp_delete on public.visitor_passes;
create policy vp_delete on public.visitor_passes
  for delete to authenticated using (public.is_admin());
