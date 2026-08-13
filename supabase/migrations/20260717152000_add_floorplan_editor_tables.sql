-- Floorplan editor schema for object-based banquet layout editing.
-- The rendered PNG preview is optional output; source of truth is object data.

create table if not exists public.venue_floorplans (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  space_id uuid references public.venue_spaces(id) on delete set null,
  floorplan_name text not null,
  actual_width numeric,
  actual_height numeric,
  unit text not null default 'm',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_floorplans_target_check
    check (venue_id is not null or space_id is not null),
  constraint venue_floorplans_size_check
    check (
      (actual_width is null or actual_width > 0)
      and (actual_height is null or actual_height > 0)
    )
);

create table if not exists public.venue_floorplan_objects (
  id uuid primary key default gen_random_uuid(),
  floorplan_id uuid not null references public.venue_floorplans(id) on delete cascade,
  object_type text not null,
  label text,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  rotation numeric not null default 0,
  style jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_floorplan_objects_box_check
    check (
      x >= 0 and x <= 1
      and y >= 0 and y <= 1
      and width > 0 and width <= 1
      and height > 0 and height <= 1
    )
);

create table if not exists public.venue_layouts (
  id uuid primary key default gen_random_uuid(),
  floorplan_id uuid not null references public.venue_floorplans(id) on delete cascade,
  preview_file_id uuid references public.files(id) on delete set null,
  venue_layout_image_id uuid references public.venue_layout_images(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  space_id uuid references public.venue_spaces(id) on delete set null,
  layout_name text not null,
  layout_type text not null,
  min_people integer,
  max_people integer,
  setup_capacity integer,
  table_type text,
  table_count integer,
  row_count integer,
  column_count integer,
  seats_per_table integer,
  has_stage boolean not null default false,
  has_buffet boolean not null default false,
  layout_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_layouts_people_check
    check (
      (min_people is null or min_people >= 0)
      and (max_people is null or max_people >= 0)
      and (min_people is null or max_people is null or min_people <= max_people)
    ),
  constraint venue_layouts_numbers_check
    check (
      (setup_capacity is null or setup_capacity >= 0)
      and (table_count is null or table_count >= 0)
      and (row_count is null or row_count >= 0)
      and (column_count is null or column_count >= 0)
      and (seats_per_table is null or seats_per_table >= 0)
    )
);

create table if not exists public.venue_layout_objects (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.venue_layouts(id) on delete cascade,
  object_type text not null,
  label text,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  rotation numeric not null default 0,
  seat_count integer,
  style jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_layout_objects_box_check
    check (
      x >= 0 and x <= 1
      and y >= 0 and y <= 1
      and width > 0 and width <= 1
      and height > 0 and height <= 1
    ),
  constraint venue_layout_objects_seat_check
    check (seat_count is null or seat_count >= 0)
);

create index if not exists venue_floorplans_file_idx
  on public.venue_floorplans (file_id);

create index if not exists venue_floorplans_target_idx
  on public.venue_floorplans (venue_id, space_id, is_active);

create index if not exists venue_floorplan_objects_floorplan_idx
  on public.venue_floorplan_objects (floorplan_id, object_type, is_active);

create index if not exists venue_layouts_floorplan_idx
  on public.venue_layouts (floorplan_id, layout_type, is_active);

create index if not exists venue_layouts_people_idx
  on public.venue_layouts (min_people, max_people);

create index if not exists venue_layout_objects_layout_idx
  on public.venue_layout_objects (layout_id, object_type, is_active);

create or replace function public.update_floorplan_editor_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_venue_floorplans_updated_at on public.venue_floorplans;
create trigger set_venue_floorplans_updated_at
before update on public.venue_floorplans
for each row
execute function public.update_floorplan_editor_updated_at();

drop trigger if exists set_venue_floorplan_objects_updated_at on public.venue_floorplan_objects;
create trigger set_venue_floorplan_objects_updated_at
before update on public.venue_floorplan_objects
for each row
execute function public.update_floorplan_editor_updated_at();

drop trigger if exists set_venue_layouts_updated_at on public.venue_layouts;
create trigger set_venue_layouts_updated_at
before update on public.venue_layouts
for each row
execute function public.update_floorplan_editor_updated_at();

drop trigger if exists set_venue_layout_objects_updated_at on public.venue_layout_objects;
create trigger set_venue_layout_objects_updated_at
before update on public.venue_layout_objects
for each row
execute function public.update_floorplan_editor_updated_at();

alter table public.venue_floorplans enable row level security;
alter table public.venue_floorplan_objects enable row level security;
alter table public.venue_layouts enable row level security;
alter table public.venue_layout_objects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_floorplans'
      and policyname = 'prototype venue_floorplans access'
  ) then
    create policy "prototype venue_floorplans access"
      on public.venue_floorplans
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_floorplan_objects'
      and policyname = 'prototype venue_floorplan_objects access'
  ) then
    create policy "prototype venue_floorplan_objects access"
      on public.venue_floorplan_objects
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_layouts'
      and policyname = 'prototype venue_layouts access'
  ) then
    create policy "prototype venue_layouts access"
      on public.venue_layouts
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_layout_objects'
      and policyname = 'prototype venue_layout_objects access'
  ) then
    create policy "prototype venue_layout_objects access"
      on public.venue_layout_objects
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;
