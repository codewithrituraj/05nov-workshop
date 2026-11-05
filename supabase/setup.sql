-- Run this once in Supabase Dashboard > SQL Editor.
-- Create an Auth user first, then insert that user's id into public.users.

create extension if not exists pgcrypto;

create table if not exists public.users (
  uuid uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'organizer'))
);

create table if not exists public.events (
  event_id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(uuid) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(uuid) on delete cascade,
  event_id uuid not null references public.events(event_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, event_id)
);

create index if not exists events_student_id_idx on public.events(student_id);
create index if not exists registrations_student_id_idx on public.registrations(student_id);
create index if not exists registrations_event_id_idx on public.registrations(event_id);

alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "public can browse events" on public.events;
create policy "public can browse events" on public.events
  for select to anon, authenticated using (true);

drop policy if exists "users can create their own events" on public.events;
create policy "users can create their own events" on public.events
  for insert to authenticated
  with check ((select auth.uid()) = student_id);

drop policy if exists "users can view their own profile" on public.users;
create policy "users can view their own profile" on public.users
  for select to authenticated
  using ((select auth.uid()) = uuid);

drop policy if exists "users can create their own profile" on public.users;
create policy "users can create their own profile" on public.users
  for insert to authenticated
  with check ((select auth.uid()) = uuid);

drop policy if exists "students can view their registrations" on public.registrations;
create policy "students can view their registrations" on public.registrations
  for select to authenticated
  using ((select auth.uid()) = student_id);

drop policy if exists "organizers can view event registrations" on public.registrations;
create policy "organizers can view event registrations" on public.registrations
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.event_id = registrations.event_id
      and e.student_id = (select auth.uid())
  ));

drop policy if exists "students can register themselves" on public.registrations;
create policy "students can register themselves" on public.registrations
  for insert to authenticated
  with check ((select auth.uid()) = student_id);

grant select on public.events to anon, authenticated;
grant select on public.users to authenticated;
grant select, insert on public.registrations to authenticated;
grant insert on public.events to authenticated;
grant insert on public.users to authenticated;
