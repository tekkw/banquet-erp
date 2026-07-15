create extension if not exists pgcrypto;

create table if not exists public.event_orders (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  company_name text,
  event_datetime text,
  start_date date,
  end_date date,
  venue text,
  guest_count integer,
  event_type text,
  meal_types text[] not null default '{}',
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

alter table public.event_orders
add column if not exists meal_types text[] not null default '{}';

alter table public.event_orders
add column if not exists start_date date;

alter table public.event_orders
add column if not exists end_date date;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  venue_name text not null,
  venue_code text,
  floor text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_spaces (
  id uuid primary key default gen_random_uuid(),
  space_name text not null,
  space_code text,
  floor text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_space_mappings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  space_id uuid not null references public.venue_spaces(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, space_id)
);

create table if not exists public.venue_aliases (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  alias_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_facilities (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.venue_spaces(id) on delete cascade,
  facility_name text not null,
  facility_type text,
  quantity integer,
  spec text,
  location_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.layout_rules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  space_id uuid references public.venue_spaces(id) on delete cascade,
  layout_type text not null,
  min_people integer,
  max_people integer,
  rule_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (venue_id is not null or space_id is not null)
);

create unique index if not exists venues_venue_name_key
on public.venues (venue_name);

create unique index if not exists venue_spaces_space_name_key
on public.venue_spaces (space_name);

create unique index if not exists venue_aliases_alias_name_lower_key
on public.venue_aliases (lower(alias_name));

create index if not exists venue_space_mappings_venue_id_idx
on public.venue_space_mappings (venue_id);

create index if not exists venue_space_mappings_space_id_idx
on public.venue_space_mappings (space_id);

insert into public.venues (venue_name, venue_code, floor)
values
  ('컨벤션 A홀', 'CONV_A', '3F'),
  ('컨벤션 B홀', 'CONV_B', '3F'),
  ('부라노 I', 'BURANO_1', '3F'),
  ('부라노 II', 'BURANO_2', '3F'),
  ('부라노 III', 'BURANO_3', '3F'),
  ('부라노 I+II', 'BURANO_1_2', '3F'),
  ('부라노 II+III', 'BURANO_2_3', '3F'),
  ('부라노 I+II+III', 'BURANO_1_2_3', '3F'),
  ('카프리 I', 'CAPRI_1', '2F'),
  ('카프리 II', 'CAPRI_2', '2F'),
  ('카프리 III', 'CAPRI_3', '2F'),
  ('카프리 I+II', 'CAPRI_1_2', '2F'),
  ('카프리 II+III', 'CAPRI_2_3', '2F'),
  ('카프리 I+II+III', 'CAPRI_1_2_3', '2F'),
  ('페스타', 'FESTA', '3F'),
  ('올리비아', 'OLIVIA', '2F')
on conflict (venue_name) do update set
  venue_code = excluded.venue_code,
  floor = excluded.floor,
  is_active = true;

insert into public.venue_spaces (space_name, space_code, floor)
values
  ('컨벤션1', 'CONV_1', '3F'),
  ('컨벤션2', 'CONV_2', '3F'),
  ('컨벤션3', 'CONV_3', '3F'),
  ('부라노 I', 'BURANO_1', '3F'),
  ('부라노 II', 'BURANO_2', '3F'),
  ('부라노 III', 'BURANO_3', '3F'),
  ('카프리 I', 'CAPRI_1', '2F'),
  ('카프리 II', 'CAPRI_2', '2F'),
  ('카프리 III', 'CAPRI_3', '2F'),
  ('페스타', 'FESTA', '3F'),
  ('올리비아', 'OLIVIA', '2F')
on conflict (space_name) do update set
  space_code = excluded.space_code,
  floor = excluded.floor,
  is_active = true;

with mapping(venue_name, space_name, sort_order) as (
  values
    ('컨벤션 A홀', '컨벤션1', 1),
    ('컨벤션 A홀', '컨벤션2', 2),
    ('컨벤션 B홀', '컨벤션3', 1),
    ('부라노 I', '부라노 I', 1),
    ('부라노 II', '부라노 II', 1),
    ('부라노 III', '부라노 III', 1),
    ('부라노 I+II', '부라노 I', 1),
    ('부라노 I+II', '부라노 II', 2),
    ('부라노 II+III', '부라노 II', 1),
    ('부라노 II+III', '부라노 III', 2),
    ('부라노 I+II+III', '부라노 I', 1),
    ('부라노 I+II+III', '부라노 II', 2),
    ('부라노 I+II+III', '부라노 III', 3),
    ('카프리 I', '카프리 I', 1),
    ('카프리 II', '카프리 II', 1),
    ('카프리 III', '카프리 III', 1),
    ('카프리 I+II', '카프리 I', 1),
    ('카프리 I+II', '카프리 II', 2),
    ('카프리 II+III', '카프리 II', 1),
    ('카프리 II+III', '카프리 III', 2),
    ('카프리 I+II+III', '카프리 I', 1),
    ('카프리 I+II+III', '카프리 II', 2),
    ('카프리 I+II+III', '카프리 III', 3),
    ('페스타', '페스타', 1),
    ('올리비아', '올리비아', 1)
)
insert into public.venue_space_mappings (venue_id, space_id, sort_order)
select venues.id, spaces.id, mapping.sort_order
from mapping
join public.venues on venues.venue_name = mapping.venue_name
join public.venue_spaces spaces on spaces.space_name = mapping.space_name
on conflict (venue_id, space_id) do update set
  sort_order = excluded.sort_order;

with aliases(alias_name, venue_name) as (
  values
    ('컨벤션 A', '컨벤션 A홀'),
    ('컨벤션A', '컨벤션 A홀'),
    ('컨벤션 A홀', '컨벤션 A홀'),
    ('컨벤션A홀', '컨벤션 A홀'),
    ('컨벤션 B', '컨벤션 B홀'),
    ('컨벤션B', '컨벤션 B홀'),
    ('컨벤션 B홀', '컨벤션 B홀'),
    ('컨벤션B홀', '컨벤션 B홀'),
    ('부라노1', '부라노 I'),
    ('부라노 1', '부라노 I'),
    ('부라노2', '부라노 II'),
    ('부라노 2', '부라노 II'),
    ('부라노3', '부라노 III'),
    ('부라노 3', '부라노 III'),
    ('부라노 1+2', '부라노 I+II'),
    ('부라노1+2', '부라노 I+II'),
    ('부라노 2+3', '부라노 II+III'),
    ('부라노2+3', '부라노 II+III'),
    ('부라노 ALL', '부라노 I+II+III'),
    ('부라노ALL', '부라노 I+II+III'),
    ('카프리1', '카프리 I'),
    ('카프리 1', '카프리 I'),
    ('카프리2', '카프리 II'),
    ('카프리 2', '카프리 II'),
    ('카프리3', '카프리 III'),
    ('카프리 3', '카프리 III'),
    ('카프리 1+2', '카프리 I+II'),
    ('카프리1+2', '카프리 I+II'),
    ('카프리 2+3', '카프리 II+III'),
    ('카프리2+3', '카프리 II+III'),
    ('카프리 ALL', '카프리 I+II+III'),
    ('카프리ALL', '카프리 I+II+III')
)
insert into public.venue_aliases (alias_name, venue_id)
select aliases.alias_name, venues.id
from aliases
join public.venues on venues.venue_name = aliases.venue_name
where not exists (
  select 1
  from public.venue_aliases existing
  where lower(existing.alias_name) = lower(aliases.alias_name)
);

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

create table if not exists public.banquet_recommend_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  keywords jsonb not null default '[]'::jsonb,
  trigger_section jsonb not null default '[]'::jsonb,
  calc_type text not null default 'manual' check (calc_type in ('per_person', 'fixed', 'manual', 'per_table')),
  default_qty numeric,
  multiplier numeric not null default 1,
  components jsonb not null default '{}'::jsonb,
  exclude_venues jsonb not null default '[]'::jsonb,
  recommended_items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.banquet_recommend_items
add column if not exists multiplier numeric not null default 1;

alter table public.banquet_recommend_items
add column if not exists components jsonb not null default '{}'::jsonb;

create index if not exists banquet_recommend_items_active_idx
on public.banquet_recommend_items (is_active);

create unique index if not exists banquet_recommend_items_name_key
on public.banquet_recommend_items (name);

insert into public.banquet_recommend_items
  (name, category, keywords, trigger_section, calc_type, default_qty, exclude_venues, recommended_items, is_active)
values
  ('의사봉', 'meeting', '["의사봉"]', '["layoutEqp", "others"]', 'manual', null, '[]', '[]', true),
  ('이젤', 'signage', '["이젤", "안내문", "포스터"]', '["layoutEqp", "others"]', 'manual', null, '[]', '[]', true),
  ('넘버링 스탠드', 'table', '["넘버링", "테이블번호", "테이블 번호"]', '["layoutEqp", "others"]', 'per_table', null, '[]', '[]', true),
  ('양식기물', 'tableware', '["양식", "양식코스", "western"]', '["schedule", "items", "fnb"]', 'per_person', null, '[]', '["포크", "나이프", "스푼"]', true),
  ('뷔페기물', 'glassware', '["뷔페", "중식뷔페", "석식뷔페", "디너뷔페"]', '["schedule", "items", "fnb"]', 'per_person', null, '["피렌체", "Florence"]', '["고블렛잔", "하이볼잔", "소주잔"]', true)
on conflict (name) do update set
  category = excluded.category,
  keywords = excluded.keywords,
  trigger_section = excluded.trigger_section,
  calc_type = excluded.calc_type,
  default_qty = excluded.default_qty,
  exclude_venues = excluded.exclude_venues,
  recommended_items = excluded.recommended_items,
  is_active = excluded.is_active;

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

drop trigger if exists set_banquet_recommend_items_updated_at on public.banquet_recommend_items;
create trigger set_banquet_recommend_items_updated_at
before update on public.banquet_recommend_items
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_venues_updated_at on public.venues;
create trigger set_venues_updated_at
before update on public.venues
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_venue_spaces_updated_at on public.venue_spaces;
create trigger set_venue_spaces_updated_at
before update on public.venue_spaces
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_venue_aliases_updated_at on public.venue_aliases;
create trigger set_venue_aliases_updated_at
before update on public.venue_aliases
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_venue_facilities_updated_at on public.venue_facilities;
create trigger set_venue_facilities_updated_at
before update on public.venue_facilities
for each row execute function public.set_event_orders_updated_at();

drop trigger if exists set_layout_rules_updated_at on public.layout_rules;
create trigger set_layout_rules_updated_at
before update on public.layout_rules
for each row execute function public.set_event_orders_updated_at();

alter table public.event_orders enable row level security;
alter table public.event_calendar_dates enable row level security;
alter table public.event_schedules enable row level security;
alter table public.event_items enable row level security;
alter table public.event_notes enable row level security;
alter table public.banquet_assets enable row level security;
alter table public.banquet_recommend_items enable row level security;
alter table public.venues enable row level security;
alter table public.venue_spaces enable row level security;
alter table public.venue_space_mappings enable row level security;
alter table public.venue_aliases enable row level security;
alter table public.venue_facilities enable row level security;
alter table public.layout_rules enable row level security;

drop policy if exists "prototype event_orders access" on public.event_orders;
drop policy if exists "prototype event_calendar_dates access" on public.event_calendar_dates;
drop policy if exists "prototype event_schedules access" on public.event_schedules;
drop policy if exists "prototype event_items access" on public.event_items;
drop policy if exists "prototype event_notes access" on public.event_notes;
drop policy if exists "prototype banquet_assets access" on public.banquet_assets;
drop policy if exists "prototype banquet_recommend_items access" on public.banquet_recommend_items;
drop policy if exists "prototype venues access" on public.venues;
drop policy if exists "prototype venue_spaces access" on public.venue_spaces;
drop policy if exists "prototype venue_space_mappings access" on public.venue_space_mappings;
drop policy if exists "prototype venue_aliases access" on public.venue_aliases;
drop policy if exists "prototype venue_facilities access" on public.venue_facilities;
drop policy if exists "prototype layout_rules access" on public.layout_rules;
create policy "prototype event_orders access" on public.event_orders for all to anon using (true) with check (true);
create policy "prototype event_calendar_dates access" on public.event_calendar_dates for all to anon using (true) with check (true);
create policy "prototype event_schedules access" on public.event_schedules for all to anon using (true) with check (true);
create policy "prototype event_items access" on public.event_items for all to anon using (true) with check (true);
create policy "prototype event_notes access" on public.event_notes for all to anon using (true) with check (true);
create policy "prototype banquet_assets access" on public.banquet_assets for all to anon using (true) with check (true);
create policy "prototype banquet_recommend_items access" on public.banquet_recommend_items for all to anon using (true) with check (true);
create policy "prototype venues access" on public.venues for all to anon using (true) with check (true);
create policy "prototype venue_spaces access" on public.venue_spaces for all to anon using (true) with check (true);
create policy "prototype venue_space_mappings access" on public.venue_space_mappings for all to anon using (true) with check (true);
create policy "prototype venue_aliases access" on public.venue_aliases for all to anon using (true) with check (true);
create policy "prototype venue_facilities access" on public.venue_facilities for all to anon using (true) with check (true);
create policy "prototype layout_rules access" on public.layout_rules for all to anon using (true) with check (true);

create unique index if not exists ai_knowledge_unique_interview_fact_idx
on public.ai_knowledge (
  source_interview_id,
  subject,
  predicate,
  coalesce(object_value, '')
);

alter table public.ai_interviews
add column if not exists source_type text;

alter table public.ai_interviews
add column if not exists source_id uuid;

alter table public.ai_interviews
add column if not exists priority text;

alter table public.event_notes
add column if not exists updated_at timestamptz not null default now();

alter table public.event_notes
drop constraint if exists event_notes_note_type_check;

alter table public.event_notes
add constraint event_notes_note_type_check
check (note_type in ('layout_eqp', 'others', 'internal_memo', 'post_event_review'));

create unique index if not exists ai_interviews_post_event_review_once_idx
on public.ai_interviews (source_type, source_id)
where category = 'post_event_review'
  and source_type = 'event_order'
  and source_id is not null;

create unique index if not exists ai_interviews_event_source_question_key
on public.ai_interviews (
  source_type,
  source_id,
  lower(regexp_replace(question, '\s+', '', 'g'))
)
where source_type is not null
  and source_id is not null
  and status in ('pending', 'answered', 'confirmed');

insert into storage.buckets (id, name, public)
values ('event-orders', 'event-orders', true)
on conflict (id) do update set public = true;

drop policy if exists "prototype event-orders uploads" on storage.objects;
drop policy if exists "prototype event-orders reads" on storage.objects;
create policy "prototype event-orders uploads" on storage.objects for insert to anon with check (bucket_id = 'event-orders');
create policy "prototype event-orders reads" on storage.objects for select to anon using (bucket_id = 'event-orders');
