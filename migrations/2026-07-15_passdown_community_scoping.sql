-- Passdown visibility: admins + supervisors see all passdowns; everyone else
-- (officers, PMs, guests) sees only their assigned community's passdowns.
-- Enforced at RLS so the existing select("*") in the UI is scoped automatically.
create or replace function public.can_view_all_passdowns()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.user_assignments
    where user_id = auth.uid() and role in ('admin_super','supervisor')
  );
$$;

create or replace function public.my_assigned_community()
  returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select community_id from public.user_assignments where user_id = auth.uid() limit 1;
$$;

drop policy if exists "auth read" on public.passdown_logs;
create policy "read passdowns scoped" on public.passdown_logs for select to authenticated
  using (
    public.can_view_all_passdowns()
    or (community_id is not null and community_id = public.my_assigned_community())
  );
