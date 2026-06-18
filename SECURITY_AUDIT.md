# VMS Security Audit — #16

**Date:** 2026-06-15 (remediation completed 2026-06-17)
**Project:** ASG-VMS (Supabase `xmomsoobriehgrnppewa`, Postgres 17, us-east-1)
**Scope:** RLS coverage, policy correctness, role gating, storage buckets, anon/API exposure, Supabase advisors.

> **Status (2026-06-17): fully remediated for the current plan.** All DB hardening + the storage privacy migration are applied to prod, and the app (prod commit `bb5ef6f`) serves signed URLs. The only open advisor item is leaked-password protection, which **requires a Supabase Pro plan** and is therefore deferred until upgrade.

---

## Summary

| Area | Result |
|------|--------|
| RLS enabled on all public tables | ✅ 33/33 enabled; no table with RLS-but-zero-policies (no accidental deny-all or wide-open) |
| Anon (unauthenticated) row access | ✅ Blocked — every SELECT/INSERT/UPDATE policy requires `auth.role() = 'authenticated'` |
| `is_admin()` / role plumbing | ✅ Correct — `SECURITY DEFINER`, `search_path` pinned, reads `admin_users` by `auth.uid()` |
| **Storage buckets** | ✅ **RESOLVED (2026-06-17)** — was HIGH (public + listable PII); now private + authenticated-only read, app serves signed URLs. Advisor listing warnings cleared. |
| Audit log / admin-table read gating | ✅ RESOLVED — admin-only read on `audit_logs` + `admin_users` |
| Function hardening | ✅ RESOLVED — `search_path` pinned on `check_watchlist_match`; `EXECUTE` revoked on `rls_auto_enable` |
| Auth config | ⚠️ DEFERRED — leaked-password protection (HaveIBeenPwned) requires a **Supabase Pro plan**; not available on Free |

The database authorization model is fundamentally sound: RLS is universally enabled, anon is shut out, and writes to sensitive/config tables (`watchlist`, `bolos`, `communities`, `admin_users`, `registered_vehicles`, `user_assignments`, …) are gated to admins via `is_admin()`. The material exposure is **storage**, not the tables.

---

## Findings & remediation

### 1. HIGH — Public, listable storage buckets holding PII
All three buckets are `public = true` with a broad `SELECT` policy for the `public` role on `storage.objects`:

| Bucket | Holds | Policy |
|--------|-------|--------|
| `photos` | watchlist person photos, **ban sheets (multi-page PII docs)**, gate-checklist photos | `Public can read photos` (anyone) |
| `contact-photos` | field-contact / ID photos, parking-violation photos | `Public can read contact photos` (anyone) |
| `community-docs` | uploaded community/property documents | `Public can read community docs` (anyone) |

**Impact:** Files are served at public URLs with **no authentication** (anyone with the link), and the broad SELECT policy additionally lets a client **enumerate/list every object** in each bucket. This exposes resident/visitor PII (faces, names on ban sheets, IDs) to the open internet. This is the gap explicitly called out in TODO #16.

**Remediation (breaking — needs app change, see "Pending decisions"):**
1. Set buckets to `public = false`.
2. Drop the broad `Public can read …` SELECT policies; replace with `authenticated`-only SELECT scoped per bucket.
3. Switch the app from `supabase.storage.from(b).getPublicUrl(path)` to `createSignedUrl(path, ttl)` (12 call sites across `app/userdash/page.tsx`, `app/userdash/GateChecklist.tsx`, `app/vms/intel/page.tsx`, `app/vms/intel/[id]/page.tsx`, `app/vms/property/page.tsx`).

> Held for approval because flipping buckets to private **immediately breaks** every existing `getPublicUrl` image/doc render until the signed-URL change ships. Recommend doing both together in one PR.

Advisor ref: https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing

### 2. MEDIUM — `audit_logs` and `admin_users` readable by any authenticated user
- `audit_logs` SELECT policy = `auth.role() = 'authenticated'`. The audit log is only **read** in the admin-only screen (`app/admin/system/page.tsx`); all other references are inserts. So DB-level admin gating is safe and closes the gap.
- `admin_users` SELECT policy `USING (true)` lets any signed-in user enumerate the admin list. `checkIsAdmin()` only ever self-queries (`where user_id = auth.uid()`), and `is_admin()` is `SECURITY DEFINER` (independent of this policy), so restricting SELECT to admins does not break the admin check.

**Remediation:** Applied in the hardening migration (admin-only SELECT for both). Non-breaking per the usage analysis above.

### 3. LOW — Function hardening
- `check_watchlist_match()` (trigger, `SECURITY INVOKER`) has a **mutable `search_path`** → pin `SET search_path = public, pg_temp`. (Advisor `0011`.)
- `rls_auto_enable()` (event trigger, `SECURITY DEFINER`) is `EXECUTE`-able by `anon`/`authenticated` via `/rpc` → `REVOKE EXECUTE`. (Advisors `0028`/`0029`.)
- `is_admin()` and `set_my_assignment()` are also flagged `0028`/`0029` but are **benign and intentional**: `is_admin()` is required by RLS and returns only a boolean about the caller; `set_my_assignment()` writes only the caller's own row and refuses to alter `role`. No change.

**Remediation:** `check_watchlist_match` search_path + `rls_auto_enable` revoke applied in the hardening migration.

### 4. LOW — Auth: leaked-password protection disabled (DEFERRED — Pro plan required)
The HaveIBeenPwned check lives in **Dashboard → Authentication → Policies**, but it is a **Supabase Pro-plan feature** — not available on the current Free plan, so it can't be enabled today. Revisit on upgrade.
Ref: https://supabase.com/docs/guides/auth/password-security

### 5. Notes (no action — by design)
- `anon` holds the default table-level grants on all public tables, but RLS blocks it everywhere (every policy requires `authenticated`). Functionally safe; revoking the default grants is optional defense-in-depth and not done here to avoid PostgREST surprises.
- Operational tables (`bolos`, `persons`, `watchlist` update, `parking_violations`, daily logs, etc.) allow **UPDATE by any authenticated officer**. This matches the product model (officers edit their own reports/BOLOs; only DELETE is admin-gated). Revisit if/when the `property_manager`/per-officer scoping work (#7b/#8) lands.

---

## Applied vs. pending

**Applied to prod** (`migrations/2026-06-15_security_audit_hardening.sql`, run 2026-06-15; advisor re-run confirmed the two function findings cleared):
- Admin-only SELECT on `audit_logs` and `admin_users`.
- Pin `search_path` on `check_watchlist_match()`.
- Revoke `EXECUTE` on `rls_auto_enable()` from `anon`/`authenticated`.

**Storage fix — APPLIED to prod 2026-06-17 (Finding 1):**
- App mints signed URLs instead of public URLs: `lib/storage.ts` (`parseStored` / `createSignedUrlFor`) + `components/SignedImage.tsx` (`SignedImage` / `SignedLink` / `useSignedUrl`, 1-hour TTL). All ~10 render sites across userdash, GateChecklist, intel, intel/[id], property converted. Upload code is untouched — stored public-style URLs are treated as locators and re-signed on demand.
- Alert emails (`/api/bolos/notify`, `/api/watchlist/notify`) mint a **30-day** signed URL server-side (`EMAIL_SIGNED_TTL`).
- `migrations/2026-06-15_storage_private_buckets.sql` flipped the 3 buckets to private, dropped the broad public-read + anon-upload policies, and added authenticated-only read. **Run order honored:** code merged + promoted to prod (`bb5ef6f`) first, then the migration — so live images never broke. Post-run advisor re-check: the 3 `public_bucket_allows_listing` warnings are gone.
- Known minor side effect: photo URLs embedded in **CSV/PDF exports** (gate checklist) now point at private objects, so they require an authenticated session to open — acceptable (they were public PII before).

**Deferred (plan-gated, non-code):**
- Leaked-password protection (Finding 4) — **requires a Supabase Pro plan** (not available on Free), so it can't be enabled today. Revisit on upgrade; the advisor's `auth_leaked_password_protection` lint will persist until then.

**Remaining advisor lints (all known/accepted):** 2× benign `SECURITY DEFINER` (`is_admin`, `set_my_assignment` — intentional, see Finding 3) + 1× leaked-password (Pro-gated, above). The storage listing warnings have cleared.
