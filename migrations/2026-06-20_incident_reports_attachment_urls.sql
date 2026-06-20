-- Document attachments for lease violations / incidents (LVL letter PDF, evidence).
-- Stored as locators in the community-docs bucket, re-signed on read (like photo_urls).
-- Additive + idempotent. Applied to prod 2026-06-20.
alter table public.incident_reports
  add column if not exists attachment_urls text[];
