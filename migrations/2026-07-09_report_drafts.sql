-- Private per-user report drafts (save-for-later). user_id defaults to
-- auth.uid() so RLS with_check always matches; each user sees only their own.
create table if not exists public.report_drafts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  user_email   text,
  report_type  text not null,
  community_id uuid,
  title        text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_report_drafts_user on public.report_drafts(user_id, updated_at desc);

alter table public.report_drafts enable row level security;
create policy "rd_select" on public.report_drafts for select to authenticated using (auth.uid() = user_id);
create policy "rd_insert" on public.report_drafts for insert to authenticated with check (auth.uid() = user_id);
create policy "rd_update" on public.report_drafts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rd_delete" on public.report_drafts for delete to authenticated using (auth.uid() = user_id);
