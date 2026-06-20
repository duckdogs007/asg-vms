-- Track when a passdown was emailed to the next shift. Saving a passdown no
-- longer auto-sends it; officers review/edit the narrative first, then Send.
-- Additive + idempotent. Applied to prod 2026-06-20.
alter table public.passdown_logs
  add column if not exists sent_at timestamptz;
