-- Flag seeded sample tickets so the UI can label them clearly.
alter table public.maintenance_tickets
  add column if not exists is_sample boolean not null default false;

-- All tickets that exist at migration time are the seeded samples.
update public.maintenance_tickets set is_sample = true;
