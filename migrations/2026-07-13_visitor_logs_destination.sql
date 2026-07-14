-- Add optional destination field to visitor_logs (item: free-text destination on DL scan).
alter table public.visitor_logs
  add column if not exists destination text;
