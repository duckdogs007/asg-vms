# VMS — Claude Code Handoff / Build Plan

**App:** https://asg-vms.vercel.app/ · **Stack:** Next.js / TypeScript / Supabase / Vercel
**Supabase project:** ASG-VMS (`xmomsoobriehgrnppewa`)
_Prepared June 19, 2026. Pairs with `TODO.md` (full specs) + the two migration files._

This is the execution plan for the open items. `TODO.md` holds the full reasoning for each; this file holds the **order, the files, the app-side work, and how to test**. Schema changes are drafted in SQL; everything marked "(app)" is code work not covered by the migrations.

---

## Golden rules

- **Do not apply migrations directly to production.** Apply to a Supabase **branch**, point a Vercel **preview** deploy at it, exercise it, then merge/promote. Production has 1,284 live residents and 526 ban-list rows.
- **Migrations are additive** — no drops/renames. Safe and idempotent (`IF NOT EXISTS`).
- **Snapshot, don't reference-live.** Records must freeze the HOH/household at creation (see item 27) — never FK to "current occupant."
- **One record per real-world event.** Lease violations are a *stage* on `incident_reports`, not a new table (item 24).
- Log every meaningful action to `audit_logs` via `logActivity()`.
- After applying migrations, re-run the Supabase **security advisor**.

---

## Files in this handoff

| File | Covers | Status |
|---|---|---|
| `TODO.md` | Full specs, all items, Done log | source of truth |
| `migration_items_26_27.sql` | Structured bldg/apt + HOH snapshot + linked ref #s; tenancy history | drafted, NOT applied |
| `migration_items_24_25.sql` | Violation stage + offenders + violation_types; unit_activity view | drafted, NOT applied |
| `CLAUDE_CODE_HANDOFF.md` | This plan | — |

---

## Build order

Foundational schema first (26 → 27), then records/roll-up (24 → 25), then features (28, 29, 19, 18, 7b).
26 and 27 unblock everything else; 24 and 25 are one converged effort on top.

### Phase 1 — Foundation (items 26 + 27)  ⭐ do first

**Schema:** apply `migration_items_26_27.sql` to a branch.
Adds: `residents.move_out/lease_to/is_hoh/status/updated_at`; new `tenancy_history` table (RLS on); structured `building/apartment/common_area/location_type` + HOH snapshot (`hoh_name/hoh_resident_id/household_snapshot`) + linked ref #s (`reliant_case_no/hpd_report_no/asg_report_no`) on `incident_reports`, `parking_violations`, `vehicle_fi_logs`; `resolve_hoh_as_of()` helper.

**App work:**
1. **(app, urgent) HOH snapshot on save** — when any incident/violation/parking/FI record is created, call `resolve_hoh_as_of(community, unit, event_date)` + read the unit roster, and write `hoh_name` / `hoh_resident_id` / `household_snapshot` onto the record. This is the highest-priority code change — until it's live, new records can't be correctly attributed later.
2. **(app) Incident form location control** — replace the free-text "Location / Unit" field with the `location_type` toggle (Residential unit → Building # + Apartment #; Common area → area dropdown: parking lot, main gate, pool, maintenance, security shack, other). Mirror onto Field Contact, Vehicle FI, Parking Violation.
3. **(app) Rent-roll import → archive-on-change** — change the import from overwrite to upsert-with-archival: diff incoming vs. current `residents` per unit; when HOH/household changed, write the prior tenancy (with `move_out`) to `tenancy_history` before updating. Confirm current import behavior first.
4. **(app, later) Extend `resolve_hoh_as_of()`** to also scan `tenancy_history` once archival is producing data (so back-dated records resolve the correct historical HOH).

**Test (Phase 1):**
- Create an incident at Bldg 200 / Apt 1-A → confirm `hoh_name` + `household_snapshot` populate and are frozen.
- Create a common-area incident → no fake unit required.
- Simulate a rent-roll re-import with a changed HOH for one unit → prior tenancy lands in `tenancy_history`; the old incident still shows the OLD HOH.

### Phase 2 — Records + roll-up (items 24 + 25)

**Schema:** apply `migration_items_24_25.sql` to the branch (after Phase 1).
Adds: `violation_types` lookup (seeded); violation-stage columns on `incident_reports` (`lvl_issued`, `violation_category`, `violation_type`, `notice_level`, `distribution_method`, `hoh_ack`, `record_source`, `issued_by`, etc.); `violation_offenders` child table (RLS on, FK to `watchlist`); `match_ban_list()` helper; `unit_activity` roll-up view (security_invoker).

**App work:**
1. **(app) Violation stage UI** on the report record (item 24) — notice level, category (security/community vs. lease-compliance), distribution method, HOH-delivery ack, offenders. Gate issuing to Supervisor/Admin/PM. Officer-filed incident stage stays open to officers.
2. **(app) Ban-list cross-check** — on offender entry, call `match_ban_list(community, first, last)`; store `ban_match` + `ban_watchlist_id`; surface the red flag inline.
3. **(app) Late-rent / management path** — issue a lease-compliance violation with `record_source='management'`, no incident fields. (Auto-flag from rent-roll overdue balances = later phase.)
4. **(app) Linked ref #s UI** — Reliant / HPD / ASG fields on the record + search by any of the three. HPD # editable after creation (police reports lag).
5. **(app) Unit activity view** — read `public.unit_activity` filtered by community + bldg/apt + date range; "Lease Violations" report = `record_type = 'Lease Violation'` filter. Render the per-unit timeline with tenancy markers (from `tenancy_history`).
6. **(app) Reliant email INGEST** — pull Reliant emails (sender `soc@reliantsafe.com`) from **Microsoft 365 / Outlook** (jhall@teamasg.com), parse the subject (`Case: {caseNo} - {community} ({address}): {type}`) for case #/community/location/type, create an `incident_reports` row with `record_source='reliant'` + `reliant_case_no`, attach the case-summary + LVL PDFs. Subject is highly parseable; bldg/apt + HOH are inside the PDFs (parse later / confirm format).
7. **(app) De-dup** — when officer entry and Reliant ingest share a `reliant_case_no` / `hpd_report_no` / `asg_report_no`, merge into one record, don't double-count.

**Test (Phase 2):**
- Issue a lease violation on an incident → appears in `unit_activity` as `Lease Violation`; HOH from snapshot; offender ban-check flags a known ban-list name.
- Late-rent violation with no incident → shows as lease-compliance, no HPD fields.
- Ingest a sample Reliant email → record created with case #, links to same unit; entering the same case # by hand de-dups.
- Pull "everything for Bldg 305" → incidents + violations + parking all returned.

### Phase 3 — Features (independent; any order)

- **Item 28 — AI report narratives (app):** Anthropic API. Input = structured fields + officer raw notes → drafted third-person narrative. Quick actions: tighten / expand / more formal. Completeness check = deterministic field checks (missing apt? HPD # when police on scene?) + the **"Was Reliant notified?"** required Yes/No (No → reason). Back with `reliant_notified` / `reliant_notified_at` / `reliant_not_notified_reason` columns (add to incident_reports). Human-in-the-loop: never auto-submit. Mind PII sent to the model.
- **Item 29 — Remit reports to client (app):** per-report-type routing (Maintenance = direct send on create; Patrol/Incident = supervisor review first). State machine: draft → submitted → pending review → approved → sent. Supervisor can **edit** during review, with a "Reviewed by [name], [date]" stamp that carries onto the emailed report; **preserve the officer's original** + log edits to `audit_logs`. Trigger from **View Reports**. Recipients from `community_contacts` by role (maintenance→maintenance POC, incident→management). Reuse `alerts` / `notification_recipients` email infra. (Needs an `reliant_notified` etc. — independent of 28.)
- **Item 19 — Driver's-license scanning (app):** handheld Bluetooth keyboard-wedge scanner types the PDF417/AAMVA string into a scan-target field; parse to name/address/DOB/license #; map onto check-in form. Confirm VA storage rules (Va. Code § 59.1-443.3) before persisting scanned data — see security review.
- **Item 18 — Incident photo upload (app):** multi-image + thumbnails + optional caption; reuse the gate-checklist / BOLO upload pattern + Supabase Storage. (`incident_reports.photo_urls` array column already exists.)
- **Item 7b — `property_manager` role (app + schema):** add the role; gate Property Hub writes + the violation-issue stage + supervisor report-edit rights (item 29). Confirm: existing users with a role flag vs. new user type. Note: `user_assignments.role` currently only allows null or `admin_super` (CHECK constraint) — widening it is part of this.

---

## Security advisor follow-ups (from June 19 scan — separate from migrations)

- `is_admin()` executable by anon + authenticated via RPC — confirm intended / revoke EXECUTE if not.
- `set_my_assignment()` executable by authenticated — confirm a user can't set assignments for others.
- Leaked-password protection disabled — enable in Auth settings (one toggle).
- Re-run the advisor after applying both migrations (new tables/policies).

---

## Open questions to confirm before/while building

- CFS and ICR exact definitions; does ICR overlap with `incident_reports`? (item 25)
- Reliant email format — consistent template vs. free-form? Determines PDF/bldg-apt parse reliability. (items 25, sample: cases 00212931 / 00213033)
- Existing free-text `incident_reports.location` values — migrate/parse into structured fields, or start fresh? (item 26)
- Does "ID / driver's-license capture" actually work reliably on check-in today? (affects client/staff messaging)
- `property_manager`: role flag on existing users vs. new user type? (item 7b)

---

## Naming note

`incident_reports` now doubles as the unified report/case record (it can hold management-issued late-rent violations that aren't "incidents"). A rename to `reports` / `case_records` was considered and **deliberately deferred** — a live-table rename is riskier than the clarity gain. Treat `incident_reports` as "the report record."
