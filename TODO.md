# VMS — TODO & Build Tracker

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js · TypeScript · Supabase · Vercel
**Supabase project:** ASG-VMS (`xmomsoobriehgrnppewa`)
**Last updated:** June 25, 2026

> Shared task list for Claude.ai ↔ Claude Code. Keep this file in the repo root as the single source of truth. Companion: `CLAUDE_CODE_HANDOFF.md` (sequenced build plan + migration files).

---

## 🔨 Current focus

| # | Item | Notes |
|---|------|-------|
| 19 | Visitor Check-In — DL scanning (handheld wedge scanner) | AAMVA PDF417 parse → auto-fill check-in form |

---

## Open items

#### 39. DAR (Daily Activity Report) — add attachments upload
Add a file/photo attachments upload feature to DAR reports.

- Multi-file upload with thumbnail preview (reuse the shared upload component — items 18, 33, 36).
- Store in Supabase Storage with references on the DAR record.
- (Confirm whether "DAR" is the existing Daily Log or a distinct report type.)

#### 43. Post Orders — configure client report-recipient email(s) per location
In the Post Orders section, set up the customer/location email recipient(s) who reports are delivered to.

- Per-community/location field(s) for the client report-recipient email address.
- **Support multiple recipients** (more than one email) — e.g., primary + CC list.
- Feeds report remittal (item 29, shipped) and Property Maintenance direct-send (item 36, shipped) — this is where remittal looks up "who do reports go to" for a site.
- Likely overlaps with `community_contacts` (role + email) from item 5; decide whether this is a dedicated "report recipients" list vs. reusing contacts flagged as report recipients. Map report type → recipient where relevant (maintenance → maintenance POC, incident → management).
- Admin/property-manager editable (role model); officers/guests view-only.



#### 19. Visitor Check-In — driver's license scanning (handheld wireless)
Scan a DL with a wireless handheld scanner to auto-fill check-in.

- **Scope:** handheld Bluetooth/USB keyboard-wedge scanners only (phone-camera deferred — needs a commercial SDK for reliable PDF417, esp. iOS).
- US licenses carry a PDF417/AAMVA barcode; wedge scanner "types" the decoded string into a focused field — no device integration code.
- Build: scan-target field → parse AAMVA (name/address/DOB/license #/exp) → map onto check-in form.
- **VA compliance:** Va. Code § 59.1-443.3 limits what may be *stored* from a scanned license — confirm before persisting.

---

## Security advisor follow-ups (from June 19 scan)
- Review `EXECUTE` on `is_admin()` and `set_my_assignment()` (callable by anon/authenticated).
- Enable leaked-password protection (Auth settings — one toggle; Pro-gated).
- Re-run the advisor after any new tables/policies.

---

## Done

- [x] ~~**7b. Property Hub — property_manager role enforcement**~~ — `is_guest()`, `is_admin_or_pm()` DB functions; RLS policies across ~20 tables (guests read-only, PMs write Property Hub); `checkCanEditPropertyHub()` in lib/admin.ts; property/page.tsx gated to PM+admin; migration `2026-06-25_7b_role_enforcement.sql` (completed June 25, 2026)
- [x] ~~**43. Post Orders — report delivery recipients**~~ — `report_delivery_recipients` table (community + report_type + email + label); Report Delivery section in /admin/post-orders with per-type recipient lists; approve route checks per-type recipients first, falls back to community_contacts, then supervisor (completed June 25, 2026)
- [x] ~~**39. DAR (Daily Log) — photo attachments**~~ — `photo_urls text[]` column added to officer_daily_logs; photo picker + thumbnail grid in Daily Log form; upload loop with dal_ prefix in saveDailyLog (completed June 25, 2026)

- [x] ~~**40. Reports — pending-approval rows → full report**~~ — 🔍 View link on every queue row; routes to /vms/reports/[type]/[id] detail page (completed June 25, 2026)
- [x] ~~**42. Reports — recent-submissions rows → full report**~~ — View → link on every Recent Submissions row; same detail page (completed June 25, 2026)
- [x] ~~**31. Users Online + Chat**~~ — `chat_messages` table (RLS + Realtime); `/chat` page with Supabase Presence (online users panel) + two channels (🌐 All ASG / 🏢 community); real-time message subscription; unread dot badge in nav + hamburger; Enter to send (completed June 25, 2026)
- [x] ~~**45. Connect asg-psp.com domain**~~ — `asg-psp.com` + `www.asg-psp.com` added to Vercel project (DNS via Vercel nameservers); aliased to production on deploy `dpl_7vbFi5v9dYCAZ2Hp6sVxmN4vd6xd` (completed June 25, 2026)
- [x] ~~**44. Header rename**~~ — "Integrated Property Solutions Platform" → "Property Solutions Platform" across login page, homepage, and layout metadata (completed June 25, 2026)
- [x] ~~**29. Remit reports to client via email — review/approval workflow**~~ — `report_queue` table + state machine (pending → needs_revision → pending → sent); officers see live status badge on each report card + resubmit flow when revision requested; supervisors/admins see Review Queue on Reports page (approve & send, or return with notes); approval API sends email to community contacts with fallback to ASG-Supervisors@teamasg.com; all 6 report types enqueued on submit; Recent Submissions cross-community feed added; Supervisor role (separate from Admin) added — approves reports but no Admin portal access; Post Orders bullet-point editing fixed (completed June 24, 2026)
- [x] ~~**32. Property Hub — homepage tab placement**~~ — completed June 24, 2026
- [x] ~~**30. "Latest Developments" / What's New dropdown**~~ — completed June 24, 2026
- [x] ~~**34. Guest user access — view-only privileges**~~ — `guest` role in `user_assignments`; Admin Dashboard Users tab gains Access Level dropdown (Officer / Guest / Admin Super) + independent Community picker; `checkIsGuest()` added to lib/admin.ts; userdash hides all filing tabs/BOLO add/watchlist add/passdown submit/gate check; check-in disables submit; alerts hides Acknowledge (completed June 24, 2026)
- [x] ~~**38. Watchlist box — hyperlink to Watchlist page**~~ — StatCard extended with optional href prop; Watchlist Active card on homepage links to /userdash (completed June 24, 2026)
- [x] ~~**37. Post Orders — admin update/edit**~~ — PostOrdersTab gains isAdmin prop with Edit Post Orders link button; admin/post-orders page adds audit logging on save (completed June 24, 2026)
- [x] ~~**41. Reports — secondary free-text location box**~~ — temporary / unlisted sites; free-text location field across report types (completed June 24, 2026)
- [x] ~~**36. Property Maintenance report**~~ — new property_maintenance_reports table; 🔧 Maintenance tab in Officer Reports (userdash) with structured location, issue type, description, photos; auto-emails maintenance POC from community_contacts on submit; emerald colour in view reports + dark mode (completed June 24, 2026)
- [x] ~~**35. Reports page — Reports by Community section**~~ — community dropdown (defaults to user's assigned community), 5 report-type summary cards (Incidents, Field Contacts, Vehicle FIs, Parking Violations, Daily Logs) with count queries; each card expands inline detail panel (up to 200 records, on demand) (completed June 24, 2026)
- [x] ~~**33. BOLO — add/edit photo attachments in Edit mode**~~ — multi-photo upload (add new + remove existing in edit mode); `bolos.photo_urls text[]` column; legacy `photo_url` (single) initialised into array for backward compat (completed June 23, 2026)
- [x] ~~**18. Incident Reports + all report types — multi-photo upload**~~ — multi-image upload with thumbnail grid and ✕ per photo; extended to Parking Violations, Vehicle FIs, Field Contacts (all now use `photo_urls text[]`); stored in `contact-photos` bucket (completed June 23, 2026)
- [x] ~~**26. Incident Report — structured Building # + Apartment # fields**~~ — replaced free-text Location/Unit with structured Bldg/Apt + common-area selectors; applied to Field Contact, Vehicle FI, Parking Violation (completed June 19, 2026)
- [x] ~~**27. Preserve tenancy history — rent roll HOH overwrite**~~ — `tenancy_history` table, archive-on-change import, HOH/household snapshot on each record; `move_out`/`lease_to`/status added to residents (completed June 19, 2026)
- [x] ~~**24. Lease violations as a stage of the unified report record**~~ — violation stage on incident record, offender tracking, ban-list cross-check, escalation, distribution tracking; moved into Property Hub; document attachments added (completed June 20, 2026)
- [x] ~~**25. Unit activity history — all activity by Building + Unit**~~ — cross-record unit timeline, linked Reliant/HPD/ASG reference #s, tenancy-change markers, unit timeline view (completed June 20, 2026)
- [x] ~~**28. AI help with report narratives**~~ — Gemini-powered narrative assist on all report types; completeness check; "Was Reliant notified?" check (scoped to St Luke); human-in-the-loop (completed June 20, 2026)
- [x] ~~**13. User Dashboard tab routing bug**~~ — non-admin users now route to User Dashboard correctly (completed June 11, 2026)
- [x] ~~**1. St Luke Gate Checklist**~~ — built per Rev. 05/2024 source: header fields, Gates 1–7 rows, vehicle/pedestrian inspection columns, notes, photo uploads, footer, instructions block (completed June 11, 2026)
- [x] ~~**2. Watchlist — ban sheet upload box**~~ — second upload box (images + PDFs, multi-file) alongside the person photo box (completed June 11, 2026)
- [x] ~~**3. Incident Report — new incident types**~~ — Shooting, Firearm Violation, Loitering, Fire added; auto Supervisor alert on Shooting / Firearm Violation (completed June 11, 2026)
- [x] ~~**4. "Add User" from Admin Dashboard**~~ (completed June 11, 2026)
- [x] ~~**11. User login location not persisting**~~ — login location now persists across pages (completed June 11, 2026)
- [x] ~~**12. Photo upload on "Add to Watchlist" form**~~ — mirrors the Add BOLO page pattern (completed June 11, 2026)
- [x] ~~**5. "Post Order" tab → Property Docs hub**~~ — renamed tab with location dropdown filter, Post Orders + Community Docs sections, structured location data, report auto-remit to POC (completed June 11, 2026)
- [x] ~~**6. Parking Violations report type**~~ — added under Officer Reports with vehicle/plate fields, BOLO/watchlist cross-check, conditional tow company alerting (completed June 11, 2026)
- [x] ~~**7. Property Hub vehicle registry**~~ — `registered_vehicles`; plate→registry lookup in Parking Violations + Vehicle FI; `property_manager` role deferred → item 7b (completed June 11, 2026)
- [x] ~~**10. Audit Log**~~ — `audit_logs` table live; admin Last Login/Logout built on top (completed June 11, 2026)
- [x] ~~**14. Parking Violations — form refinements**~~ — expired tag, "None / Not Displayed" plate dropdown, officer name defaults to logged-in user (completed June 11, 2026)
- [x] ~~**15. Reports tab — vehicle & visitor vehicle database**~~ — by-community view off `registered_vehicles` (completed June 11, 2026)
- [x] ~~**16. Security audit**~~ — RLS, role gating, storage buckets, anon-key exposure, Supabase advisor reviewed (completed June 11, 2026)
- [x] ~~**17. Login screen — remove "Visitor Management System" tagline**~~ (completed June 11, 2026)
- [x] ~~**20. Visitor Check-In — active BOLO ticker**~~ — scrolling active-BOLO ticker above the Henrico PD feed (completed June 11, 2026)
- [x] ~~**21. "Patrol" location for multi-location officers**~~ (completed June 11, 2026)
- [x] ~~**22. Visitor Check-In — "Unit" → "Destination"**~~ — relabeled to support residential units, facility person/dept, and delivery addresses (completed June 11, 2026)
- [x] ~~**23. Reorder tabs — "Property Hub" adjacent to "User Dashboard"**~~ (completed June 11, 2026)
- [x] ~~**8. Multi-location officer assignments**~~ — handled via the "Patrol" designation (item 21) (completed June 11, 2026)
