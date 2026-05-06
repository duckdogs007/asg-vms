-- ============================================================
-- RLS Hardening Migration — VMS
-- 2026-04-26
-- ============================================================
-- Goals:
--  1. Enable RLS on every public table that's currently exposed
--     to the anon role
--  2. Drop duplicate / always-true / anon-permitting policies
--     that have accumulated
--  3. Replace them with a clean per-operation auth-only set
--  4. Add policies to tables that have RLS on but no policies
--     (currently locked out)
--
-- This preserves current app behaviour (signed-in users can do
-- everything they could before) while cutting off anon-key reads.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── 1. Enable RLS on currently-unprotected tables ──────────

alter table public.contact_history    enable row level security;
alter table public.residents          enable row level security;
alter table public.units              enable row level security;
alter table public.vehicle_entries    enable row level security;
alter table public.residents_import   enable row level security;
alter table public.ban_history        enable row level security;
alter table public.persons            enable row level security;
alter table public.person_notes       enable row level security;
alter table public.passdown_logs      enable row level security;
alter table public.bolos              enable row level security;
alter table public.person_flags       enable row level security;

-- ── 2. Apply standard auth-only policy set to those tables ──
-- Includes vehicles + vehicle_watchlist (RLS was on but no policies).
do $$
declare t text;
begin
  foreach t in array array[
    'contact_history', 'residents', 'units', 'vehicle_entries',
    'residents_import', 'ban_history', 'persons', 'person_notes',
    'passdown_logs', 'bolos', 'person_flags',
    'vehicles', 'vehicle_watchlist'
  ]
  loop
    execute format('drop policy if exists "auth read"   on public.%I;', t);
    execute format('drop policy if exists "auth insert" on public.%I;', t);
    execute format('drop policy if exists "auth update" on public.%I;', t);
    execute format('drop policy if exists "auth delete" on public.%I;', t);
    execute format('create policy "auth read"   on public.%I for select using (auth.role() = ''authenticated'');',         t);
    execute format('create policy "auth insert" on public.%I for insert with check (auth.role() = ''authenticated'');',    t);
    execute format('create policy "auth update" on public.%I for update using (auth.role() = ''authenticated'');',         t);
    execute format('create policy "auth delete" on public.%I for delete using (auth.role() = ''authenticated'');',         t);
  end loop;
end $$;

-- Drop the orphan policies on contact_history that pre-dated RLS being enabled
drop policy if exists "auth delete" on public.contact_history;  -- recreated by loop above; this also handles old name conflict
drop policy if exists "auth update" on public.contact_history;
-- (loop above re-created the canonical set)

-- ── 3. Clean duplicate / anon insert policies on visitor_logs ──

drop policy if exists "Allow inserts logs"                          on public.visitor_logs;
drop policy if exists "Enable insert for authenticated users only"  on public.visitor_logs;
drop policy if exists "allow insert visitor logs"                   on public.visitor_logs;
drop policy if exists "allow_insert_logs"                           on public.visitor_logs;

drop policy if exists "auth read visitor_logs"   on public.visitor_logs;
drop policy if exists "auth insert visitor_logs" on public.visitor_logs;
drop policy if exists "auth update visitor_logs" on public.visitor_logs;
drop policy if exists "auth delete visitor_logs" on public.visitor_logs;

create policy "auth read visitor_logs"
  on public.visitor_logs for select using (auth.role() = 'authenticated');
create policy "auth insert visitor_logs"
  on public.visitor_logs for insert with check (auth.role() = 'authenticated');
create policy "auth update visitor_logs"
  on public.visitor_logs for update using (auth.role() = 'authenticated');
create policy "auth delete visitor_logs"
  on public.visitor_logs for delete using (auth.role() = 'authenticated');

-- ── 4. Clean duplicate / anon insert policies on visitors ──

drop policy if exists "Allow inserts visitors" on public.visitors;
drop policy if exists "allow_insert_visitors"  on public.visitors;

drop policy if exists "auth read visitors"   on public.visitors;
drop policy if exists "auth insert visitors" on public.visitors;
drop policy if exists "auth update visitors" on public.visitors;
drop policy if exists "auth delete visitors" on public.visitors;

create policy "auth read visitors"
  on public.visitors for select using (auth.role() = 'authenticated');
create policy "auth insert visitors"
  on public.visitors for insert with check (auth.role() = 'authenticated');
create policy "auth update visitors"
  on public.visitors for update using (auth.role() = 'authenticated');
create policy "auth delete visitors"
  on public.visitors for delete using (auth.role() = 'authenticated');

-- ── 5. Replace blanket "ALL true/true" on watchlist ──

drop policy if exists "Allow authenticated users" on public.watchlist;

drop policy if exists "auth read watchlist"   on public.watchlist;
drop policy if exists "auth insert watchlist" on public.watchlist;
drop policy if exists "auth update watchlist" on public.watchlist;
drop policy if exists "auth delete watchlist" on public.watchlist;

create policy "auth read watchlist"
  on public.watchlist for select using (auth.role() = 'authenticated');
create policy "auth insert watchlist"
  on public.watchlist for insert with check (auth.role() = 'authenticated');
create policy "auth update watchlist"
  on public.watchlist for update using (auth.role() = 'authenticated');
create policy "auth delete watchlist"
  on public.watchlist for delete using (auth.role() = 'authenticated');

-- ── 6. Replace "always-true" insert policies on report tables ──

drop policy if exists "authenticated insert incidents" on public.incident_reports;
drop policy if exists "auth insert incidents"          on public.incident_reports;
create policy "auth insert incidents"
  on public.incident_reports for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated insert daily logs" on public.officer_daily_logs;
drop policy if exists "auth insert daily logs"          on public.officer_daily_logs;
create policy "auth insert daily logs"
  on public.officer_daily_logs for insert with check (auth.role() = 'authenticated');
