# VMS — TODO

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js / TypeScript / Supabase / Vercel
_Last updated: June 9, 2026_

> Shared task list for Claude.ai and Claude Code. Keep this file in the repo root so both environments reference the same source of truth.

---

## Priority / In Progress

_(none open)_

---

## Features

### 1. St Luke Gate Checklist
Build a St Luke–specific Gate Checklist in the VMS, modeled on the "ST LUKE – SECURITY GATE CHECKLIST" (Rev. 05/2024).

- **Header fields:** Date, Guard Name, Shift (Day/Evening/Night), Device Used (issued access device), Start Time, End Time
- **Per-gate rows (Gates 1–7):** Gate Number, Access with Issued Device (initials)
- **Inspection columns**, each split into Vehicle Gate and Pedestrian Gate with Yes/No:
  - Gate Operation – Opens as Intended
  - Locks/Secures as Intended
  - Damage Observed
- **Notes/Action Taken** column (issue description, location details, action taken)
- **Photo attachments:**
  - Per-gate photo upload placeholder (photos of any damage/issue for each gate)
  - General photo upload placeholder in the Additional Notes/Observations section
  - Multiple images per upload, thumbnail preview, optional caption per photo
- **Footer:** Additional Notes/Observations, "Report any issues immediately to supervisor/management," Guard Signature, Date, Time
- **Instructions block** matching the source (access each gate, test operation, confirm open/close, confirm lock mechanism, inspect both vehicle and pedestrian components, annotate issues, report immediately)

### 2. Watchlist — ban sheet upload box
_Done 2026-06-09 — see Done section below._

### 4. "Add User" from Admin Dashboard — User page
_Done 2026-06-09 — see Done section below._

---

## Engineering

### 11. User login location not persisting
Login location does not persist across pages.

- Recent sign-on work (`baf8e89`, `2b956df`) defaults community to the sign-on location; **verify whether this is still reproducible** before changing code.

---

## Done

- **2026-06-09 — #4 Add User from Admin Dashboard.** Added `POST /api/admin/users` (service-role, admin-gated) using `supabase.auth.admin.createUser()` with `email_confirm: true`, optional community assignment (`user_assignments`) and optional admin grant (`admin_users`). Added an "+ Add User" button + inline form on the `/admin/system` Users tab (email, temp password, full name, location, grant-admin checkbox) that creates the user and refreshes the list.
- **2026-06-09 — #2 Watchlist ban-sheet upload box.** Added a "Ban Sheet — file or photo" upload box to the Add-to-Watchlist form on `/userdash`, alongside the existing person-photo box. Accepts images **and** PDF, multiple files (multi-page ban sheets), with thumbnail previews for images / filename chips for documents. Files upload to the `photos` bucket; URLs stored in the new `watchlist.ban_sheet_urls text[]` column. Each entry card shows ban-sheet thumbnails (images) and "📄 Page N" links (docs).
- **2026-06-09 — #13 User Dashboard tab routing bug.** Non-admins were redirected to `/vms` (Check-In) after confirming their post. Root cause: `app/confirm-location/page.tsx` routed `adminRow ? "/userdash" : "/vms"`. Since the User Dashboard is open to all signed-in users (commit `878372e`), changed the redirect to send everyone to `/userdash`; removed the now-unused role query; fixed stale routing comment in `app/login/page.tsx`.
- **2026-06-09 — #3 Incident Report new incident types.** Added Shooting, Firearm Violation, Loitering, Fire to the User Dashboard incident-type dropdown. Shooting + Firearm Violation (and Fire) fire a critical supervisor alert via the existing `isHighPriorityIncident()` → `fireAlert()` path (`"shooting"` added to the high-priority list; `"firearm"`/`"fire"` already present). Loitering is intentionally non-alerting.
- **2026-06-09 — #10 Audit Log (verified pre-existing).** `audit_logs` table + `logActivity()` helper already wired across `/admin/system`, `/userdash`, and `/vms/reports`.
- **2026-06-09 — #12 Watchlist photo upload (verified pre-existing).** The Add-to-Watchlist form already uploads a person photo to the `photos` bucket and saves `photo_url` (commit `6409222`).
