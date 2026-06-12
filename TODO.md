# VMS — TODO

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js / TypeScript / Supabase / Vercel
_Last updated: June 11, 2026_

> Shared task list for Claude.ai and Claude Code. Keep this file in the repo root so both environments reference the same source of truth.

---

## Priority / In Progress

_(none open)_

---

## Features

_(all complete — #1, #2, #4 moved to Done)_

---

## Engineering

_(all complete — #11 moved to Done)_

---

## Done

- **2026-06-09 — #11 Login location persistence (verified fixed).** Location persists across pages via the shared `asg-current-community-id` / `asg-current-community-name` localStorage keys: written by `confirm-location`, `/vms`, `/vms/scan`, `/vms/manual` on change; read as the default on load by `/userdash`, `/vms`, `/vms/reports`, `/vms/scan`, `/vms/manual`, `/admin/post-orders`. Resolved by commits `baf8e89` and `2b956df`.
- **2026-06-09 — #1 St Luke Gate Checklist.** New "🚪 Gate Checklist" tab in the User Dashboard (`app/userdash/GateChecklist.tsx`). Location dropdown lists all communities, defaults to St Luke Apartments. Header (date, guard, shift, device, start/end time) + verbatim instructions block. Per-gate cards (gates 1–7) with initials, touch-friendly Yes/No toggles for the three inspections × Vehicle/Pedestrian (Gate Operation, Locks/Secures, Damage Observed), notes, and per-gate photo upload. Footer: additional notes, general photos, supervisor-report notice, typed guard signature with auto date/time. Saves to new `gate_checklists` table (header cols + `gates jsonb` + `general_photo_urls text[]`); photos → `photos` bucket. Includes a saved-records list per location with issue/all-clear badges, expandable detail grid, and admin delete. Each saved record exports as a **PDF report** (print-to-PDF, form-style layout) or **CSV** (one row per gate). RLS mirrors `officer_daily_logs`.
- **2026-06-09 — #4 Add User from Admin Dashboard.** Added `POST /api/admin/users` (service-role, admin-gated) using `supabase.auth.admin.createUser()` with `email_confirm: true`, optional community assignment (`user_assignments`) and optional admin grant (`admin_users`). Added an "+ Add User" button + inline form on the `/admin/system` Users tab (email, temp password, full name, location, grant-admin checkbox) that creates the user and refreshes the list.
- **2026-06-09 — #2 Watchlist ban-sheet upload box.** Added a "Ban Sheet — file or photo" upload box to the Add-to-Watchlist form on `/userdash`, alongside the existing person-photo box. Accepts images **and** PDF, multiple files (multi-page ban sheets), with thumbnail previews for images / filename chips for documents. Files upload to the `photos` bucket; URLs stored in the new `watchlist.ban_sheet_urls text[]` column. Each entry card shows ban-sheet thumbnails (images) and "📄 Page N" links (docs).
- **2026-06-11 — #13 User Dashboard routing bug (closed).** Two parts. (1) Sign-on: `app/confirm-location/page.tsx` originally routed `adminRow ? "/userdash" : "/vms"`, dumping non-admins on Check-In; the June 9 pass removed the role query. (2) Surviving half: the `proxy.ts` `/admin/*` gate still redirected rejected non-admins to `/vms` (Check-In) — the only remaining non-admin→`/vms` path in the repo. Per request, **sign-on and the admin-gate fallback now both land everyone on Home (`/`)** instead of `/userdash`: `confirm-location` → `router.replace("/")`, `proxy.ts` → `redirect("/")`; login comment updated. Typecheck clean.
- **2026-06-09 — #3 Incident Report new incident types.** Added Shooting, Firearm Violation, Loitering, Fire to the User Dashboard incident-type dropdown. Shooting + Firearm Violation (and Fire) fire a critical supervisor alert via the existing `isHighPriorityIncident()` → `fireAlert()` path (`"shooting"` added to the high-priority list; `"firearm"`/`"fire"` already present). Loitering is intentionally non-alerting.
- **2026-06-09 — #10 Audit Log (verified pre-existing).** `audit_logs` table + `logActivity()` helper already wired across `/admin/system`, `/userdash`, and `/vms/reports`.
- **2026-06-09 — #12 Watchlist photo upload (verified pre-existing).** The Add-to-Watchlist form already uploads a person photo to the `photos` bucket and saves `photo_url` (commit `6409222`).
