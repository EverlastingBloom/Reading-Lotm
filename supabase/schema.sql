-- Run this once in the Supabase SQL editor.
create table if not exists public.chapters (
  id      integer not null,          -- reading order (spine position in the EPUB)
  lang    text    not null,          -- 'en', 'id', ...
  kind    text    not null,          -- 'c' chapter, 'v' volume/part page, 'x' extra
  num     integer,                   -- chapter number, null for non-chapters
  volume  integer not null default 0,
  title   text    not null,
  content text    not null,          -- HTML fragment
  primary key (id, lang)
);

create index if not exists chapters_lang_idx on public.chapters (lang);

alter table public.chapters enable row level security;

-- Anyone can read; only the service_role key (used by tools/upload.mjs) can write.
drop policy if exists "chapters are public" on public.chapters;
create policy "chapters are public" on public.chapters for select using (true);
