create table if not exists public.hall_current_states (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.venue_spaces(id) on delete cascade,
  space_key text,
  venue_name text not null,
  layout_type text,
  seats integer,
  tables integer,
  equipment jsonb not null default '{}'::jsonb,
  note text,
  source text not null default 'manual_confirmed',
  source_event_order_id uuid references public.event_orders(id) on delete set null,
  source_layout_id uuid references public.venue_layouts(id) on delete set null,
  confidence numeric,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hall_current_states_space_unique unique (space_id),
  constraint hall_current_states_source_check check (source in ('manual_confirmed', 'event_inherited', 'ai_inferred')),
  constraint hall_current_states_seats_check check (seats is null or seats >= 0),
  constraint hall_current_states_tables_check check (tables is null or tables >= 0),
  constraint hall_current_states_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists hall_current_states_source_idx
  on public.hall_current_states (source, updated_at desc);

alter table public.hall_current_states enable row level security;

drop policy if exists "erp hall current states access" on public.hall_current_states;
create policy "erp hall current states access"
  on public.hall_current_states
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.hall_current_states to anon, authenticated;
notify pgrst, 'reload schema';
