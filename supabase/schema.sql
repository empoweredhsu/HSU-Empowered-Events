-- =====================================================================
--  HSU Peradeniya – Events website
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--
--  You can run it in the SAME Supabase project as the resource centre:
--  it reuses the admins table (so the same admin accounts work) and
--  creates its own tables and its own "events" storage bucket.
--  It is safe to run more than once.
-- =====================================================================

create extension if not exists pgcrypto;

-- 1. Admins (shared with the resource centre if you use one project)
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.admins enable row level security;
drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- 2. Events
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  category     text not null default 'Other',  -- Seminar, Workshop, Career guidance, …
  start_date   date not null,
  end_date     date,                       -- optional, for events over several days
  time_text    text,                       -- e.g. 9.00 am – 12.00 pm
  venue        text,
  summary      text,                       -- one or two lines shown in lists
  description  text,
  cover_path   text,                       -- cover photo in the "events" bucket
  register_url text,                       -- e.g. a Google Form
  video_url    text,                       -- a YouTube link
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint events_dates check (end_date is null or end_date >= start_date)
);
create index if not exists events_start_idx on public.events(start_date desc);

-- 3. Event photos
create table if not exists public.event_photos (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  file_path  text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_photos_event_idx on public.event_photos(event_id);

-- 4. Updates (short news posts, optionally about one event)
create table if not exists public.event_updates (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 200),
  body         text,
  is_pinned    boolean not null default false,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists event_updates_created_idx on public.event_updates(created_at desc);

-- 5. Site settings for this website (one row)
create table if not exists public.events_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.events_settings (id) values (1) on conflict (id) do nothing;

-- 6. Row Level Security: everyone reads, only admins write
alter table public.events          enable row level security;
alter table public.event_photos    enable row level security;
alter table public.event_updates   enable row level security;
alter table public.events_settings enable row level security;

drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select using (is_published or public.is_admin());
drop policy if exists "events admin insert" on public.events;
create policy "events admin insert" on public.events for insert to authenticated with check (public.is_admin());
drop policy if exists "events admin update" on public.events;
create policy "events admin update" on public.events for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "events admin delete" on public.events;
create policy "events admin delete" on public.events for delete to authenticated using (public.is_admin());

drop policy if exists "event photos read" on public.event_photos;
create policy "event photos read" on public.event_photos for select using (
  public.is_admin() or exists (select 1 from public.events e where e.id = event_id and e.is_published)
);
drop policy if exists "event photos admin insert" on public.event_photos;
create policy "event photos admin insert" on public.event_photos for insert to authenticated with check (public.is_admin());
drop policy if exists "event photos admin update" on public.event_photos;
create policy "event photos admin update" on public.event_photos for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "event photos admin delete" on public.event_photos;
create policy "event photos admin delete" on public.event_photos for delete to authenticated using (public.is_admin());

drop policy if exists "event updates read" on public.event_updates;
create policy "event updates read" on public.event_updates for select using (is_published or public.is_admin());
drop policy if exists "event updates admin insert" on public.event_updates;
create policy "event updates admin insert" on public.event_updates for insert to authenticated with check (public.is_admin());
drop policy if exists "event updates admin update" on public.event_updates;
create policy "event updates admin update" on public.event_updates for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "event updates admin delete" on public.event_updates;
create policy "event updates admin delete" on public.event_updates for delete to authenticated using (public.is_admin());

drop policy if exists "events settings read" on public.events_settings;
create policy "events settings read" on public.events_settings for select using (true);
drop policy if exists "events settings admin insert" on public.events_settings;
create policy "events settings admin insert" on public.events_settings for insert to authenticated with check (public.is_admin());
drop policy if exists "events settings admin update" on public.events_settings;
create policy "events settings admin update" on public.events_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7. Photo storage bucket
insert into storage.buckets (id, name, public)
values ('events', 'events', true)
on conflict (id) do update set public = true;

drop policy if exists "events files public read" on storage.objects;
create policy "events files public read" on storage.objects for select using (bucket_id = 'events');
drop policy if exists "events files admin upload" on storage.objects;
create policy "events files admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'events' and public.is_admin());
drop policy if exists "events files admin update" on storage.objects;
create policy "events files admin update" on storage.objects for update to authenticated using (bucket_id = 'events' and public.is_admin());
drop policy if exists "events files admin delete" on storage.objects;
create policy "events files admin delete" on storage.objects for delete to authenticated using (bucket_id = 'events' and public.is_admin());

-- =====================================================================
--  NEW Supabase project only: create your admin account
--  1. Authentication → Users → Add user (email + password, auto-confirm)
--  2. Run (with your email):
--     insert into public.admins (user_id)
--     select id from auth.users where email = 'you@example.com';
--  Using the resource centre's project? Skip this: your admins already work.
-- =====================================================================
