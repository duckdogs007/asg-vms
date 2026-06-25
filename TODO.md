# VMS — TODO & Build Tracker

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js · TypeScript · Supabase · Vercel
**Supabase project:** ASG-VMS (`xmomsoobriehgrnppewa`)
**Last updated:** June 24, 2026 (evening)

> Shared task list for Claude.ai ↔ Claude Code. Keep this file in the repo root as the single source of truth. Companion: `CLAUDE_CODE_HANDOFF.md` (sequenced build plan + migration files).

---

## 🔨 Current focus

| # | Item | Notes |
|---|------|-------|
| 31 | Users Online + Chat | presence + real-time messaging under the hamburger menu |

---

## Open items

### Reporting & workflow

#### 29. Remit reports to client via email — review/approval workflow
Reports emailed to the client once reviewed; routing differs by type; send triggered from **View Reports**.

- **Per-type routing (configurable):** Maintenance = direct send on creation; Patrol/Incident = supervisor review before client send.
- **State machine:** draft → submitted → (pending review) → approved → sent. Track who/when at each step.
- **Supervisor can edit during review, with review denoted** ("Reviewed by [name], [date]") carried onto the emailed report. Preserve the officer's original; log edits to `audit_logs`. (Needs supervisor edit rights on others' reports → item 7b.)
- **Recipients:** per-community, role-based from `community_contacts` (maintenance→maintenance POC, incident→management). Allow override/CC.
- Reuse existing email infra (`alerts`, `notification_recipients`); log remittance to `audit_logs`.
- Show remittance status in View Reports.

### Platform & UI

#### 31. 🔨 Users Online + Chat (under the vertical menu)
Presence + real-time messaging, from the hamburger (☰) menu.

- **Presence:** who's online/on-duty via Supabase Realtime presence + existing login tracking (`audit_logs`, On Duty tab).
- **Chat:** real-time messages via a `chat_messages` table + Realtime; RLS-scoped.
- **Decide:** all-users vs. community-scoped; DM vs. team channel vs. both; supervisor broadcast to on-duty.
- **Consider:** retention; whether chats are auditable (security context); unread/notifications; guard-post usability.

### Standalone

#### 34. Guest user access — view-only privileges
Add a guest/read-only role that can view but not create, edit, or delete.

- **Use case:** clients/stakeholders (e.g., Envolve/Ed Smart), auditors, or oversight who need visibility without modifying data.
- **Privileges:** read-only across permitted areas (Reports, Unit History, Property Hub views, dashboards). No report creation/editing, no admin, no violation issuing.
- **Community-scoped:** a guest is tied to specific community/communities and sees only that data.
- **Implementation:** add a `guest`/`viewer` role; enforce read-only via RLS (select-only policies); hide create/edit/delete actions in the UI for guests. Widening `user_assignments.role` (currently null / `admin_super` only) is shared work with item 7b.
- **Decide:** exactly which areas/tabs guests can see; whether guests see PII (names, DOB, plates) or a redacted view; account provisioning.

#### 36. 🔨 Property Maintenance report (Officer Reports) — with remittal
New report type under Officer Reports for property maintenance issues, with client remittal.

- **Maintenance issue types (extensible):** Lights Out, Fence/Gate Damage, Sprinkler Issue, Building Door Issue, and other similar items; include an "Other" + free-text. Make the list configurable (lookup table) so types can be added without code.
- **Fields:** community, structured Building # + Apartment # / common-area (per item 26), issue type, description, photo upload (shared upload component), date/time, reporting officer (default to logged-in user).
- **Remittal (ties to item 29):** Maintenance is a **direct-send-on-creation** type — emailed straight to the maintenance POC (`community_contacts`, maintenance role) without supervisor review. Log remittance to `audit_logs`.
- Flows into Unit History (item 25) when tied to a bldg/unit.

#### 37. 🔨 Post Orders — admin update/edit
Admins need the ability to update/edit Post Orders (Property Hub → Post Orders tab).

- Add edit capability for Post Orders content per community (create / update / save).
- **Access:** admin (and likely property-manager via item 7b) can edit; officers/guests view-only.
- Support formatting and, where relevant, document/photo attachments (reuse shared upload component).
- Log edits to `audit_logs`; consider versioning so prior Post Orders aren't lost on update.

#### 38. 🔨 Watchlist box — hyperlink to Watchlist page (Homepage)
Make the Watchlist box/widget on the Homepage a hyperlink that goes directly to the Watchlist page.

- Link the Homepage Watchlist box to the Watchlist page (whole box clickable, or a clear link).
- Quick navigation win; small UI change.

#### 7b. Property Hub — `property_manager` role (follow-on)
Vehicle registry shipped with writes admin-gated; dedicated PM role was deferred.

- Add a `property_manager` role with write access to Property Hub (Community Info, Documents, Vehicles, Rent Roll).
- Confirm: role flag on existing users vs. new user type. (`user_assignments.role` currently only allows null / `admin_super` — widening it is part of this.)
- **Unlocks:** supervisor edit rights for item 29 and the violation-issue stage for item 24.
- Phased (later): resident self-service portal for vehicle/visitor data.

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

- [x] ~~**29. Remit reports to client via email — review/approval workflow**~~ — `report_queue` table + state machine (pending → needs_revision → pending → sent); officers see live status badge on each report card + resubmit flow when revision requested; supervisors/admins see Review Queue on Reports page (approve & send, or return with notes); approval API sends email to community contacts with fallback to ASG-Supervisors@teamasg.com; all 6 report types enqueued on submit; Recent Submissions cross-community feed added; Supervisor role (separate from Admin) added — approves reports but no Admin portal access; Post Orders bullet-point editing fixed (completed June 24, 2026)
- [x] ~~**32. Property Hub — homepage tab placement**~~ — completed June 24, 2026
- [x] ~~**30. "Latest Developments" / What's New dropdown**~~ — completed June 24, 2026
- [x] ~~**34. Guest user access — view-only privileges**~~ — `guest` role in `user_assignments`; Admin Dashboard Users tab gains Access Level dropdown (Officer / Guest / Admin Super) + independent Community picker; `checkIsGuest()` added to lib/admin.ts; userdash hides all filing tabs/BOLO add/watchlist add/passdown submit/gate check; check-in disables submit; alerts hides Acknowledge (completed June 24, 2026)
- [x] ~~**38. Watchlist box — hyperlink to Watchlist page**~~ — StatCard extended with optional href prop; Watchlist Active card on homepage links to /userdash (completed June 24, 2026)
- [x] ~~**37. Post Orders — admin update/edit**~~ — PostOrdersTab gains isAdmin prop with Edit Post Orders link button; admin/post-orders page adds audit logging on save (completed June 24, 2026)
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
