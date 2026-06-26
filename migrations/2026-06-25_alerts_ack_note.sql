-- Add ack_note to alerts so officers can leave a brief acknowledgement note
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS ack_note text;
