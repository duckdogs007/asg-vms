-- v1 community policies: per-community summary notification settings + a
-- review-first queue for auto-generated monthly summaries.
create table if not exists public.community_settings (
  community_id      uuid primary key references public.communities(id) on delete cascade,
  summary_enabled   boolean not null default false,
  summary_frequency text not null default 'monthly' check (summary_frequency in ('monthly','weekly')),
  summary_send_day  integer not null default 1,
  summary_recipients text[] not null default '{}',
  updated_at        timestamptz not null default now(),
  updated_by        text
);
alter table public.community_settings enable row level security;
create policy "cs_read"  on public.community_settings for select to authenticated using (true);
create policy "cs_write" on public.community_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.summary_review_queue (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  period_from   date not null,
  period_to     date not null,
  summary       jsonb not null,
  meta          jsonb not null,
  total_records integer,
  status        text not null default 'pending' check (status in ('pending','sent','dismissed')),
  recipients    text[] not null default '{}',
  generated_at  timestamptz not null default now(),
  reviewed_by   text,
  reviewed_at   timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (community_id, period_from, period_to)
);
create index if not exists idx_srq_status on public.summary_review_queue(status);
alter table public.summary_review_queue enable row level security;
create policy "srq_read"  on public.summary_review_queue for select to authenticated using (true);
create policy "srq_write" on public.summary_review_queue for all to authenticated using (public.is_admin()) with check (public.is_admin());
