# VMS — TODO & Build Tracker

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js · TypeScript · Supabase · Vercel
**Supabase project:** ASG-VMS (`xmomsoobriehgrnppewa`)
**Last updated:** June 26, 2026

> Shared task list for Claude.ai ↔ Claude Code. Keep this file in the repo root as the single source of truth. Companion: `CLAUDE_CODE_HANDOFF.md` (sequenced build plan + migration files).

---

## 🔨 Current focus

| # | Item | Notes |
|---|------|-------|
| 46 | Watchlist — confirm app-layer gating | single-add vs CSV import; code audit |

---

## Recently completed (June 26, 2026)

- [x] **#53** — VMS Search: added BOLOs, parking violations, vehicle FI logs, denied entries; plate `90572F` now returns results
- [x] **#47** — Report detail page: "Summary — Highlights / Followup" AI box auto-generates on open (Gemini, `/api/ai/summary`)
- [x] **#49** — Reports page: Gate Checklists + Maintenance added to Recent Submissions, Reports by Community counts + detail rows, and detail page (`/vms/reports/gate-checklist/[id]`)
- [x] **#48** — Homepage tab order rotated: Property Hub now in dashboards row alongside User Dashboard; Alerts + Admin moved to secondary row
- [x] **#19** — DL scanning: full AAMVA record now stored to visitor_logs (middle_name, dob, oln, address, city, state_of_issue, zip, sex, height, eye_color, dl_scanned); migration `2026-06-26_19_dl_scan_fields.sql` applied to prod; visitor_logs UPDATE tightened to admin-only; anon revoked

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



#### 46. Watchlist — confirm app-layer gating: single-add (all but guest) vs. CSV import (admin only)
Single-person add already exists and works → watchlist writes go through a **server route / service-role key that bypasses RLS** (the `is_admin()` INSERT policy isn't the actual gate). So these rules are enforced in **app code**, not the database:

- **Single "add person":** allowed for everyone **except guest**. Confirm the add route/UI excludes guests (since service-role writes skip the RLS guest checks).
- **CSV import (bulk, overwrites everything):** **admin only.** Confirm the import route checks `is_admin()` AND the UI hides the import link for non-admins.
- Context: watchlist RLS shows INSERT/UPDATE/DELETE = `is_admin()`, reads = authenticated — but writes evidently bypass RLS via service role, so RLS is a backstop, not the live gate.
- **Recommendation:** keep DELETE/overwrite admin-only in the app; add explicit admin check on CSV-import endpoint; exclude guest on single-add endpoint.

#### ~~47. Officer reports — "Summary — Highlights / Followup" at top of report~~ ✓ Done June 26
For officer reports (Daily Logs, Incident Reports, etc.), generate a short summary headed **"Summary — Highlights / Followup"** displayed at the **TOP of the report, above the Narrative box**.

- **What it surfaces:** not a recap — flags items needing attention: unresolved issues, safety concerns, required follow-up actions, repeat/pattern flags.
- **Placement:** banner/box at the top of the report, above the Narrative field.
- **Short:** 1–3 sentences or a few bullets; scannable at a glance. Header reads "Summary" — no "AI" prefix.
- **Builds on item 28 (AI narratives, done):** 28 drafts the narrative; this reads the report (narrative + structured fields) and pulls out concern/follow-up highlights.
- **High value on review side:** supervisor sees concern summary first (ties to items 29/40/42 review flow).
- Consider: generate on submit/view; whether stored on record or on demand; PII sent to model.

#### ~~48. Homepage tab order — rotate Property Hub / Alerts / Admin~~ ✓ Done June 26
Reorder the homepage nav tabs. Leading tabs stay as-is; rotate the Alerts ↔ Property Hub ↔ Admin trio:

- **Property Hub** → move to where **Admin Dashboard** currently is.
- **Alerts / Notify** → move to where **Property Hub** currently is.
- **Admin Dashboard** → move to where **Alerts** currently is.
- Confirm against live current order first — recent tab changes (items 23, 32) may have shifted positions.

#### ~~49. Reports page — ensure ALL report types appear and are linkable~~ ✓ Done June 26
Not every report type is surfacing in the Reports views. Known gap: **Gate Checklist logs** don't appear.

- **Audit every report type:** Incident, Daily Log/DAR, Field Contact, Vehicle FI, Parking Violation, Property Maintenance, Gate Checklist, and any others — confirm each shows in both **View Reports** and **Reports-by-location summary**.
- Each report row must be **linkable** to the full report (ties to items 40/42).
- Likely cause: Reports page queries a subset of report tables; needs to include all sources.
- Pairs with item 35 (organize by community).

#### 50. Reports & Analytics — run report summary by customer/location + date range
On the Reports & Analytics page, add a report **runner**: select a customer/location and any date range to produce a summary of all reports for that location/timeframe.

- **Filters:** community/location, date range (any), and report type(s) — all types or a specific one.
- **Example use:** "St Luke · Gate Checklists · this month" → all gate checklist reports for that month.
- **Output:** summary list of matching reports, each linkable (items 40/42); counts/totals by type.
- **Exportable:** printable / PDF / email for client delivery (monthly client packages, e.g., Envolve/St Luke).
- Builds on item 49 (all report types) + item 25 (`unit_activity` union pattern) + item 35 (by community).

#### 51. Unit History — emphasize address + name, make entries linkable, tie into reporting
The Unit History list buries Building #/Unit # in event details. Raise emphasis and make entries drill-through.

- **Emphasis:** make **Building #/Apartment #** and **HOH name** the prominent header of each entry; event type/date become secondary.
- **Linkable:** each entry hyperlinks to the full detail of that event/report (same clickable-row → detail build as items 40/42).
- **Tie into reporting:** from a unit's history, run/filter the report summary for that location (item 50).
- Cross-refs: item 25 (`unit_activity`), items 40/42, item 50.

#### 52. Daily Logs — standard shift-verification items (St Luke; per-community)
St Luke Daily Logs should include standard items on **every** report — Yes/No with required explanation if "No".

- **Items so far (more to come):**
  - Was a gate checklist completed during your shift? — Yes/No (if No, explain)
  - Were the site radios received in good condition? — Yes/No (if No, explain)
  - Were the site keys in good condition / accounted for? — Yes/No (if No, explain)
- **Pattern:** Yes/No toggle + conditional free-text that appears/is required when "No".
- **Per-community / configurable:** St Luke-specific; model as a configurable checklist template per community (lookup/template table so items can be added/edited without code).
- **Reporting:** capture answers as structured fields so a "No" can be surfaced/flagged — fits item 50 and item 47.
- Confirm the full final list of items with the site before building.

#### ~~53. VMS page Search — search ALL entry points (vehicle/plate gap)~~ ✓ Done June 26
The VMS page Search window isn't searching every data source. **Bug:** searching plate `90572F` returns empty even though it's listed on the BOLO page.

- **Audit global search** to cover every place a vehicle/plate (and person) can appear: BOLOs, watchlist, parking violations, vehicle FI logs, visitor check-ins, registered vehicles, denied entries, incident reports.
- **Known gap:** BOLO records aren't included (the `90572F` example).
- Confirm partial/normalized plate matching (case, spaces, O/0) so near-matches still hit.
- Search results must be linkable (ties to items 40/42/49).

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
