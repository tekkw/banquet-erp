-- 오늘 운영보드의 사용자 작업/완료 상태와 다음 세팅 하위항목만 저장한다.
-- event_orders, event_schedules 등 원본 이벤오더 데이터는 참조만 하며 수정하지 않는다.
create table if not exists public.operation_board_items (
  id uuid primary key default gen_random_uuid(),
  board_date date not null,
  item_key text not null,
  item_kind text not null check (item_kind in ('auto', 'manual', 'next_setup')),
  event_order_id uuid references public.event_orders(id) on delete set null,
  space_id uuid references public.venue_spaces(id) on delete set null,
  item_time time,
  venue_name text not null default '',
  title text not null default '',
  people integer,
  memo text not null default '',
  is_completed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_date, item_key)
);

create table if not exists public.operation_board_checklist_items (
  id uuid primary key default gen_random_uuid(),
  board_date date not null,
  parent_item_key text not null,
  item_name text not null,
  quantity numeric,
  unit text,
  memo text not null default '',
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operation_board_items_date_idx on public.operation_board_items(board_date, item_time);
create index if not exists operation_board_checklist_parent_idx on public.operation_board_checklist_items(board_date, parent_item_key, sort_order);

alter table public.operation_board_items enable row level security;
alter table public.operation_board_checklist_items enable row level security;

create policy "prototype operation board items access" on public.operation_board_items for all to anon using (true) with check (true);
create policy "prototype operation checklist access" on public.operation_board_checklist_items for all to anon using (true) with check (true);
