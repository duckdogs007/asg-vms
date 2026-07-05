-- Add structured persons and vehicles JSONB columns to incident_reports.
-- persons_data: array of {name, role, dob, sex, race, address}
-- vehicles_data: array of {make, model, year, color, plate, plate_state, description}
-- persons_involved (text) is kept for backward compat and populated as a summary string.

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS persons_data  jsonb,
  ADD COLUMN IF NOT EXISTS vehicles_data jsonb;
