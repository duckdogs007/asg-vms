-- #39: Add photo_urls to officer_daily_logs for DAR attachment upload
ALTER TABLE officer_daily_logs ADD COLUMN IF NOT EXISTS photo_urls text[];
