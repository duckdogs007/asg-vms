-- ============================================================
-- BOLO plate backfill — extract plates from legacy free-text `vehicle`
-- 2026-06-11
-- ============================================================
-- One-time DATA backfill (not schema) following the structured-plate
-- migration (2026-06-11_bolo_plate_fields.sql). BOLOs created before that
-- stored the plate inside the free-text `vehicle` description; this lifts a
-- plate into the structured `plate` / `plate_state` columns so the normalized
-- plate cross-check (Parking Violations / Vehicle FI) matches them precisely
-- instead of relying on the free-text fallback.
--
-- Conservative by design — only rows whose `vehicle` is exactly a
-- "<2-letter state> <plate>" token where the plate contains a digit are
-- touched. Free-text like "unk", "un", "big truck", "2026 Cybertruck" is
-- left as-is (it keeps working via the legacy free-text fallback).
--
-- Idempotent: only updates rows where `plate` is still null, so re-running is
-- a no-op. Applied to project xmomsoobriehgrnppewa via Supabase MCP on
-- 2026-06-11 (3 rows updated: VA SXP-4594, VA UUJ-3880, VA TGP-5924).
-- This file is the repo record.
-- ============================================================

update public.bolos
set plate       = upper((regexp_match(btrim(vehicle), '^([A-Za-z]{2})[ ]+([A-Za-z0-9-]{4,8})$'))[2]),
    plate_state = upper((regexp_match(btrim(vehicle), '^([A-Za-z]{2})[ ]+([A-Za-z0-9-]{4,8})$'))[1])
where plate is null
  and vehicle is not null
  and btrim(vehicle) ~ '^[A-Za-z]{2}[ ]+[A-Za-z0-9-]{4,8}$'
  and (regexp_match(btrim(vehicle), '^[A-Za-z]{2}[ ]+([A-Za-z0-9-]{4,8})$'))[1] ~ '[0-9]';
