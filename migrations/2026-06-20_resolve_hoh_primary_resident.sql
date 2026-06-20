-- Follow-up to 2026-06-19_items_26_27.sql (applied to prod 2026-06-20).
-- The St Luke rent roll marks the Head of Household as "Primary Resident" (not
-- "HOH"/"head"), so resolve_hoh_as_of()'s original fallback list matched nothing
-- against real data. Broaden the predicate and backfill the is_hoh flag for the
-- existing residents. Additive + idempotent.

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

update public.residents
set is_hoh = (lower(coalesce(relationship,'')) in ('hoh','head','head of household','primary resident'))
where is_hoh is null;
