-- #31 Users Online + Chat: chat_messages table + RLS + Realtime

create table if not exists public.chat_messages (
  id           uuid        primary key default gen_random_uuid(),
  user_email   text        not null,
  user_name    text        not null default '',
  community_id uuid        references public.communities(id) on delete set null,
  message      text        not null check (length(trim(message)) > 0 and length(message) <= 1000),
  created_at   timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "chat_messages_select"
  on public.chat_messages for select
  to authenticated
  using (
    community_id is null
    or community_id in (
      select ua.community_id
      from public.user_assignments ua
      where ua.user_id = auth.uid()
    )
  );

create policy "chat_messages_insert"
  on public.chat_messages for insert
  to authenticated
  with check (user_email = auth.email());

alter publication supabase_realtime add table public.chat_messages;
