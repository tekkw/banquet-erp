-- AI assistant conversation persistence.
-- Safe to run repeatedly: creates tables/policies only when missing.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  session_key text not null default 'anonymous',
  title text not null default '새 대화',
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_session_hidden_updated_idx
  on public.ai_conversations (session_key, is_hidden, updated_at desc);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at asc);

create or replace function public.update_ai_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row
execute function public.update_ai_conversations_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_conversations'
      and policyname = 'prototype ai_conversations access'
  ) then
    create policy "prototype ai_conversations access"
      on public.ai_conversations
      for all
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_messages'
      and policyname = 'prototype ai_messages access'
  ) then
    create policy "prototype ai_messages access"
      on public.ai_messages
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;
