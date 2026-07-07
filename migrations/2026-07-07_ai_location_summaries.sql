-- Cache for the AI location summary (Report Runner → AI Summary). One row per
-- community + date range; regenerate overwrites it.
create table if not exists public.ai_location_summaries (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  period_from   date not null,
  period_to     date not null,
  summary       jsonb not null,
  meta          jsonb not null,
  total_records integer,
  generated_at  timestamptz not null default now(),
  generated_by  text,
  unique (community_id, period_from, period_to)
);

alter table public.ai_location_summaries enable row level security;

create policy "ai_ls_read"   on public.ai_location_summaries for select to authenticated using (true);
create policy "ai_ls_insert" on public.ai_location_summaries for insert to authenticated with check (true);
create policy "ai_ls_update" on public.ai_location_summaries for update to authenticated using (true) with check (true);
