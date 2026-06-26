-- 7b: Role enforcement — guest read-only + property_manager write access
-- Applied: 2026-06-25

-- Helper: is current user a guest (excludes hardcoded admins)?
CREATE OR REPLACE FUNCTION public.is_guest()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_assignments
    WHERE user_id = auth.uid() AND role = 'guest'
  ) AND NOT public.is_admin();
$$;
GRANT EXECUTE ON FUNCTION public.is_guest() TO authenticated;

-- Helper: is current user an admin or property manager?
CREATE OR REPLACE FUNCTION public.is_admin_or_pm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_assignments
      WHERE user_id = auth.uid()
        AND role IN ('admin_super', 'property_manager')
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_pm() TO authenticated;

-- Block guests from submitting reports ----------------------------------------

DROP POLICY IF EXISTS "auth insert incidents" ON public.incident_reports;
CREATE POLICY "auth insert incidents" ON public.incident_reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.incident_reports;
CREATE POLICY "auth update" ON public.incident_reports FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.contact_history;
CREATE POLICY "auth insert" ON public.contact_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.contact_history;
CREATE POLICY "auth update" ON public.contact_history FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.vehicle_fi_logs;
CREATE POLICY "auth insert" ON public.vehicle_fi_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.vehicle_fi_logs;
CREATE POLICY "auth update" ON public.vehicle_fi_logs FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert parking violations" ON public.parking_violations;
CREATE POLICY "auth insert parking violations" ON public.parking_violations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update parking violations" ON public.parking_violations;
CREATE POLICY "auth update parking violations" ON public.parking_violations FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert daily logs" ON public.officer_daily_logs;
CREATE POLICY "auth insert daily logs" ON public.officer_daily_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.officer_daily_logs;
CREATE POLICY "auth update" ON public.officer_daily_logs FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

-- property_maintenance_reports was wide open (USING true)
DROP POLICY IF EXISTS "authenticated insert maintenance" ON public.property_maintenance_reports;
CREATE POLICY "authenticated insert maintenance" ON public.property_maintenance_reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "authenticated update maintenance" ON public.property_maintenance_reports;
CREATE POLICY "authenticated update maintenance" ON public.property_maintenance_reports FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest())
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "authenticated delete maintenance" ON public.property_maintenance_reports;
CREATE POLICY "authenticated delete maintenance" ON public.property_maintenance_reports FOR DELETE
  USING (public.is_admin());

-- Block guests from operational writes ----------------------------------------

DROP POLICY IF EXISTS "auth insert" ON public.passdown_logs;
CREATE POLICY "auth insert" ON public.passdown_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.passdown_logs;
CREATE POLICY "auth update" ON public.passdown_logs FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert gate checklists" ON public.gate_checklists;
CREATE POLICY "auth insert gate checklists" ON public.gate_checklists FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update gate checklists" ON public.gate_checklists;
CREATE POLICY "auth update gate checklists" ON public.gate_checklists FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert alerts" ON public.alerts;
CREATE POLICY "auth insert alerts" ON public.alerts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update alerts" ON public.alerts;
CREATE POLICY "auth update alerts" ON public.alerts FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert visitor_logs" ON public.visitor_logs;
CREATE POLICY "auth insert visitor_logs" ON public.visitor_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update visitor_logs" ON public.visitor_logs;
CREATE POLICY "auth update visitor_logs" ON public.visitor_logs FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.vehicles;
CREATE POLICY "auth insert" ON public.vehicles FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.vehicles;
CREATE POLICY "auth update" ON public.vehicles FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.vehicle_entries;
CREATE POLICY "auth insert" ON public.vehicle_entries FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.vehicle_entries;
CREATE POLICY "auth update" ON public.vehicle_entries FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.bolos;
CREATE POLICY "auth insert" ON public.bolos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.bolos;
CREATE POLICY "auth update" ON public.bolos FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.ban_history;
CREATE POLICY "auth insert" ON public.ban_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.ban_history;
CREATE POLICY "auth update" ON public.ban_history FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.persons;
CREATE POLICY "auth insert" ON public.persons FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.persons;
CREATE POLICY "auth update" ON public.persons FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.person_flags;
CREATE POLICY "auth insert" ON public.person_flags FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.person_flags;
CREATE POLICY "auth update" ON public.person_flags FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

DROP POLICY IF EXISTS "auth insert" ON public.person_notes;
CREATE POLICY "auth insert" ON public.person_notes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND NOT public.is_guest());
DROP POLICY IF EXISTS "auth update" ON public.person_notes;
CREATE POLICY "auth update" ON public.person_notes FOR UPDATE
  USING (auth.role() = 'authenticated' AND NOT public.is_guest());

-- Property Hub: extend writes to property_manager ------------------------------

DROP POLICY IF EXISTS "admin insert registered_vehicles" ON public.registered_vehicles;
DROP POLICY IF EXISTS "admin update registered_vehicles" ON public.registered_vehicles;
DROP POLICY IF EXISTS "admin delete registered_vehicles" ON public.registered_vehicles;
CREATE POLICY "admin_or_pm insert registered_vehicles" ON public.registered_vehicles FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update registered_vehicles" ON public.registered_vehicles FOR UPDATE
  USING (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete registered_vehicles" ON public.registered_vehicles FOR DELETE
  USING (public.is_admin_or_pm());

DROP POLICY IF EXISTS "admin_insert_residents" ON public.residents;
DROP POLICY IF EXISTS "admin_update_residents" ON public.residents;
DROP POLICY IF EXISTS "admin_delete_residents" ON public.residents;
CREATE POLICY "admin_or_pm insert residents" ON public.residents FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update residents" ON public.residents FOR UPDATE
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete residents" ON public.residents FOR DELETE
  USING (public.is_admin_or_pm());

DROP POLICY IF EXISTS "admin_insert_residents_import" ON public.residents_import;
DROP POLICY IF EXISTS "admin_update_residents_import" ON public.residents_import;
DROP POLICY IF EXISTS "admin_delete_residents_import" ON public.residents_import;
CREATE POLICY "admin_or_pm insert residents_import" ON public.residents_import FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update residents_import" ON public.residents_import FOR UPDATE
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete residents_import" ON public.residents_import FOR DELETE
  USING (public.is_admin_or_pm());

DROP POLICY IF EXISTS "admin_insert_units" ON public.units;
DROP POLICY IF EXISTS "admin_update_units" ON public.units;
DROP POLICY IF EXISTS "admin_delete_units" ON public.units;
CREATE POLICY "admin_or_pm insert units" ON public.units FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update units" ON public.units FOR UPDATE
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete units" ON public.units FOR DELETE
  USING (public.is_admin_or_pm());

DROP POLICY IF EXISTS "admin insert community_documents" ON public.community_documents;
DROP POLICY IF EXISTS "admin update community_documents" ON public.community_documents;
DROP POLICY IF EXISTS "admin delete community_documents" ON public.community_documents;
CREATE POLICY "admin_or_pm insert community_documents" ON public.community_documents FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update community_documents" ON public.community_documents FOR UPDATE
  USING (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete community_documents" ON public.community_documents FOR DELETE
  USING (public.is_admin_or_pm());

DROP POLICY IF EXISTS "admin insert community_contacts" ON public.community_contacts;
DROP POLICY IF EXISTS "admin update community_contacts" ON public.community_contacts;
DROP POLICY IF EXISTS "admin delete community_contacts" ON public.community_contacts;
CREATE POLICY "admin_or_pm insert community_contacts" ON public.community_contacts FOR INSERT
  WITH CHECK (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm update community_contacts" ON public.community_contacts FOR UPDATE
  USING (public.is_admin_or_pm());
CREATE POLICY "admin_or_pm delete community_contacts" ON public.community_contacts FOR DELETE
  USING (public.is_admin_or_pm());

-- communities UPDATE — PMs can edit info but not create/delete communities
DROP POLICY IF EXISTS "admin_update_communities" ON public.communities;
CREATE POLICY "admin_or_pm update communities" ON public.communities FOR UPDATE
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());

-- Lease Violations (part of Property Hub)
DROP POLICY IF EXISTS "violation_offenders_write" ON public.violation_offenders;
CREATE POLICY "violation_offenders_write" ON public.violation_offenders FOR ALL
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());

DROP POLICY IF EXISTS "violation_types_admin_write" ON public.violation_types;
CREATE POLICY "violation_types_admin_write" ON public.violation_types FOR ALL
  USING (public.is_admin_or_pm()) WITH CHECK (public.is_admin_or_pm());

-- import_rent_roll function updated separately (SECURITY DEFINER, see function def above)
