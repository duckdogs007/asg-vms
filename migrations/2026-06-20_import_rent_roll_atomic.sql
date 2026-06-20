-- Atomic rent-roll import (item 27). Archives changed-HOH tenancies, replaces
-- residents, and rebuilds units in ONE transaction (a function body is atomic),
-- so a mid-import failure can never leave a partial roll. Admin-gated; enforces
-- the data-loss guard server-side. Applied to prod 2026-06-20.
-- p_rows = jsonb array of {unit_number,name,relationship,move_in,lease_from,lease_to,move_out}.
create or replace function public.import_rent_roll(
  p_community_id uuid,
  p_rows jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur_named int;
  v_inc_named int;
  v_archived  int := 0;
  v_units     int;
  v_imported  int;
begin
  if not public.is_admin() then
    raise exception 'Not authorized: rent-roll import is admin only';
  end if;

  select count(*) into v_inc_named
  from jsonb_to_recordset(p_rows) as r(name text)
  where coalesce(nullif(trim(r.name), ''), '') <> '';

  select count(*) into v_cur_named
  from public.residents
  where community_id = p_community_id and coalesce(nullif(trim(name), ''), '') <> '';

  if v_cur_named > 0 and v_inc_named < v_cur_named * 0.5 and not p_force then
    raise exception 'Aborted: incoming residents (%) < 50%% of current (%) — pass force to override', v_inc_named, v_cur_named;
  end if;

  with inc as (
    select * from jsonb_to_recordset(p_rows) as r(
      unit_number text, name text, relationship text,
      move_in date, lease_from date, lease_to date, move_out date)
  ),
  cur_hoh as (
    select unit_number,
           lower(max(name) filter (where lower(coalesce(relationship,'')) in
             ('hoh','head','head of household','primary resident'))) as hoh
    from public.residents where community_id = p_community_id group by unit_number
  ),
  inc_hoh as (
    select unit_number,
           lower(max(name) filter (where lower(coalesce(relationship,'')) in
             ('hoh','head','head of household','primary resident'))) as hoh,
           max(move_in) filter (where lower(coalesce(relationship,'')) in
             ('hoh','head','head of household','primary resident')) as hoh_move_in
    from inc group by unit_number
  ),
  changed as (
    select c.unit_number, i.hoh_move_in
    from cur_hoh c left join inc_hoh i on i.unit_number = c.unit_number
    where coalesce(c.hoh,'') is distinct from coalesce(i.hoh,'')
  ),
  archived as (
    insert into public.tenancy_history
      (resident_id, community_id, unit_number, name, relationship, is_hoh,
       move_in, lease_from, lease_to, move_out, archived_reason)
    select r.id, r.community_id, r.unit_number, r.name, r.relationship,
           lower(coalesce(r.relationship,'')) in ('hoh','head','head of household','primary resident'),
           r.move_in, r.lease_from, r.lease_to,
           coalesce(r.move_out, ch.hoh_move_in, current_date),
           'rent_roll_import'
    from public.residents r
    join changed ch on ch.unit_number = r.unit_number
    where r.community_id = p_community_id and coalesce(nullif(trim(r.name),''),'') <> ''
    returning unit_number
  )
  select count(distinct unit_number) into v_archived from archived;

  delete from public.residents where community_id = p_community_id;

  insert into public.residents
    (community_id, unit_number, name, relationship, move_in, lease_from, lease_to, move_out, is_hoh, status)
  select p_community_id, r.unit_number, nullif(trim(r.name),''), nullif(trim(r.relationship),''),
         r.move_in, r.lease_from, r.lease_to, r.move_out,
         lower(coalesce(r.relationship,'')) in ('hoh','head','head of household','primary resident'),
         'active'
  from jsonb_to_recordset(p_rows) as r(
    unit_number text, name text, relationship text,
    move_in date, lease_from date, lease_to date, move_out date);

  delete from public.units where community_id = p_community_id;
  insert into public.units (community_id, unit_number)
  select distinct p_community_id, nullif(trim(r.unit_number),'')
  from jsonb_to_recordset(p_rows) as r(unit_number text)
  where coalesce(nullif(trim(r.unit_number),''),'') <> '';

  select count(*) into v_units    from public.units     where community_id = p_community_id;
  select count(*) into v_imported from public.residents where community_id = p_community_id;

  return jsonb_build_object('imported', v_imported, 'units', v_units, 'archived_units', v_archived);
end;
$$;

-- Only signed-in users may invoke it; the body still gates on is_admin().
revoke execute on function public.import_rent_roll(uuid, jsonb, boolean) from public;
revoke execute on function public.import_rent_roll(uuid, jsonb, boolean) from anon;
grant  execute on function public.import_rent_roll(uuid, jsonb, boolean) to authenticated;
