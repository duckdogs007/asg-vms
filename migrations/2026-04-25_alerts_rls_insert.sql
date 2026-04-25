-- Fix: allow authenticated users to insert alerts (so the API route can log).
-- Original migration only granted SELECT.

drop policy if exists "auth insert alerts" on alerts;
create policy "auth insert alerts"
  on alerts for insert with check (auth.role() = 'authenticated');

drop policy if exists "auth update alerts" on alerts;
create policy "auth update alerts"
  on alerts for update using (auth.role() = 'authenticated');
