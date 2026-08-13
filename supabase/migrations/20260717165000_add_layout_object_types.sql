-- Object master library for the floorplan editor.
-- Master records are copied into placed objects at placement time. Updating a
-- master does not rewrite saved layouts.

create table if not exists public.layout_object_types (
  id uuid primary key default gen_random_uuid(),
  object_name text not null,
  category text not null,
  object_type text not null,
  default_width_m numeric,
  default_height_m numeric,
  default_elevation_m numeric,
  default_seat_count integer,
  display_shape text not null default 'rect',
  can_resize boolean not null default true,
  can_rotate boolean not null default true,
  is_active boolean not null default true,
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint layout_object_types_size_check
    check (
      (default_width_m is null or default_width_m > 0)
      and (default_height_m is null or default_height_m > 0)
      and (default_elevation_m is null or default_elevation_m >= 0)
      and (default_seat_count is null or default_seat_count >= 0)
    ),
  constraint layout_object_types_shape_check
    check (display_shape = any (array['rect'::text, 'circle'::text, 'ellipse'::text, 'line'::text, 'area'::text]))
);

create unique index if not exists layout_object_types_name_type_key
  on public.layout_object_types (object_name, object_type);

create index if not exists layout_object_types_category_idx
  on public.layout_object_types (category, is_active, sort_order);

alter table public.venue_floorplan_objects
  add column if not exists object_type_id uuid references public.layout_object_types(id) on delete set null,
  add column if not exists memo text,
  add column if not exists is_locked boolean not null default false;

alter table public.venue_layout_objects
  add column if not exists object_type_id uuid references public.layout_object_types(id) on delete set null,
  add column if not exists memo text,
  add column if not exists is_locked boolean not null default false;

create index if not exists venue_floorplan_objects_type_idx
  on public.venue_floorplan_objects (object_type_id);

create index if not exists venue_layout_objects_type_idx
  on public.venue_layout_objects (object_type_id);

create or replace function public.update_layout_object_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_layout_object_types_updated_at on public.layout_object_types;
create trigger set_layout_object_types_updated_at
before update on public.layout_object_types
for each row
execute function public.update_layout_object_types_updated_at();

alter table public.layout_object_types enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'layout_object_types'
      and policyname = 'prototype layout_object_types access'
  ) then
    create policy "prototype layout_object_types access"
      on public.layout_object_types
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;

insert into public.layout_object_types (
  object_name,
  category,
  object_type,
  default_width_m,
  default_height_m,
  default_elevation_m,
  default_seat_count,
  display_shape,
  can_resize,
  can_rotate,
  is_active,
  memo,
  sort_order
)
values
  ('기둥', '고정 객체', 'pillar', 0.8, 0.8, null, null, 'circle', true, false, true, '기본도면에 연결되는 고정 구조물', 10),
  ('문', '고정 객체', 'door', 1.2, 0.25, null, null, 'rect', true, true, true, '출입 동선 표시', 20),
  ('스크린', '고정 객체', 'screen', 4.0, 0.25, null, null, 'rect', true, true, true, '기본 스크린 위치', 30),
  ('배치 가능 영역', '고정 객체', 'allowed_area', 5.0, 3.0, null, null, 'area', true, true, true, '테이블 배치 가능 구역', 35),
  ('배치 금지 영역', '고정 객체', 'blocked_area', 3.0, 2.0, null, null, 'area', true, true, true, '기둥, 동선, 소방 등 배치 금지 구역', 36),
  ('AV 테이블', '운영 장비', 'av_table', 1.8, 0.6, 0.75, null, 'rect', true, true, true, '콘솔, 음향, 영상 장비 테이블', 40),
  ('세미나 테이블 1800×450', '테이블', 'seminar_table', 1.8, 0.45, 0.75, 2, 'rect', true, true, true, '세미나 기본 장테이블', 50),
  ('세미나 테이블 1600×450', '테이블', 'seminar_table', 1.6, 0.45, 0.75, 2, 'rect', true, true, true, '소형 세미나 장테이블', 60),
  ('라운드 테이블 1800', '테이블', 'round_table', 1.8, 1.8, 0.75, 10, 'circle', true, true, true, '10인 라운드 기준', 70),
  ('라운드 테이블 1600', '테이블', 'round_table', 1.6, 1.6, 0.75, 8, 'circle', true, true, true, '8인 라운드 기준', 80),
  ('홀딩 테이블', '테이블', 'holding_table', 1.8, 0.75, 0.75, null, 'rect', true, true, true, '물품 대기 및 운영용 테이블', 90),
  ('뷔페 테이블', '식음', 'buffet_table', 1.8, 0.75, 0.75, null, 'rect', true, true, true, '뷔페 라인 구성 테이블', 100),
  ('무대', '무대/단상', 'stage', 4.8, 2.4, 0.6, null, 'rect', true, true, true, '행사 무대', 110),
  ('단상', '무대/단상', 'podium', 0.65, 0.55, 1.2, null, 'rect', true, true, true, '사회자 또는 연사용 단상', 120),
  ('의자', '좌석', 'chair', 0.45, 0.45, 0.9, 1, 'rect', true, true, true, '개별 의자', 130)
on conflict (object_name, object_type) do update
set
  category = excluded.category,
  default_width_m = excluded.default_width_m,
  default_height_m = excluded.default_height_m,
  default_elevation_m = excluded.default_elevation_m,
  default_seat_count = excluded.default_seat_count,
  display_shape = excluded.display_shape,
  can_resize = excluded.can_resize,
  can_rotate = excluded.can_rotate,
  memo = excluded.memo,
  sort_order = excluded.sort_order,
  updated_at = now();
