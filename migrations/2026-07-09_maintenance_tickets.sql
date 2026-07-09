-- Property maintenance ticketing (Property Hub). Staff (Property Management,
-- Security, Maintenance, etc.) log work items; guests blocked; admins delete.
create table if not exists public.maintenance_tickets (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  title           text not null,
  category        text,
  priority        text not null default 'Medium',
  status          text not null default 'Open',
  location        text,
  description     text,
  reported_by     text,
  reporter_role   text,
  assigned_to     text,
  resolution_notes text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists idx_maint_tickets_community on public.maintenance_tickets(community_id, created_at desc);

alter table public.maintenance_tickets enable row level security;
create policy "mt_read"   on public.maintenance_tickets for select to authenticated using (true);
create policy "mt_insert" on public.maintenance_tickets for insert to authenticated with check (not public.is_guest());
create policy "mt_update" on public.maintenance_tickets for update to authenticated using (not public.is_guest()) with check (not public.is_guest());
create policy "mt_delete" on public.maintenance_tickets for delete to authenticated using (public.is_admin());
