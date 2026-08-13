-- Add operational history and AI feedback tables for Venezia Banquet ERP.
--
-- Design principles:
-- - Do not modify or delete existing business data.
-- - Keep current-state tables separate from history/result/feedback tables.
-- - Use SET NULL on most foreign keys so historical records survive if a source
--   event, asset, venue, space, or knowledge row is removed.
-- - Match the current prototype access model with RLS enabled and anon ALL
--   policies. Before production, replace these policies with authenticated/admin
--   or Edge Function based writes.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create table if not exists public.asset_transactions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.banquet_assets(id) on delete set null,
  event_order_id uuid references public.event_orders(id) on delete set null,
  transaction_type text not null,
  quantity_delta integer,
  quantity_after integer,
  from_location text,
  to_location text,
  reason text,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_transactions_type_check
    check (transaction_type in ('in', 'out', 'move', 'return', 'damage', 'loss', 'adjustment'))
);

create table if not exists public.event_operation_results (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid references public.event_orders(id) on delete set null,
  planned_guest_count integer,
  actual_guest_count integer,
  planned_revenue numeric,
  actual_revenue numeric,
  operation_summary text,
  setup_result text,
  service_result text,
  customer_feedback text,
  manager_review text,
  result_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_operation_results_status_check
    check (result_status in ('draft', 'reviewed', 'confirmed', 'archived'))
);

create table if not exists public.event_incidents (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid references public.event_orders(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  space_id uuid references public.venue_spaces(id) on delete set null,
  incident_type text,
  severity text not null default 'medium',
  title text not null,
  description text,
  cause text,
  action_taken text,
  prevention_plan text,
  status text not null default 'open',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint event_incidents_status_check
    check (status in ('open', 'in_progress', 'resolved', 'archived'))
);

create table if not exists public.event_staff_results (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid references public.event_orders(id) on delete set null,
  recommendation_snapshot jsonb not null default '{}'::jsonb,
  recommended_staff integer,
  planned_staff integer,
  actual_staff integer,
  sufficient boolean,
  feedback text,
  result_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid references public.event_orders(id) on delete set null,
  knowledge_id uuid references public.ai_knowledge(id) on delete set null,
  recommendation_type text not null,
  recommended_value jsonb not null default '{}'::jsonb,
  actual_value jsonb not null default '{}'::jsonb,
  manager_rating integer,
  accepted boolean,
  feedback_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_recommendation_feedback_type_check
    check (recommendation_type in ('staffing', 'items', 'beverage', 'layout', 'operation', 'other')),
  constraint ai_recommendation_feedback_rating_check
    check (manager_rating is null or manager_rating between 1 and 5)
);

create table if not exists public.ai_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid references public.ai_knowledge(id) on delete set null,
  version_no integer not null default 1,
  change_type text not null,
  category text,
  subject text,
  predicate text,
  object_value text,
  object text,
  value text,
  natural_language text,
  explanation text,
  reason text,
  confidence numeric,
  status text,
  replaced_by_knowledge_id uuid references public.ai_knowledge(id) on delete set null,
  change_reason text,
  changed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_versions_change_type_check
    check (change_type in ('created', 'updated', 'approved', 'rejected', 'archived', 'replaced')),
  constraint ai_knowledge_versions_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists asset_transactions_asset_id_idx
  on public.asset_transactions(asset_id);
create index if not exists asset_transactions_event_order_id_idx
  on public.asset_transactions(event_order_id);
create index if not exists asset_transactions_occurred_at_idx
  on public.asset_transactions(occurred_at);
create index if not exists asset_transactions_type_idx
  on public.asset_transactions(transaction_type);

create index if not exists event_operation_results_event_order_id_idx
  on public.event_operation_results(event_order_id);
create index if not exists event_operation_results_status_idx
  on public.event_operation_results(result_status);

create index if not exists event_incidents_event_order_id_idx
  on public.event_incidents(event_order_id);
create index if not exists event_incidents_venue_id_idx
  on public.event_incidents(venue_id);
create index if not exists event_incidents_space_id_idx
  on public.event_incidents(space_id);
create index if not exists event_incidents_status_idx
  on public.event_incidents(status);
create index if not exists event_incidents_severity_idx
  on public.event_incidents(severity);
create index if not exists event_incidents_occurred_at_idx
  on public.event_incidents(occurred_at);

create index if not exists event_staff_results_event_order_id_idx
  on public.event_staff_results(event_order_id);

create index if not exists ai_recommendation_feedback_event_order_id_idx
  on public.ai_recommendation_feedback(event_order_id);
create index if not exists ai_recommendation_feedback_knowledge_id_idx
  on public.ai_recommendation_feedback(knowledge_id);
create index if not exists ai_recommendation_feedback_type_idx
  on public.ai_recommendation_feedback(recommendation_type);

create index if not exists ai_knowledge_versions_knowledge_id_idx
  on public.ai_knowledge_versions(knowledge_id);
create index if not exists ai_knowledge_versions_change_type_idx
  on public.ai_knowledge_versions(change_type);
create unique index if not exists ai_knowledge_versions_knowledge_version_key
  on public.ai_knowledge_versions(knowledge_id, version_no)
  where knowledge_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_asset_transactions_updated_at') then
    create trigger set_asset_transactions_updated_at
    before update on public.asset_transactions
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_event_operation_results_updated_at') then
    create trigger set_event_operation_results_updated_at
    before update on public.event_operation_results
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_event_incidents_updated_at') then
    create trigger set_event_incidents_updated_at
    before update on public.event_incidents
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_event_staff_results_updated_at') then
    create trigger set_event_staff_results_updated_at
    before update on public.event_staff_results
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_ai_recommendation_feedback_updated_at') then
    create trigger set_ai_recommendation_feedback_updated_at
    before update on public.ai_recommendation_feedback
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_ai_knowledge_versions_updated_at') then
    create trigger set_ai_knowledge_versions_updated_at
    before update on public.ai_knowledge_versions
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.asset_transactions enable row level security;
alter table public.event_operation_results enable row level security;
alter table public.event_incidents enable row level security;
alter table public.event_staff_results enable row level security;
alter table public.ai_recommendation_feedback enable row level security;
alter table public.ai_knowledge_versions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'asset_transactions'
      and policyname = 'prototype asset_transactions access'
  ) then
    create policy "prototype asset_transactions access"
    on public.asset_transactions for all to anon
    using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_operation_results'
      and policyname = 'prototype event_operation_results access'
  ) then
    create policy "prototype event_operation_results access"
    on public.event_operation_results for all to anon
    using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_incidents'
      and policyname = 'prototype event_incidents access'
  ) then
    create policy "prototype event_incidents access"
    on public.event_incidents for all to anon
    using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_staff_results'
      and policyname = 'prototype event_staff_results access'
  ) then
    create policy "prototype event_staff_results access"
    on public.event_staff_results for all to anon
    using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_recommendation_feedback'
      and policyname = 'prototype ai_recommendation_feedback access'
  ) then
    create policy "prototype ai_recommendation_feedback access"
    on public.ai_recommendation_feedback for all to anon
    using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_knowledge_versions'
      and policyname = 'prototype ai_knowledge_versions access'
  ) then
    create policy "prototype ai_knowledge_versions access"
    on public.ai_knowledge_versions for all to anon
    using (true) with check (true);
  end if;
end $$;
