-- DAR (officer daily log): capture additional officers working the same shift,
-- stored as jsonb array of { name, shift_times }.
alter table public.officer_daily_logs
  add column if not exists additional_officers jsonb;
