-- Audit table for visitor check-in attempts that were blocked because the
-- visitor matched the watchlist with a confirmed DOB.
-- Run in Supabase SQL Editor.

create table if not exists denied_entries (
  id             uuid primary key default gen_random_uuid(),
  watchlist_id   uuid references watchlist(id),
  first_name     text not null,
  last_name      text not null,
  dob            date,
  oln            text,
  community_id   uuid references communities(id),
  community_name text,
  unit_number    text,
  resident_name  text,
  guard_email    text,
  reason         text,
  alert_sent     boolean default false,
  attempted_at   timestamptz not null default now()
);

create index if not exists denied_entries_attempted_at_idx
  on denied_entries (attempted_at desc);
create index if not exists denied_entries_community_idx
  on denied_entries (community_id);

alter table denied_entries enable row level security;

drop policy if exists "auth read denied"   on denied_entries;
drop policy if exists "auth insert denied" on denied_entries;

create policy "auth read denied"
  on denied_entries for select using (auth.role() = 'authenticated');

create policy "auth insert denied"
  on denied_entries for insert with check (auth.role() = 'authenticated');
