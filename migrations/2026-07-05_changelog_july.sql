-- Changelog entries for July 3–5, 2026 work
INSERT INTO changelog (title, blurb, posted_at) VALUES

  ('Approval stamp on report detail page',
   'Approved & Sent reports now show a green banner with the reviewer name and timestamp. Reports still awaiting approval show a pending indicator. The Recent Submissions list on the Reports page also reflects live approval status.',
   '2026-07-05 09:00:00+00'),

  ('Reviewer actions — Edit, Approve & Send, Return',
   'Supervisors and Admins can now Edit, Approve & Send, or Return a report for revision directly from the report detail page — no need to navigate to the Review Queue first. Edit opens an inline form pre-populated with the current record; Return prompts for revision notes that the submitting officer can see.',
   '2026-07-05 10:00:00+00'),

  ('Passdown logs now open to all users',
   'All authenticated users — including guest-role accounts — can now submit shift passdown notes. Previously only officers could submit them.',
   '2026-07-05 11:00:00+00'),

  ('Report Type filter added to Reports page',
   'A Report Type dropdown has been added to the filter bar on the Reports & Analytics page. Selecting a type filters both the Reports by Community cards and the Recent Submissions list simultaneously.',
   '2026-07-05 12:00:00+00'),

  ('New incident types — Fight / Altercation, Shot Detection Alert, Juvenile Issue',
   'Three new types added to the Incident Report form. Fight / Altercation and Shot Detection Alert are treated as high-priority incidents and trigger an immediate supervisor alert on submission.',
   '2026-07-05 13:00:00+00'),

  ('Incident Report — multi-select incident types',
   'Officers can now check more than one incident type per report — for example, "Juvenile Issue" and "Fight / Altercation" on the same event. All selected types appear on the report and are evaluated for supervisor alerts.',
   '2026-07-05 14:00:00+00'),

  ('Common area locations expanded',
   'Playground, Community Bldg, and Leasing Office are now available in the Common Area location selector on Incident Reports, Field Contacts, Vehicle FIs, and Parking Violations.',
   '2026-07-05 15:00:00+00'),

  ('Structured persons & vehicles on incident reports',
   'The free-text "Persons Involved" field on Incident Reports has been replaced with a structured entry form. Officers tap + Add Person to log each subject with name, role (Suspect / Victim / Witness / etc.), date of birth, sex, race, and address. Vehicles are logged separately with make, model, year, color, plate, and state. Multiple persons and vehicles can be added per report.',
   '2026-07-05 16:00:00+00');
