-- Item #46 — Watchlist INSERT: allow all authenticated non-guest users (not just admins)
-- Officers need to add single watchlist entries; CSV bulk import stays admin-only in app code.
-- UPDATE / DELETE remain admin-only (unchanged).

DROP POLICY IF EXISTS "admin_insert_watchlist" ON public.watchlist;

CREATE POLICY "auth_insert_watchlist" ON public.watchlist
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_guest());
