-- #43: Per-report-type email delivery recipients per community
CREATE TABLE IF NOT EXISTS report_delivery_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  report_type  text NOT NULL,
  email        text NOT NULL,
  label        text,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE report_delivery_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rdr_select" ON report_delivery_recipients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rdr_write" ON report_delivery_recipients
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM user_assignments
      WHERE user_id = auth.uid()
        AND role IN ('admin_super', 'supervisor', 'property_manager')
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
