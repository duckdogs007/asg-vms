-- ============================================================
-- Schema fixes for /admin Officer Reports + /vms/intel/[id]
-- 2026-05-07
-- ============================================================
-- Two related issues, both filed in the audit memory:
--
-- 1. /admin Officer Reports → Incident Reports: the form sends a rich
--    payload (date, time, community_id, location, incident_type,
--    persons_involved, description, action_taken, follow_up_required)
--    but public.incident_reports only had id/person_id/report/
--    officer_name/created_at. Both INSERT and SELECT order-by-date
--    failed; the feature had 0 rows since launch.
--
-- 2. /vms/intel/[id] photo upload writes a public URL into
--    watchlist.photo_url, but that column never existed — every
--    upload silently failed to persist its URL.
--
-- Both fixes are additive; no data migration needed.
-- ============================================================

-- 1. incident_reports — add the columns the rich admin form needs
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

-- 2. watchlist.photo_url — store the most-recent uploaded photo's URL
ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.watchlist.photo_url IS
  'Public URL of the most-recently uploaded photo for this person (set by /vms/intel/[id] photo upload flow).';
