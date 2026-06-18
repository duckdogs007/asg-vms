-- Security audit #16 — make PII storage buckets private.
-- Buckets photos / contact-photos / community-docs held publicly-readable PII
-- (watchlist photos, ban sheets, ID/contact photos, community docs). This makes
-- them private and replaces the broad public SELECT with authenticated-only
-- read. App renders now mint short-lived signed URLs (lib/storage.ts +
-- components/SignedImage.tsx); alert emails mint 30-day signed URLs server-side.

-- 1. Flip buckets to private.
update storage.buckets set public = false
where id in ('photos', 'contact-photos', 'community-docs');

-- 2. Drop the broad public SELECT policies (object access + listing for anyone).
drop policy if exists "Public can read photos"          on storage.objects;
drop policy if exists "Public can read contact photos"  on storage.objects;
drop policy if exists "Public can read community docs"   on storage.objects;

-- 3. Drop the anonymous upload policy (roles=public allowed anon writes to photos).
drop policy if exists "Allow uploads" on storage.objects;

-- 4. Authenticated-only read per bucket.
create policy "Authenticated read photos"
  on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "Authenticated read contact photos"
  on storage.objects for select to authenticated using (bucket_id = 'contact-photos');
create policy "Authenticated read community docs"
  on storage.objects for select to authenticated using (bucket_id = 'community-docs');
