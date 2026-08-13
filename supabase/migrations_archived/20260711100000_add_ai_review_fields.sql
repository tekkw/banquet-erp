-- Venezia Banquet ERP migration
-- Date: 2026-07-11
-- Purpose:
-- - Add fields used by AI interview source tracking and post-event reviews.
-- - Allow event_notes.note_type = 'post_event_review'.
-- - Prevent duplicate confirmed knowledge rows from repeated confirm clicks.
--
-- Run this migration once in Supabase SQL Editor or through Supabase CLI.
-- If duplicate rows already exist, unique index creation can fail. In that case,
-- remove duplicates first, then rerun the index statements.

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

create unique index if not exists ai_knowledge_unique_interview_fact_idx
on public.ai_knowledge (
  source_interview_id,
  subject,
  predicate,
  coalesce(object_value, '')
);

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

