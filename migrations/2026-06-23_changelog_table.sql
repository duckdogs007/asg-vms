-- changelog: admin-posted entries for the "Latest Developments" in-app feed
CREATE TABLE IF NOT EXISTS changelog (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title        text NOT NULL,
  blurb        text NOT NULL,
  posted_at    timestamptz DEFAULT now() NOT NULL,
  posted_by    text,
  is_published boolean DEFAULT true NOT NULL
);

ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read published changelog"
  ON changelog FOR SELECT TO authenticated
  USING (is_published = true);

-- Seed initial entries for recently shipped features
INSERT INTO changelog (title, blurb, posted_at) VALUES
  ('AI Narrative Assist — all report types',
   'AI now helps draft narratives on Incident, Patrol, Field Contact, Vehicle FI, and Parking Violation reports. Includes a completeness check and Reliant notification confirmation.',
   '2026-06-20 00:00:00+00'),
  ('Lease Violations',
   'Lease violations are now tracked as a stage on the incident record — one event, one record. Supports offender tracking, ban-list cross-check, escalation levels, and document attachments (LVL letter, evidence).',
   '2026-06-20 00:00:00+00'),
  ('Unit Activity History',
   'Every incident, violation, and CFS tied to a Building + Unit now rolls up into a single unit timeline. Linked Reliant / HPD / ASG reference numbers let you trace any incident across all three systems.',
   '2026-06-20 00:00:00+00'),
  ('Structured Location on All Reports',
   'Incident Report, Parking Violation, Vehicle FI, and Field Contact forms now use structured Building # and Apartment # fields (plus a common-area selector) instead of a free-text box.',
   '2026-06-19 00:00:00+00'),
  ('Tenancy History Preserved on Import',
   'The rent-roll import now archives prior tenants into a tenancy_history table instead of overwriting them. HOH and household are snapshotted on each incident and violation record at the time it's created.',
   '2026-06-19 00:00:00+00'),
  ('Driver's License Scanning',
   'Visitor Check-In now supports handheld Bluetooth/USB barcode scanners. Scan the PDF417 barcode on any US driver's license to auto-fill name, DOB, address, and license # — with an instant watchlist/ban-list cross-check.',
   '2026-06-11 00:00:00+00');
