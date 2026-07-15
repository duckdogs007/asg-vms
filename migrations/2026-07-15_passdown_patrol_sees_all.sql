-- Patrol officers (assigned to the "Patrol" community) cover all locations, so
-- treat them like supervisors/admins for passdown visibility: they see every
-- passdown, not just one community's. Extends can_view_all_passdowns().
create or replace function public.can_view_all_passdowns()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
     or exists (
       select 1 from public.user_assignments
       where user_id = auth.uid() and role in ('admin_super','supervisor')
     )
     or exists (
       select 1 from public.user_assignments ua
       join public.communities c on c.id = ua.community_id
       where ua.user_id = auth.uid() and lower(c.name) = 'patrol'
     );
$$;
