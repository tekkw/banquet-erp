create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_key text,
  device_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  board_date date not null,
  item_key text not null,
  scheduled_at timestamptz not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (board_date, item_key, scheduled_at, subscription_id)
);

create index if not exists push_subscriptions_active_idx on public.push_subscriptions(is_active);
alter table public.push_subscriptions enable row level security;
alter table public.operation_push_deliveries enable row level security;
create policy "prototype push subscription access" on public.push_subscriptions for all to anon using (true) with check (true);
