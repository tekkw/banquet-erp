create extension if not exists pgcrypto;

create table if not exists public.event_orders (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  company_name text,
  event_datetime text,
  venue text,
  guest_count integer,
  event_type text,
  color text not null default 'green',
  original_filename text,
  storage_path text,
  internal_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_orders
add column if not exists guest_count integer;

alter table public.event_orders
add column if not exists event_type text;

create table if not exists public.event_calendar_dates (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid not null references public.event_orders(id) on delete cascade,
  calendar_date date not null,
  created_at timestamptz not null default now(),
  unique (event_order_id, calendar_date)
);

create table if not exists public.event_schedules (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid not null references public.event_orders(id) on delete cascade,
  schedule_date text,
  schedule_time text,
  content text,
  venue text,
  people integer,
  created_at timestamptz not null default now()
);

create table if not exists public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid not null references public.event_orders(id) on delete cascade,
  item_name text,
  unit_price numeric,
  quantity numeric,
  amount numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.event_notes (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid not null references public.event_orders(id) on delete cascade,
  note_type text not null check (note_type in ('layout_eqp', 'others', 'internal_memo')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.banquet_assets (
  id uuid primary key default gen_random_uuid(),
  asset_name text not null,
  floor text,
  location text,
  quantity integer,
  spec text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.banquet_assets
add column if not exists location text;

alter table public.banquet_assets
add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('asset-images', 'asset-images', true)
on conflict (id) do nothing;

create or replace function public.set_event_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_orders_updated_at on public.event_orders;
create trigger set_event_orders_updated_at
before update on public.event_orders
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_banquet_assets_updated_at on public.banquet_assets;
create trigger set_banquet_assets_updated_at
before update on public.banquet_assets
for each row execute function public.set_event_orders_updated_at();

alter table public.event_orders enable row level security;
alter table public.event_calendar_dates enable row level security;
alter table public.event_schedules enable row level security;
alter table public.event_items enable row level security;
alter table public.event_notes enable row level security;
alter table public.banquet_assets enable row level security;

drop policy if exists "prototype event_orders access" on public.event_orders;
drop policy if exists "prototype event_calendar_dates access" on public.event_calendar_dates;
drop policy if exists "prototype event_schedules access" on public.event_schedules;
drop policy if exists "prototype event_items access" on public.event_items;
drop policy if exists "prototype event_notes access" on public.event_notes;
drop policy if exists "prototype banquet_assets access" on public.banquet_assets;
create policy "prototype event_orders access" on public.event_orders for all to anon using (true) with check (true);
create policy "prototype event_calendar_dates access" on public.event_calendar_dates for all to anon using (true) with check (true);
create policy "prototype event_schedules access" on public.event_schedules for all to anon using (true) with check (true);
create policy "prototype event_items access" on public.event_items for all to anon using (true) with check (true);
create policy "prototype event_notes access" on public.event_notes for all to anon using (true) with check (true);
create policy "prototype banquet_assets access" on public.banquet_assets for all to anon using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('event-orders', 'event-orders', true)
on conflict (id) do update set public = true;

drop policy if exists "prototype event-orders uploads" on storage.objects;
drop policy if exists "prototype event-orders reads" on storage.objects;
create policy "prototype event-orders uploads" on storage.objects for insert to anon with check (bucket_id = 'event-orders');
create policy "prototype event-orders reads" on storage.objects for select to anon using (bucket_id = 'event-orders');
