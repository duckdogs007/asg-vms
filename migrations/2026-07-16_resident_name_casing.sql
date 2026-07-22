-- Clean up resident name casing without breaking correctly-cased names.
-- Officers reported names like "CONNIE ROBINSON" / "seven Hicks" in the unit
-- dropdown. title_case_name normalizes ONLY words that are entirely one case
-- (ALL-CAPS or all-lowercase) and leaves any mixed-case word untouched, so
-- McCray, A'Mareih, DeShawn, Ti'Onna etc. are never mangled. Roman-numeral
-- suffixes stay uppercase. Sorting is unaffected (still alphabetical; unit sort
-- is on unit_number, not name).
create or replace function public.title_case_name(n text)
  returns text language sql immutable as $$
  select case when nullif(btrim(n), '') is null then null else
    (select string_agg(
       case
         when upper(tok) in ('II','III','IV','V','VI','VII','VIII','IX') then upper(tok)
         when tok = upper(tok) and tok <> lower(tok) then initcap(tok)   -- ALL CAPS -> Proper
         when tok = lower(tok) and tok <> upper(tok) then initcap(tok)   -- all lower -> Proper
         else tok                                                        -- mixed case -> leave
       end, ' ' order by ord)
     from regexp_split_to_table(btrim(regexp_replace(n, '\s+', ' ', 'g')), ' ')
          with ordinality as t(tok, ord))
  end;
$$;

-- One-time cleanup of existing residents.
update public.residents set name = public.title_case_name(name)
where name is not null and name is distinct from public.title_case_name(name);

-- Permanent: import_rent_roll now title-cases resident names on insert, so a
-- future rent-roll import can't re-introduce the messy casing. (Full function
-- re-applied via migration 2026-07-16_import_rent_roll_title_case; the only
-- change is the resident-name expression -> public.title_case_name(r.name).)
