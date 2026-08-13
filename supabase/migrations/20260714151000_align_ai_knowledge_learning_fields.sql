-- Venezia Banquet ERP migration
-- Date: 2026-07-14
-- Purpose:
-- - Keep ai_interviews as the original natural-language learning log.
-- - Store approved structured knowledge cards as separate ai_knowledge rows.
-- - Add only missing columns; existing columns and data are preserved.

create extension if not exists pgcrypto;

create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text,
  subject text,
  predicate text,
  "object" text,
  value text,
  natural_language text,
  confidence numeric,
  status text default 'draft',
  source_interview_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.ai_knowledge
add column if not exists category text;

alter table public.ai_knowledge
add column if not exists subject text;

alter table public.ai_knowledge
add column if not exists predicate text;

alter table public.ai_knowledge
add column if not exists "object" text;

alter table public.ai_knowledge
add column if not exists value text;

alter table public.ai_knowledge
add column if not exists natural_language text;

alter table public.ai_knowledge
add column if not exists confidence numeric;

alter table public.ai_knowledge
add column if not exists status text default 'draft';

alter table public.ai_knowledge
add column if not exists source_interview_id uuid;

alter table public.ai_knowledge
add column if not exists created_at timestamptz default now();

alter table public.ai_knowledge
add column if not exists updated_at timestamptz default now();

alter table public.ai_knowledge
alter column status set default 'draft';

alter table public.ai_knowledge
alter column created_at set default now();

alter table public.ai_knowledge
alter column updated_at set default now();

-- Legacy-compatible fields already used by older code. They are kept for
-- backward compatibility and are populated together with the new fields.
alter table public.ai_knowledge
add column if not exists object_value text;

alter table public.ai_knowledge
add column if not exists explanation text;

alter table public.ai_knowledge
add column if not exists reason text;

alter table public.ai_knowledge
add column if not exists original_answer text;

alter table public.ai_knowledge
add column if not exists entity_type text;

alter table public.ai_knowledge
add column if not exists entity_id uuid;

alter table public.ai_knowledge
add column if not exists confirmed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_knowledge_source_interview_id_fkey'
      and conrelid = 'public.ai_knowledge'::regclass
  ) then
    alter table public.ai_knowledge
    add constraint ai_knowledge_source_interview_id_fkey
    foreign key (source_interview_id)
    references public.ai_interviews(id)
    on delete set null;
  end if;
end $$;

create index if not exists ai_knowledge_status_idx
on public.ai_knowledge (status);

create index if not exists ai_knowledge_source_interview_id_idx
on public.ai_knowledge (source_interview_id);

create unique index if not exists ai_knowledge_unique_approved_fact_idx
on public.ai_knowledge (
  source_interview_id,
  subject,
  predicate,
  coalesce("object", ''),
  coalesce(value, '')
)
where status = 'approved';
