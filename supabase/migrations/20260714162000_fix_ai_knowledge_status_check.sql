-- Fix ai_knowledge status values for the learning-center flow.
--
-- Why this migration exists:
-- The frontend now saves approved teaching/interview knowledge as status='approved',
-- while older database constraints may only allow values such as 'confirmed'.
-- This migration is intentionally idempotent. It drops the old constraint before
-- converting confirmed -> approved because the old constraint may reject approved.

alter table public.ai_knowledge
  drop constraint if exists ai_knowledge_status_check;

update public.ai_knowledge
set
  status = 'approved',
  updated_at = coalesce(updated_at, now())
where status = 'confirmed';

update public.ai_knowledge
set
  status = 'draft',
  updated_at = coalesce(updated_at, now())
where status is null
   or status not in ('draft', 'pending', 'approved', 'rejected', 'archived');

alter table public.ai_knowledge
  alter column status set default 'draft';

alter table public.ai_knowledge
  add constraint ai_knowledge_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'archived'));

create index if not exists ai_knowledge_status_idx
  on public.ai_knowledge (status);
