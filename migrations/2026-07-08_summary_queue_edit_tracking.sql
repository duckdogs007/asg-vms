-- Track manual revisions to a queued summary before it is approved/sent.
alter table public.summary_review_queue
  add column if not exists edited_by text,
  add column if not exists edited_at timestamptz;
