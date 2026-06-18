-- #18 — let officers attach photos to an Incident Report.
-- Additive: multi-image support via a text[] of stored photo locators
-- (uploaded to the contact-photos bucket, same as other officer-report photos).
alter table public.incident_reports
  add column if not exists photo_urls text[];
