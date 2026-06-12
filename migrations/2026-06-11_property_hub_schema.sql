-- ============================================================
-- Property Hub — community info, POCs, documents, vehicle registry
-- 2026-06-11
-- ============================================================
-- Backs the new /vms/property hub (renamed from Post Orders). Adds structured
-- location info to communities, a role-typed POC table, a community document
-- store, and the resident/visitor vehicle registry (Item 7).
--
-- RLS: authenticated read on all (officers can view, incl. Vehicles read-only);
-- writes restricted to admins via is_admin(). A dedicated property_manager
-- role is a planned follow-on.
--
-- Already applied to project xmomsoobriehgrnppewa via Supabase MCP
-- (migration name: property_hub_schema). This file is the repo record.
-- ============================================================

alter table public.communities
  add column if not exists address      text,
  add column if not exists phone        text,
  add column if not exists jurisdiction text;

create table if not exists public.community_contacts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  role         text,
  name         text,
  phone        text,
  email        text,
  sort_order   int default 0,
  created_at   timestamptz not null default now()
);
create index if not exists community_contacts_community_idx on public.community_contacts (community_id);

create table if not exists public.community_documents (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title        text,
  doc_type     text,
  file_url     text not null,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
create index if not exists community_documents_community_idx on public.community_documents (community_id);

create table if not exists public.registered_vehicles (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities(id) on delete cascade,
  kind             text not null default 'resident',     -- 'resident' | 'visitor'
  plate            text,
  plate_state      text,
  make             text,
  model            text,
  color            text,
  year             text,
  resident_name    text,
  unit             text,
  permit_number    text,
  sponsor_resident text,
  visitor_pass     text,
  valid_from       date,
  valid_to         date,
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists registered_vehicles_community_idx on public.registered_vehicles (community_id);
create index if not exists registered_vehicles_plate_idx
  on public.registered_vehicles (upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')))
  where plate is not null;

alter table public.community_contacts   enable row level security;
alter table public.community_documents  enable row level security;
alter table public.registered_vehicles  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['community_contacts','community_documents','registered_vehicles'] loop
    execute format('drop policy if exists "auth read %1$s"   on public.%1$s', t);
    execute format('drop policy if exists "admin insert %1$s" on public.%1$s', t);
    execute format('drop policy if exists "admin update %1$s" on public.%1$s', t);
    execute format('drop policy if exists "admin delete %1$s" on public.%1$s', t);
    execute format('create policy "auth read %1$s"   on public.%1$s for select using (auth.role() = ''authenticated'')', t);
    execute format('create policy "admin insert %1$s" on public.%1$s for insert with check (is_admin())', t);
    execute format('create policy "admin update %1$s" on public.%1$s for update using (is_admin())', t);
    execute format('create policy "admin delete %1$s" on public.%1$s for delete using (is_admin())', t);
  end loop;
end $$;

-- Storage bucket for community documents (public read, authenticated upload —
-- mirrors the existing photos / contact-photos buckets).
insert into storage.buckets (id, name, public)
values ('community-docs', 'community-docs', true)
on conflict (id) do nothing;

drop policy if exists "Public can read community docs"     on storage.objects;
drop policy if exists "Authenticated upload community docs" on storage.objects;
create policy "Public can read community docs"
  on storage.objects for select using (bucket_id = 'community-docs');
create policy "Authenticated upload community docs"
  on storage.objects for insert to authenticated with check (bucket_id = 'community-docs');
