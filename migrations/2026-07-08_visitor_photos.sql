-- #58: Visitor photo capture — ID + Live photos, attached to the person.
-- One row per captured photo. Photos follow the person via visitor_id, so a
-- lookup aggregates every photo across visits; visitor_log_id ties a photo to
-- the specific check-in it was taken at (optional).
create table if not exists public.visitor_photos (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     uuid references public.visitors(id)     on delete cascade,
  visitor_log_id uuid references public.visitor_logs(id) on delete set null,
  community_id   uuid references public.communities(id)  on delete set null,
  photo_type     text not null check (photo_type in ('id','live')),
  url            text not null,
  captured_by    text,
  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_visitor_photos_visitor on public.visitor_photos(visitor_id);

alter table public.visitor_photos enable row level security;

-- Reads for any authenticated user; captures by any authenticated non-guest
-- (officers). Deletes admin-only. Mirrors the visitor_logs posture.
create policy "vp_read"   on public.visitor_photos for select to authenticated using (true);
create policy "vp_insert" on public.visitor_photos for insert to authenticated with check (auth.role() = 'authenticated' and not public.is_guest());
create policy "vp_update" on public.visitor_photos for update to authenticated using (auth.role() = 'authenticated' and not public.is_guest()) with check (auth.role() = 'authenticated' and not public.is_guest());
create policy "vp_delete" on public.visitor_photos for delete to authenticated using (public.is_admin());
