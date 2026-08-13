-- Common file metadata and venue layout image catalog.
-- This migration keeps existing Storage buckets intact and adds DB metadata
-- that can connect files to venues, venue_spaces, assets, documents, AI knowledge,
-- interviews, and future hotel ERP entities.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-layouts',
  'venue-layouts',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  storage_path text not null,
  public_url text,
  original_filename text not null,
  file_type text not null default 'file',
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  description text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_file_type_check
    check (file_type in ('image', 'pdf', 'document', 'text', 'file')),
  constraint files_file_size_check
    check (file_size is null or file_size >= 0),
  constraint files_dimensions_check
    check (
      (width is null or width > 0)
      and (height is null or height > 0)
    ),
  constraint files_bucket_storage_path_key
    unique (bucket, storage_path)
);

create table if not exists public.file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  link_type text not null default 'attachment',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint file_links_unique_link
    unique (file_id, entity_type, entity_id, link_type)
);

create table if not exists public.venue_layout_images (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  space_id uuid references public.venue_spaces(id) on delete set null,
  layout_type text not null,
  min_people integer,
  max_people integer,
  table_type text,
  table_count integer,
  has_stage boolean not null default false,
  has_buffet boolean not null default false,
  has_screen boolean not null default false,
  has_podium boolean not null default false,
  has_registration_table boolean not null default false,
  buffet_position text,
  stage_position text,
  layout_notes text,
  source_type text,
  source_id uuid,
  is_verified boolean not null default false,
  verified_by text,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_layout_images_target_check
    check (venue_id is not null or space_id is not null),
  constraint venue_layout_images_people_check
    check (
      (min_people is null or min_people >= 0)
      and (max_people is null or max_people >= 0)
      and (
        min_people is null
        or max_people is null
        or min_people <= max_people
      )
    ),
  constraint venue_layout_images_table_count_check
    check (table_count is null or table_count >= 0)
);

create index if not exists files_bucket_storage_path_idx
  on public.files (bucket, storage_path);

create index if not exists files_file_type_idx
  on public.files (file_type);

create index if not exists file_links_entity_idx
  on public.file_links (entity_type, entity_id, link_type);

create index if not exists file_links_file_id_idx
  on public.file_links (file_id);

create index if not exists venue_layout_images_venue_idx
  on public.venue_layout_images (venue_id, layout_type, is_active);

create index if not exists venue_layout_images_space_idx
  on public.venue_layout_images (space_id, layout_type, is_active);

create index if not exists venue_layout_images_people_idx
  on public.venue_layout_images (min_people, max_people);

create or replace function public.update_common_file_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_files_updated_at on public.files;
create trigger set_files_updated_at
before update on public.files
for each row
execute function public.update_common_file_updated_at();

drop trigger if exists set_venue_layout_images_updated_at on public.venue_layout_images;
create trigger set_venue_layout_images_updated_at
before update on public.venue_layout_images
for each row
execute function public.update_common_file_updated_at();

alter table public.files enable row level security;
alter table public.file_links enable row level security;
alter table public.venue_layout_images enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'files'
      and policyname = 'prototype files access'
  ) then
    create policy "prototype files access"
      on public.files
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_links'
      and policyname = 'prototype file_links access'
  ) then
    create policy "prototype file_links access"
      on public.file_links
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_layout_images'
      and policyname = 'prototype venue_layout_images access'
  ) then
    create policy "prototype venue_layout_images access"
      on public.venue_layout_images
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'prototype venue layout file insert'
  ) then
    create policy "prototype venue layout file insert"
      on storage.objects
      for insert
      to anon
      with check (bucket_id = 'venue-layouts');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'prototype venue layout file read'
  ) then
    create policy "prototype venue layout file read"
      on storage.objects
      for select
      to anon
      using (bucket_id = 'venue-layouts');
  end if;
end $$;
