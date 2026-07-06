-- Who Am I? — database schema for user-created character sets.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to re-run (uses IF NOT EXISTS / idempotent statements).
--
-- Architecture note: all writes go through our Node server using the SECRET
-- key, which bypasses row-level security. RLS below is a defense-in-depth
-- backstop and enables safe *public reads* (e.g. the browse gallery) directly
-- with the publishable key. The client never writes to these tables directly.

-- ---------- tables ----------

create table if not exists public.sets (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 60),
  description  text check (char_length(description) <= 300),
  creator_id   uuid references auth.users(id) on delete set null,
  creator_name text,
  cover_image  text,                                  -- storage path of a representative image
  is_public    boolean not null default false,
  status       text not null default 'active' check (status in ('active','hidden','removed')),
  play_count   integer not null default 0,
  like_count   integer not null default 0,
  item_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.set_items (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.sets(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  aliases     text[] not null default '{}',
  image_path  text,                                   -- storage object path (nullable → avatar)
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists set_items_set_id_idx on public.set_items(set_id);

create table if not exists public.likes (
  set_id     uuid not null references public.sets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (set_id, user_id)
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.sets(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason      text check (char_length(reason) <= 500),
  created_at  timestamptz not null default now()
);

-- Popularity: public, active sets ordered by plays then likes.
create index if not exists sets_popular_idx
  on public.sets(play_count desc, like_count desc)
  where is_public and status = 'active';

-- ---------- row-level security ----------

alter table public.sets      enable row level security;
alter table public.set_items enable row level security;
alter table public.likes     enable row level security;
alter table public.reports   enable row level security;

-- Public can READ public, active sets (for the browse gallery).
drop policy if exists "public read public sets" on public.sets;
create policy "public read public sets" on public.sets
  for select using (is_public and status = 'active');

drop policy if exists "public read items of public sets" on public.set_items;
create policy "public read items of public sets" on public.set_items
  for select using (
    exists (
      select 1 from public.sets s
      where s.id = set_items.set_id and s.is_public and s.status = 'active'
    )
  );

-- No client-side write policies: inserts/updates/deletes happen server-side with
-- the secret key. Likes/reports have no public read/write policies for the same
-- reason (managed via the API).

-- ---------- storage bucket for uploaded images ----------

insert into storage.buckets (id, name, public)
values ('character-images', 'character-images', true)
on conflict (id) do nothing;

-- Public read of images (so <img> can load them). Uploads happen server-side
-- with the secret key, so no public insert policy is needed.
drop policy if exists "public read character images" on storage.objects;
create policy "public read character images" on storage.objects
  for select using (bucket_id = 'character-images');
