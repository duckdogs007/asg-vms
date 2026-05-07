-- ============================================================
-- incident_reports — extend schema to match the /admin form
-- 2026-05-07
-- ============================================================
-- The /admin Officer Reports → Incident Reports form has always
-- written a rich payload (date, time, community_id, location,
-- incident_type, persons_involved, description, action_taken,
-- follow_up_required) but the table only had:
--     id, person_id, report, officer_name, created_at
-- Both the INSERT and the SELECT order-by date failed. The feature
-- was non-functional from launch — 0 rows in production.
--
-- Fix: additively add the expected columns. Legacy columns
-- (person_id, report) are kept so the older /vms/intel/[id]
-- "Add Incident" insert path keeps working too.
-- ============================================================

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS date               date,
  ADD COLUMN IF NOT EXISTS "time"             time,
  ADD COLUMN IF NOT EXISTS community_id       uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location           text,
  ADD COLUMN IF NOT EXISTS incident_type      text,
  ADD COLUMN IF NOT EXISTS persons_involved   text,
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS action_taken       text,
  ADD COLUMN IF NOT EXISTS follow_up_required boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS incident_reports_date_idx ON public.incident_reports (date DESC);
