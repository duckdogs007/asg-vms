-- ============================================================
-- BOLO structured license-plate fields + Vehicle FI bolo_match
-- 2026-06-11
-- ============================================================
-- The Parking Violation / Vehicle FI plate cross-check previously
-- substring-matched the typed plate against the free-text `bolos.vehicle`
-- description (fragile: only hits if the plate was typed into the blurb,
-- false-positives on short plates, misses spaces/dashes).
--
-- Adds a structured `plate` (+ `plate_state`) to BOLOs so the lookup can
-- match on a normalized plate number, keeping the free-text `vehicle`
-- match as a fallback for legacy BOLOs with no structured plate.
--
-- Also adds `bolo_match` to vehicle_fi_logs so Vehicle FI can snapshot the
-- check result, matching parking_violations.bolo_match.
--
-- Already applied to project xmomsoobriehgrnppewa via Supabase MCP
-- (migration name: bolo_plate_fields). This file is the repo record.
-- ============================================================

alter table public.bolos
  add column if not exists plate       text,
  add column if not exists plate_state text;

-- Index the normalized plate (uppercase, alphanumerics only) for direct lookups.
create index if not exists bolos_plate_idx
  on public.bolos (upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')))
  where plate is not null;

alter table public.vehicle_fi_logs
  add column if not exists bolo_match boolean default false;
