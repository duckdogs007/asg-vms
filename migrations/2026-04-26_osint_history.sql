-- OSINT search history — every click on an external source from the Intel
-- OSINT tab logs a row here for audit and to populate "recent searches".

create table if not exists osint_search_history (
  id            uuid primary key default gen_random_uuid(),
  user_email    text,
  query         text not null,
  source        text not null,                                  -- e.g. "virginia.arrests.org"
  source_url    text,
  searched_at   timestamptz not null default now(),
  visitor_id    uuid references visitors(id)  on delete set null,
  watchlist_id  uuid references watchlist(id) on delete set null
);

create index if not exists osint_search_history_searched_at_idx on osint_search_history (searched_at desc);
create index if not exists osint_search_history_user_idx        on osint_search_history (user_email);
create index if not exists osint_search_history_query_idx       on osint_search_history (lower(query));

alter table osint_search_history enable row level security;

drop policy if exists "auth read osint"   on osint_search_history;
drop policy if exists "auth insert osint" on osint_search_history;

create policy "auth read osint"   on osint_search_history for select using (auth.role() = 'authenticated');
create policy "auth insert osint" on osint_search_history for insert with check (auth.role() = 'authenticated');
