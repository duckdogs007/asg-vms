-- "Was Reliant (SOC) notified?" compliance check (item 28), scoped per-community.
-- Flag gates the required Yes/No on the Incident form; only St Luke uses Reliant.
-- Additive + idempotent. Applied to prod 2026-06-20.
alter table public.communities
  add column if not exists requires_reliant_notification boolean not null default false;

update public.communities
  set requires_reliant_notification = true
  where name = 'St Luke Apartments' and requires_reliant_notification = false;

alter table public.incident_reports
  add column if not exists reliant_notified            boolean,
  add column if not exists reliant_notified_at         timestamptz,
  add column if not exists reliant_not_notified_reason text;
