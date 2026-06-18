-- #21 — add a "Patrol" location for roving multi-location officers.
-- Additive data insert: gives roving officers a community to operate under so it
-- appears in all location dropdowns (which are driven by the communities table).
-- Idempotent — won't duplicate if it already exists.
insert into public.communities (id, name)
select gen_random_uuid(), 'Patrol'
where not exists (select 1 from public.communities where name = 'Patrol');
