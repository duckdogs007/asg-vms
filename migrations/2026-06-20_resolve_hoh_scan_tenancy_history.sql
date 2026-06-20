-- Item 27 step 4: extend resolve_hoh_as_of() to also scan tenancy_history, so a
-- back-dated event resolves the HOH of the tenancy that covered that date (not the
-- current occupant). Live residents + archived tenancies are unioned; the as-of
-- window filter selects the covering tenancy. Applied to prod 2026-06-20.
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
  select x.name from (
    select r.name, r.move_in
    from public.residents r
    where r.community_id = p_community_id
      and r.unit_number  = p_unit_number
      and coalesce(r.is_hoh, lower(coalesce(r.relationship,'')) in ('hoh','head','head of household','primary resident'))
      and (r.move_in  is null or r.move_in  <= p_as_of)
      and (r.move_out is null or r.move_out >= p_as_of)
    union all
    select th.name, th.move_in
    from public.tenancy_history th
    where th.community_id = p_community_id
      and th.unit_number  = p_unit_number
      and coalesce(th.is_hoh, lower(coalesce(th.relationship,'')) in ('hoh','head','head of household','primary resident'))
      and (th.move_in  is null or th.move_in  <= p_as_of)
      and (th.move_out is null or th.move_out >= p_as_of)
  ) x
  order by x.move_in desc nulls last
  limit 1
$$;
