create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  provider text not null default 'automatic',
  model text,
  pinned boolean not null default false,
  folder_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  custom_instructions text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name),
    email = excluded.email,
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of raw_user_meta_data, email on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.user_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_preferences enable row level security;

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

drop policy if exists "Users manage own profile" on public.user_profiles;
create policy "Users manage own profile" on public.user_profiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Users manage own projects" on public.projects;
create policy "Users manage own projects" on public.projects
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own conversations" on public.conversations;
create policy "Users manage own conversations" on public.conversations
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own messages" on public.messages;
create policy "Users manage own messages" on public.messages
  for all using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  ) with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences" on public.user_preferences
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Public avatar reads" on storage.objects;
create policy "Public avatar reads" on storage.objects
  for select using (bucket_id = 'avatars');
