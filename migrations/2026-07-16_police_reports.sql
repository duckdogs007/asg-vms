-- Police reports attached to a person. Dual link: a hard watchlist_id when the
-- person is in the registry, plus person_name so reports can be attached to
-- anyone the Intel search surfaces (a person of interest need not be barred).
create table if not exists public.police_reports (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete set null,
  watchlist_id  uuid references public.watchlist(id) on delete set null,
  person_name   text not null,
  agency        text,
  case_number   text,
  incident_date date,
  title         text,
  notes         text,
  file_url      text not null,
  uploaded_by   text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_police_reports_watchlist on public.police_reports(watchlist_id);
create index if not exists idx_police_reports_name      on public.police_reports(lower(person_name));
create index if not exists idx_police_reports_community on public.police_reports(community_id, created_at desc);

-- General "sees every site" check (admin, supervisor, or Patrol). Passdowns
-- reuse it so the two rules can't drift.
create or replace function public.can_view_all_sites()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
     or exists (select 1 from public.user_assignments
                where user_id = auth.uid() and role in ('admin_super','supervisor'))
     or exists (select 1 from public.user_assignments ua
                join public.communities c on c.id = ua.community_id
                where ua.user_id = auth.uid() and lower(c.name) = 'patrol');
$$;

create or replace function public.can_view_all_passdowns()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_view_all_sites();
$$;

alter table public.police_reports enable row level security;

-- Sensitive: guests (client/oversight accounts) never see police reports.
-- Otherwise scoped like passdowns: all sites for admin/supervisor/Patrol,
-- own community for everyone else.
create policy "pr_select" on public.police_reports for select to authenticated
  using (
    not public.is_guest()
    and ( public.can_view_all_sites()
          or (community_id is not null and community_id = public.my_assigned_community()) )
  );
create policy "pr_insert" on public.police_reports for insert to authenticated
  with check (not public.is_guest());
create policy "pr_update" on public.police_reports for update to authenticated
  using (not public.is_guest()) with check (not public.is_guest());
create policy "pr_delete" on public.police_reports for delete to authenticated
  using (public.is_admin());
