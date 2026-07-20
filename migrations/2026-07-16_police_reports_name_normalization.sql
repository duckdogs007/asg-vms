-- Normalized name parts so reports filed as "Johnson, O", "O Johnson" and
-- "Oliver Johnson" all resolve to the same person. Surname is the anchor; the
-- first name only BROADENS the match (an initial/prefix matches a full name),
-- so a search never misses a person — see lib/nameSearch.ts.
alter table public.police_reports
  add column if not exists person_first text,
  add column if not exists person_last  text;

update public.police_reports set
  person_last = lower(trim(case when person_name like '%,%'
                  then split_part(person_name, ',', 1)
                  else regexp_replace(trim(person_name), '^.*\s', '') end)),
  person_first = lower(trim(case when person_name like '%,%'
                  then split_part(person_name, ',', 2)
                  else split_part(trim(person_name), ' ', 1) end))
where person_last is null;

create index if not exists idx_police_reports_person_last on public.police_reports(person_last);
