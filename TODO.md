# VMS — TODO

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js / TypeScript / Supabase / Vercel
_Last updated: June 23, 2026_

> Shared task list for Claude.ai and Claude Code. Keep this file in the repo root so both environments reference the same source of truth.

---

## Features

### 29. Remit reports to client via email — with review/approval workflow
Reports get remitted (emailed) to the Client once reviewed. Routing/approval differs by report type, and the send is triggered from the **View Reports** area.

- **Per-type routing rules (configurable):**
  - **Direct send on creation** (no review) — e.g., Maintenance: emailed to the client as soon as it's created.
  - **Supervisor review required before client send** — e.g., Patrol and Incident reports: go to a supervisor, who reviews and approves before they're sent to the client.
  - Make the rule a per-report-type setting (so types can be reclassified without code), with a sensible default.
- **Approval state machine per report:** draft → submitted → (if review required) pending supervisor review → approved → remitted/sent. Track status, who approved, who sent, timestamps. Direct-send types skip straight to sent.
- **Supervisor can edit during review, with review denoted:** the reviewing supervisor may edit the report (not just approve/reject), but the report is stamped to denote supervisor review — e.g., "Reviewed by [Supervisor name], [date/time]" — visible on the report and on the client-remitted version. Implications:
  - Supervisors need edit rights on another officer's report (touches the role model, item 7b).
  - **Preserve the original officer submission** and track supervisor edits in `audit_logs` (who changed what, when) for integrity — important since incident reports may feed legal/eviction matters. Don't silently overwrite the officer's original.
  - The "reviewed by" denotation carries onto the emailed report so the client sees it passed supervisor review.
- **Trigger location:** the **View Reports** area. Review-required reports show a "Submit for review" action; supervisors get an "Approve & send" action; direct-send types show "Send to client" (or auto-send on create).
- **Recipient resolution:** client email(s) per community, role-based per report type — pull from `community_contacts` (e.g., maintenance report → maintenance POC, incident → management). This is the operational realization of item 5's "auto-remit reports to POC." Allow recipient override/CC at send time.
- **Delivery + record:** send the report (PDF/summary) by email; log the remittance to `audit_logs` (who sent, to whom, when) and stamp the report as remitted. Reuse the existing alert/email infrastructure (`alerts`, `notification_recipients`).
- **Status visibility:** show remittance status in View Reports (draft / pending review / approved / sent, with sent-to + timestamp).
- **What's in place:** email infrastructure (Resend), passdown send/edit flow, `community_contacts` for recipient resolution. What's missing: status fields on `incident_reports`, per-type routing rules, supervisor review UI, send trigger in View Reports.
- Cross-refs: item 5 (POC routing), item 28 (completeness checks — done), supervisor alerting already in place.

### 7b. Property Hub — `property_manager` role (follow-on)
The vehicle registry shipped with reads open to authenticated users and writes admin-gated via `is_admin()`. The dedicated property-manager role was explicitly deferred in the PR #6 commit.

- Add a `property_manager` role/user type with write access to the Property Hub (Community Info, Documents, Vehicles, Rent Roll import?)
- Confirm whether property managers are existing VMS users with a role flag, or a new user type (`user_assignments.role` currently only allows null / `admin_super`)
- **Unlocks:** supervisor edit rights for item 29 and the violation-issue stage for item 24
- **Phased (later):** resident portal where residents update/add their own vehicle and visitor data — registry data model already anticipates this

### 30. "Latest Developments" / What's New dropdown
Changelog dropdown in the top bar, under the user-name menu, highlighting newest changes.

- **Placement:** top-right, under/near the user-name dropdown
- **Content:** reverse-chron entries (date, title, one-line blurb); optional "Live now" vs "Coming soon" split
- **Unread indicator:** per-user last-seen; badge clears on open
- **Source:** a `changelog` table (admin-posted) — cleaner than a static list and enables the unread badge
- In-app twin of a staff announcement email


### 32. Property Hub — homepage tab placement
Give Property Hub a direct spot in the main homepage nav.

- Current nav: Home · VMS · Alerts · Property Hub · User Dashboard · Intel Terminal · Reports · Admin Dashboard
- **Possible swap:** replace/relocate the Camera tab — the camera wall is a separate system, not VMS-integrated
- Confirm desired tab order

### 33. BOLO — add/edit photo attachments in Edit mode
BOLO Edit view needs photo add/edit (currently text-only on edit).

- Add new attachment(s); remove/replace existing ones
- Multi-image + thumbnails (reuse the shared upload component)
- Confirm storage + edits persist to the BOLO record's image references

---

## Backlog (later)

### 31. Users Online + Chat (under the vertical menu)
Presence + real-time messaging, from the hamburger (☰) menu.

- **Presence:** who's online/on-duty via Supabase Realtime presence + existing login tracking (`audit_logs`, On Duty tab)
- **Chat:** real-time messages via a `chat_messages` table + Realtime; RLS-scoped
- **Decide:** all-users vs. community-scoped; DM vs. team channel vs. both; supervisor broadcast to on-duty
- **Consider:** retention; whether chats are auditable (security context); unread/notifications; guard-post usability
- Distinct from automated supervisor alerts (event-driven); could surface urgent alerts into chat later

---

## Security advisor follow-ups (from June 19 scan)
- Review `EXECUTE` on `is_admin()` and `set_my_assignment()` (callable by anon/authenticated)
- Enable leaked-password protection (Auth settings — one toggle; Pro-gated)
- Re-run the advisor after any new tables/policies

---

## Done

- [x] ~~**26. Incident Report — structured Building # + Apartment # fields**~~ — replaced free-text Location/Unit with structured Bldg/Apt + common-area selectors; applied to Field Contact, Vehicle FI, Parking Violation (completed June 19, 2026)
- [x] ~~**27. Preserve tenancy history — rent roll HOH overwrite**~~ — `tenancy_history` table, archive-on-change import, HOH/household snapshot on each record; `move_out`/`lease_to`/status added to residents (completed June 19, 2026)
- [x] ~~**24. Lease violations as a stage of the unified report record**~~ — violation stage on incident record, offender tracking, ban-list cross-check, escalation, distribution tracking; moved into Property Hub; document attachments (LVL letter, evidence) added (completed June 20, 2026)
- [x] ~~**25. Unit activity history — all activity by Building + Unit**~~ — cross-record unit timeline, linked Reliant/HPD/ASG reference #s, tenancy-change markers, unit timeline view (completed June 20, 2026)
- [x] ~~**28. AI help with report narratives**~~ — Gemini-powered narrative assist on Incident Report and all other report types; completeness check; "Was Reliant notified?" check with `reliant_notified`/`reliant_notified_at`/`reliant_not_notified_reason` fields (scoped to St Luke); human-in-the-loop review before submit (completed June 20, 2026)
- [x] ~~**18. Incident Reports page — add photo upload field**~~ — multi-image upload with thumbnail preview; stored in `contact-photos` bucket; `photo_urls` column on `incident_reports` (completed June 11, 2026)
- [x] ~~**19. Visitor Check-In — driver's license scanning (handheld wireless)**~~ — full AAMVA/PDF417 parser; keyboard-wedge input; extracts name/DOB/DL#/address; watchlist cross-check with Teams alert on barred person; inline check-in form (completed prior to June 23, 2026)
- [x] ~~**13. User Dashboard tab routing bug**~~ — non-admin users now route to the User Dashboard correctly instead of Visitor Check-In (completed June 11, 2026)
- [x] ~~**1. St Luke Gate Checklist**~~ — built per the Rev. 05/2024 source: header fields, Gates 1–7 rows, vehicle/pedestrian inspection columns, notes, photo uploads, footer, instructions block (completed June 11, 2026)
- [x] ~~**2. Watchlist — ban sheet upload box**~~ — second upload box (images + PDFs, multi-file) alongside the person photo box (completed June 11, 2026)
- [x] ~~**3. Incident Report — new incident types**~~ — Shooting, Firearm Violation, Loitering, Fire added; auto Supervisor alert on Shooting / Firearm Violation (completed June 11, 2026)
- [x] ~~**4. "Add User" from Admin Dashboard — User page**~~ (completed June 11, 2026)
- [x] ~~**11. User login location not persisting**~~ — login location now persists across pages (completed June 11, 2026)
- [x] ~~**12. Photo upload on "Add to Watchlist" form**~~ — mirrors the Add BOLO page pattern (completed June 11, 2026)
- [x] ~~**5. "Post Order" tab → Property Docs hub**~~ — renamed tab with location dropdown filter, Post Orders + Community Docs sections, structured location data (`locations` + `location_contacts`), report auto-remit to POC (completed June 11, 2026)
- [x] ~~**6. Parking Violations report type**~~ — added under Officer Reports with vehicle/plate fields, BOLO/watchlist cross-check, conditional tow company alerting (completed June 11, 2026)
- [x] ~~**7. Property Hub vehicle registry**~~ — `registered_vehicles` (resident/visitor kinds, permits, visitor pass validity); plate→registry lookup wired into Parking Violations + Vehicle FI (authorized resident / visitor / expired / unregistered). Verified via PR #6/#7 deployments + schema. `property_manager` role deferred → item 7b (completed June 11, 2026)
- [x] ~~**10. Audit Log**~~ — `audit_logs` table live with 63 rows; admin Last Login/Logout built on top. Verified via schema + PR #3 (completed June 11, 2026)
- [x] ~~**14. Parking Violations — form refinements**~~ — expired tag on expired registration, "None / Not Displayed" plate dropdown, officer name defaults to logged-in user (completed June 11, 2026)
- [x] ~~**15. Reports tab — vehicle & visitor vehicle database**~~ — by-community view off `registered_vehicles` (completed June 11, 2026)
- [x] ~~**16. Security audit — security parameters across all data**~~ — RLS, role gating, storage buckets, anon-key exposure, Supabase advisor reviewed (completed June 11, 2026)
- [x] ~~**17. Login screen — remove "Visitor Management System" tagline**~~ (completed June 11, 2026)
- [x] ~~**20. Visitor Check-In — active BOLO ticker**~~ — scrolling active-BOLO ticker above the Henrico PD feed (completed June 11, 2026)
- [x] ~~**21. "Patrol" location for multi-location officers**~~ (completed June 11, 2026)
- [x] ~~**22. Visitor Check-In — "Unit" → "Destination"**~~ — relabeled to support residential units, facility person/dept, and delivery addresses (completed June 11, 2026)
- [x] ~~**23. Reorder tabs — "Property Hub" adjacent to "User Dashboard"**~~ (completed June 11, 2026)
- [x] ~~**8. Multi-location officer assignments**~~ — handled via the "Patrol" designation for now (item 21) rather than a full many-to-many model; roving officers operate under Patrol (completed June 11, 2026)
