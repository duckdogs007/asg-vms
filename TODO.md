# VMS — TODO

**App:** https://asg-vms.vercel.app/
**Stack:** Next.js / TypeScript / Supabase / Vercel
_Last updated: June 19, 2026_

> Shared task list for Claude.ai and Claude Code. Keep this file in the repo root so both environments reference the same source of truth.
>
> **Build order / handoff:** see `CLAUDE_CODE_HANDOFF.md` for the sequenced build plan and the two migration files (`migration_items_26_27.sql`, `migration_items_24_25.sql`). Foundational order: **26 → 27 → 24 → 25**, then features (**28, 29, 19, 18, 7b**). Test on a Supabase branch + Vercel preview before touching production.

---

## Features

> **Foundation note:** the location backbone (`communities` + `community_contacts`) is in place from the Property Hub work. Items below should hang off this existing model. 

### 24. ⭐ PRIORITY — Lease violations as a stage of the unified report record
**Decision:** lease violations are NOT a separate standalone table. A lease violation is a **post-incident outcome stage on the same report record** as the incident it came from. One real-world event = one record. The LVL (lease violation letter) generally comes *after* the incident — sequence is: incident occurs → ASG and/or HPD report → Reliant case findings → lease violation issued onto that same record.

- **Unified record lifecycle (one record evolves through stages):**
  1. **Incident logged** — type (altercation, shooting, fire, noise, trash, etc.), narrative, bldg/apt, officer, photos, linked reference #s (Reliant / HPD / ASG — see item 25)
  2. **Findings** — Reliant case findings / investigation outcome attached
  3. **Lease violation issued (optional stage)** — when the incident results in an LVL, the violation fields are populated on the *same* record, not a new one
- **Handles all the real origins:**
  - Incident with no violation (e.g., altercation, police only) → violation stage stays empty
  - Incident that becomes a violation (e.g., the altercation IS the lease violation) → one record, violation stage filled post-incident
  - Standalone community violation with no incident (e.g., trash, noise) → record starts at the violation stage; incident/HPD fields just stay empty
  - **Management-initiated, non-incident (e.g., late rent)** → issued by Property Management, no incident/HPD/Reliant at all. A lease-compliance/financial violation tied directly to the rent roll. May be flagged from rent-roll data (overdue balance) rather than an officer report. Distinguish violation *category* (security/community vs. lease-compliance/financial) so late-rent and altercation don't sit in the same bucket even though both are "lease violations."
- **Lease-violation stage fields (shown when an LVL is issued):**
  - **Responsible party = HOH:** addressed to the unit's primary Head of Household — responsible for dependents/guests. Pull HOH + unit from the community's Rent Roll (don't free-type); foreign-key to the rent-roll record.
  - **Offender info:** the individual who actually committed it, separate from the HOH — name, relationship to household (HOH / dependent / guest / other-unknown), optional description, allow multiple. Drives the ban-list cross-check.
  - **Escalation:** 1st → 2nd → final notice → fine/lease action; repeat-offense history per unit.
  - **Distribution:** posted on door / mailed / emailed / handed to resident, with HOH-delivery acknowledgment (mirrors Reliant's warning-vs-LVL-delivered tracking).
  - **Date posted/distributed** as the violation-stage date.
  - **Configurable/extensible violation type list** + free-text description.
- **Ban list linkage:** reuse the **existing ban list on file** (don't build a new list). When an offender named is a dependent/guest, cross-check against the ban list and flag if barred; repeat/severe violations may feed a ban recommendation.
- **Access:** all users can view; only Supervisor / Admin / Property Management can issue the lease-violation stage (officers can file the incident stage). Enforce via RLS, not just UI — ties into item 7b.
- **Reporting:** "Lease Violations" is just a filtered view of records where the violation stage is populated (item 25 reporting). Surfaces in per-community reports, per-unit history, and the Reports tab; all stage changes written to `audit_logs` via `logActivity()`.
- **Where it lives:** entry on the incident/report side (User Dashboard); the violation stage and its reporting surface in the Property Hub + Reports. Reuse the incident-report photo pattern (item 18).

### 25. ⭐ Unit activity history — all activity by Building + Unit (cross-record)
The bigger picture behind item 24: track **all activity associated with a specific Building # + Unit #** in one place — not just lease violations, but incidents, CFS (calls for service), ICRs (incident/case reports), parking violations, BOLO hits, etc. A per-unit "everything that's ever happened here" view, researchable later in reports.

- **Linked reference numbers (tie records together):** a single incident commonly exists in three systems at once, each with its own ID:
  - **Reliant case #** (e.g., 00212931) — from the Reliant report/email
  - **HPD report #** — Henrico Police Department report number (when police respond)
  - **ASG report #** — American Security Group's own internal report number
  These should be captured together on the record and cross-linked, so any one number lets you pull the same incident across all three systems. Useful for reconciliation (e.g., Envolve asking for the security report behind a Reliant case) and for de-duping when the same incident arrives from multiple sources (officer entry + Reliant ingestion). Make each searchable; show all three on the record and in reporting.
- **Concept:** the unit is the join key. Any record type that can be tied to a unit carries a structured Building # + Apartment # (and community), so all of it rolls up into a single unit timeline.
- **Unit is permanent, HOH is time-bound (tenancy history):** the activity log belongs to the physical bldg/unit and persists across tenant turnover. The HOH/occupant changes over time (move-in → eviction/move-out → new HOH move-in), so:
  - **Attribute each record to the HOH *at the time of the event*, not the current HOH.** A violation from a prior tenant must stay attributed to that prior tenant after they're evicted — it must NOT transfer to the new HOH. Implement by snapshotting the HOH on the record (and/or FK to a time-bounded tenancy record), not a bare FK to "current occupant."
  - **Rent roll must track tenancy periods**, not just the current occupant: HOH name + move-in date + move-out/eviction date per unit. This is what makes correct historical attribution possible.
  - **Show tenancy changes in the rolling log:** when a unit turns over, the timeline displays a marker — e.g., "Evicted: [prior HOH]" and "New HOH move-in: [name], [date]" — so it's clear which activity belongs to which tenancy.
  - **New HOH move-in date** surfaces in the unit log as an event.
- **Bldg/unit # is canonical from the rent roll:** the building/apartment identifiers (and the schema/table layout for units) should correspond to the rent roll's structure exactly, so incident/violation unit fields line up with rent-roll units 1:1.
- **Record types to aggregate (confirm full list):**
  - Lease violations (item 24)
  - Incident reports (incl. new types — shooting, firearm, loitering, fire)
  - CFS — calls for service _(confirm exact definition / source)_
  - ICRs — incident/case reports _(confirm exact definition; may overlap with incident reports)_
  - Parking violations (item 6)
  - BOLO / ban-list hits associated with the unit
- **Prerequisite — standardize unit tagging:** every relevant record type needs consistent, structured Building # + Unit # fields (aligned to the rent roll's unit identifiers) so records are joinable. Likely means adding/normalizing unit fields on existing tables (incidents, parking, etc.), not just new ones.
- **Ingest Reliant email reports (key source):** Reliant already produces email reports that reliably track building/apartment numbers — these should flow into the unit activity history automatically rather than being re-keyed.
  - Pipeline: ingest the Reliant emails → parse each report → extract bldg/apt (+ date, type, narrative) → match to the unit → create/attach an activity record on that unit's timeline.
  - Likely brings in incidents / CFS / ICRs that originate in Reliant.
  - Implementation options: pull via the connected Gmail (filter to Reliant sender/subject), or a forwarding address / inbound-email webhook that the VMS parses. Decide parse strategy (structured fields vs. free-text extraction) based on Reliant's email format.
  - Keep a source tag on ingested records (e.g., `source = reliant`) and link back to the original email for audit.
  - **Confirm:** what Reliant is, which report types it emails, and the email format/structure (consistent template vs. free-form) — this determines how reliably bldg/apt can be parsed.
- **Unit timeline view:** chronological feed for a selected unit showing every record type with type badges, date, who logged it, and a link to the source record.
- **Reporting:** researchable by Building + Unit, by community, by record type, and by date range. "Pull everything for Bldg 200 Apt 1-A" should return the full cross-record history.
- **Audit trail:** all of it feeds `audit_logs` (item 10, done) so activity history and audit log reinforce each other.
- **Access:** all can view unit history; creating records follows each record type's own posting rules (e.g., lease violations = supervisor/admin/PM only per item 24).
- Cross-refs: item 24 (lease violations) is the first feed and the model for unit/rent-roll linkage; depends on the `communities` + rent-roll backbone already in place.

### 26. ⭐ Incident Report — structured Building # + Apartment # fields (foundational)
**Concrete confirmation of item 25's prerequisite, seen on the live form.** The current Incident Report (User Dashboard → Officer Reports → Incident Report) has a single free-text **"Location / Unit"** field (placeholder "e.g. Unit 204, Parking Lot"). Free-text can't be filtered/joined/rolled up by unit, which breaks the unit-activity-history model.

- **Replace the free-text Location/Unit field with structured fields:** Building # and Apartment/Unit # as separate, discrete fields.
- **Handle non-unit locations too:** many incidents aren't at a unit (main gate, parking lot, pool, maintenance area, security shack). Add a location-type/area option (or "common area" selector) alongside Bldg/Apt so a parking-lot incident isn't forced into a fake unit. Same generalization issue as item 22 (Unit→Destination).
- **Align to the rent roll's unit identifiers** so incident bldg/apt values match the rent roll exactly (enables HOH lookup + unit history).
- **Apply the same structured bldg/apt to the other Officer Report types** that can be unit-located (Field Contact, Vehicle FI, Parking Violation) so everything joins on the same key.
- **Foundational / do early:** this is the prerequisite that makes items 24 and 25 work; cheap to change now, expensive to backfill later. Existing free-text values may need a one-time migration/parse into structured fields.

### 27. ⭐ Preserve tenancy history — the rent roll overwrites HOH on turnover (data-integrity, foundational)
**Key constraint:** the source rent roll has move-in/move-out dates, BUT it **overwrites** the HOH and other lease members when a unit turns over — prior-tenant info is lost on import. The VMS therefore cannot rely on the rent roll to know who the HOH was at a past date. History must be preserved VMS-side. Two defenses, both needed:

1. **Snapshot HOH + household onto each record at creation (primary, bulletproof).** When an incident/violation is logged, store the then-current HOH name and relevant household composition (HOH + others on lease) ON the record itself — frozen. This guarantees correct attribution forever, regardless of what the rent roll does later. A later rent-roll overwrite can never reassign or erase a past record's HOH.
2. **Maintain a VMS-side tenancy-history table (secondary, for occupancy timeline).** On each rent-roll import, detect HOH/household changes for a unit and *archive* the prior tenancy (HOH, members, move-in, move-out/eviction date) into a `tenancy_history` table instead of overwriting and discarding it. Builds a queryable occupancy timeline per unit over time, powering the move-in/eviction markers in the unit log (item 25).

- **Why both:** the snapshot protects individual records even before tenancy history is complete; the tenancy-history table gives the unit timeline its structure and lets new records auto-resolve the correct HOH by date.
- **Capture household, not just HOH:** "others on lease" are overwritten too, and offender relationship (dependent vs. guest) depends on who was on the lease at the time — so snapshot the household roster, not only the HOH name.
- **Import logic change:** the rent-roll import must shift from overwrite to upsert-with-archival (diff against current, archive prior tenancy on change). Confirm current import behavior and adjust.
- Foundational prerequisite for correct attribution in items 24, 25, 26.
- **Schema verified (June 19) — confirms the gap:**
  - `residents` (live rent roll, 1,284 rows): has `unit_number`, `name`, `relationship`, `move_in`, `lease_from`, `community_id` — but **no `move_out`, no `lease_to`, no status, no versioning**. Structurally can only hold the *current* occupant; cannot represent a past tenancy.
  - `residents_import` (staging, empty): *does* have `move_out` + `lease_to`, but those columns don't exist on live `residents` — so move-out data is dropped on the way in.
  - **No `tenancy_history` table exists.** Nowhere to archive prior tenants → overwrite is currently unavoidable.
  - `incident_reports`: free-text `location` + free-text `persons_involved` + `person_id`; **no HOH/household snapshot** (also confirms item 26 — no structured bldg/apt).
  - `parking_violations`, `vehicle_fi_logs`: free-text `location`, no unit/HOH link.
  - **Precedent to copy:** `ban_history` already shadows the `watchlist` table — replicate that live-table + history-table pattern for tenancy (`residents` + new `tenancy_history`).
  - **Build implications:** (a) add `move_out`/`lease_to`/status to the resident/tenancy model; (b) create `tenancy_history`; (c) change import to archive-on-change instead of overwrite; (d) add HOH/household snapshot columns to record tables (incident_reports etc.).

### 28. AI help with report narratives
AI assist for writing incident/report narratives — help officers turn rough notes into clear, complete, professional write-ups.

- **What it does:**
  - Expand an officer's bullet points / shorthand into a full narrative
  - Clean up grammar, spelling, and tone (professional, factual, third-person)
  - Completeness check: prompt for missing who / what / when / where / action taken before submit
  - **"Was Reliant notified?" check:** prompt the officer to confirm whether the SOC/Reliant was notified of the incident, and if not, capture why. Surfaces as a required confirmation in the completeness check (yes → optionally capture notification time / Reliant case #; no → require a brief reason). Back it with data fields on the record: `reliant_notified` (boolean), `reliant_notified_at` (timestamp, optional), `reliant_not_notified_reason` (text). This documents process compliance at the time of the report rather than reconstructing it later when a client (e.g., Envolve) asks. Ties to the linked Reliant case # (item 25).
  - Optionally draft from the structured fields already on the record (type, bldg/apt, persons involved, action taken) + the officer's raw notes
- **Human-in-the-loop (required):** AI drafts, the officer reviews and edits before submitting. Never auto-submit. These are security records that may feed police/legal/eviction matters — the officer is accountable for the final text. Make the "AI-assisted" nature clear and keep the final wording editable.
- **Quality angle:** directly addresses the report-quality concerns raised by the client (Envolve thread) — narratives that are vague or miss key facts. A completeness prompt nudges officers to capture specifics (who responded, times, PD/FD involvement, unit, parties).
- **Implementation:** Anthropic API (already used in the app). Pass structured fields + raw notes; return a drafted narrative. Consider a "tighten / expand / professional" set of quick actions.
- **Privacy / PII:** narratives contain personal data (names, DOB, addresses, plates). Decide what is sent to the model, note it in the security review (item 16), and avoid storing prompts/outputs beyond what's needed. Keep officers aware that drafts are AI-generated.
- **Scope first:** start with the Incident Report narrative; extend to Daily Log, Field Contact, and lease-violation descriptions once the pattern works.

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
- Cross-refs: item 5 (POC routing), item 28 (completeness checks should pass before a report can be submitted for review/send), supervisor alerting already in place.

### 7b. Property Hub — `property_manager` role (follow-on)
The vehicle registry shipped with reads open to authenticated users and writes admin-gated via `is_admin()`. The dedicated property-manager role was explicitly deferred in the PR #6 commit.

- Add a `property_manager` role/user type with write access to the Property Hub (Community Info, Documents, Vehicles, Rent Roll import?)
- Confirm whether property managers are existing VMS users with a role flag, or a new user type
- **Phased (later):** resident portal where residents update/add their own vehicle and visitor data — registry data model already anticipates this

---

### 18. Incident Reports page — add photo upload field
Add a photos box / insert field to the Incident Reports page so officers can attach photos to an incident.

- Multi-image upload with thumbnail preview (mirror the existing upload patterns — gate checklist photos, watchlist/ban sheet, Add BOLO)
- Store in the appropriate Supabase Storage bucket with references on the incident record
- Optional caption per photo (consistent with the gate checklist photo behavior)

---

### 19. Visitor Check-In — driver's license scanning (handheld wireless)
Let officers scan a driver's license with a wireless handheld scanner to auto-populate the Visitor Check-In form.

- **Scope (for now):** handheld Bluetooth/USB barcode scanners only. Phone-camera scanning deferred — would likely need a commercial SDK (Scandit/Dynamsoft/BlinkID) for reliable PDF417 decoding, especially on iOS.
- **How it works:** US licenses carry a **PDF417 barcode** on the back encoding cardholder data per the AAMVA standard. A keyboard-wedge scanner decodes it and "types" the raw string into the focused field — no device-integration code needed.
- **Build work:**
  - A scan-target field on the check-in page that receives the wedge input
  - Parse the AAMVA string (name, address, DOB, license #, expiration) — use an existing AAMVA/PDF417 npm parser or write one
  - Map parsed fields onto the existing check-in form
  - Pick a recommended scanner model that supports PDF417 + keyboard-wedge (Bluetooth for roving posts)
- **Compliance check (important):** some states restrict what may be *stored* from a scanned license vs. merely displayed. Confirm before persisting any scanned data — overlaps with the security audit (item 16).
- **Later (deferred):** phone-camera scanning as a no-extra-hardware option.

---

## Done

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
