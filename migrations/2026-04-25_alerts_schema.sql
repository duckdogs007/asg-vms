-- Tier 1 Alerts & Notify schema
-- Run this in Supabase SQL Editor (or via your migration runner).

-- Recipients of alerts. Filter by community where applicable.
create table if not exists notification_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  role        text,                       -- 'admin' | 'supervisor' | 'ops' | etc.
  communities uuid[] default '{}',        -- empty = all
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists notification_recipients_email_unique
  on notification_recipients (lower(email));

-- Audit + escalation log for every alert that's fired.
create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,             -- 'watchlist_hit' | 'incident_high_priority' | 'panic_sos'
  severity     text not null default 'high',
  community_id uuid,
  payload      jsonb not null default '{}'::jsonb,
  recipients   text[] not null default '{}',
  triggered_by text,                      -- email of the user who triggered
  sent_at      timestamptz not null default now(),
  status       text not null default 'sent',  -- 'sent' | 'failed' | 'acked'
  ack_at       timestamptz,
  ack_by       text,
  error        text
);

create index if not exists alerts_sent_at_idx on alerts (sent_at desc);
create index if not exists alerts_type_idx    on alerts (type);
create index if not exists alerts_status_idx  on alerts (status);

-- RLS: only admins can read/manage; the API route uses the service role key
alter table notification_recipients enable row level security;
alter table alerts                  enable row level security;

-- Authenticated users can read alerts (admins only via TopNav UI later)
drop policy if exists "auth read alerts" on alerts;
create policy "auth read alerts"
  on alerts for select using (auth.role() = 'authenticated');

drop policy if exists "auth read recipients" on notification_recipients;
create policy "auth read recipients"
  on notification_recipients for select using (auth.role() = 'authenticated');

-- Seed initial recipient — expand once teamasg.com domain is verified in Resend
insert into notification_recipients (email, name, role)
values ('jhall@teamasg.com', 'John Hall', 'admin')
on conflict do nothing;
