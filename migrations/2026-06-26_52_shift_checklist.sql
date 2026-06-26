-- Item #52 — Daily Log shift-verification checklist
-- Per-community configurable checklist template + answers stored on daily logs.

-- ── 1. Template table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_checklist_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  item_order   int         NOT NULL DEFAULT 0,
  question     text        NOT NULL,
  bad_answer   text        NOT NULL DEFAULT 'no', -- answer that requires explanation
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_shift_checklist_templates" ON public.shift_checklist_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_shift_checklist_templates" ON public.shift_checklist_templates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2. Add answers column to daily logs ──────────────────────
ALTER TABLE public.officer_daily_logs
  ADD COLUMN IF NOT EXISTS shift_checklist jsonb;

COMMENT ON COLUMN public.officer_daily_logs.shift_checklist
  IS 'Array of {question, answer, explanation} from shift_checklist_templates.';

-- ── 3. Seed St Luke items ────────────────────────────────────
INSERT INTO public.shift_checklist_templates (community_id, item_order, question, bad_answer)
SELECT id, 1, 'Was a gate checklist completed during your shift?', 'no'
FROM public.communities WHERE name ILIKE '%st. luke%' OR name ILIKE '%st luke%';

INSERT INTO public.shift_checklist_templates (community_id, item_order, question, bad_answer)
SELECT id, 2, 'Were the site radios received in good condition?', 'no'
FROM public.communities WHERE name ILIKE '%st. luke%' OR name ILIKE '%st luke%';

INSERT INTO public.shift_checklist_templates (community_id, item_order, question, bad_answer)
SELECT id, 3, 'Were the site keys in good condition / accounted for?', 'no'
FROM public.communities WHERE name ILIKE '%st. luke%' OR name ILIKE '%st luke%';
