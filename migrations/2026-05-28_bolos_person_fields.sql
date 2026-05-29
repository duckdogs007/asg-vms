-- ============================================================
-- bolos — add person-detail fields to match the Watchlist form
-- 2026-05-28
-- ============================================================
-- Brings the BOLO form to parity with the Add to Watchlist form so a
-- BOLO can capture the same subject identifiers. All nullable; types
-- mirror the watchlist columns (dob date, firearm_flag boolean, rest text).
-- Applied to the live DB via Supabase migration bolos_add_person_fields.
-- ============================================================

ALTER TABLE public.bolos
  ADD COLUMN IF NOT EXISTS dob          date,
  ADD COLUMN IF NOT EXISTS oln          text,
  ADD COLUMN IF NOT EXISTS ssn          text,
  ADD COLUMN IF NOT EXISTS sex          text,
  ADD COLUMN IF NOT EXISTS race         text,
  ADD COLUMN IF NOT EXISTS firearm_flag boolean;
