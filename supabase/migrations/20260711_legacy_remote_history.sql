-- Venezia Banquet ERP legacy migration history marker
-- Remote Supabase migration history already contains version 20260711.
-- This file keeps the local migrations directory aligned with that remote version.
-- The SQL below is the preserved combined content of the previously split 2026-07-11 migrations.
-- Do not edit unless repairing migration history intentionally.

-- ============================================================
-- Preserved from: 20260711100000_add_ai_review_fields.sql
-- ============================================================

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



-- ============================================================
-- Preserved from: 20260711101000_align_venue_space_columns.sql
-- ============================================================

-- Venezia Banquet ERP migration
-- Date: 2026-07-11
-- Purpose:
-- - Align old draft column name venue_space_id to the current DB standard space_id.
-- - The confirmed current column for venue_space_mappings is space_id.
-- - This migration is defensive: it only renames old columns when the old column exists
--   and the new column does not already exist.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_space_mappings'
      and column_name = 'venue_space_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_space_mappings'
      and column_name = 'space_id'
  ) then
    alter table public.venue_space_mappings
    rename column venue_space_id to space_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_facilities'
      and column_name = 'venue_space_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_facilities'
      and column_name = 'space_id'
  ) then
    alter table public.venue_facilities
    rename column venue_space_id to space_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'layout_rules'
      and column_name = 'venue_space_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'layout_rules'
      and column_name = 'space_id'
  ) then
    alter table public.layout_rules
    rename column venue_space_id to space_id;
  end if;
end $$;

drop index if exists public.venue_space_mappings_venue_space_id_idx;
drop index if exists public.venue_facilities_venue_space_id_idx;

create index if not exists venue_space_mappings_space_id_idx
on public.venue_space_mappings (space_id);

create index if not exists venue_facilities_space_id_idx
on public.venue_facilities (space_id);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'venue_space_mappings'
      and constraint_name = 'venue_space_mappings_venue_id_venue_space_id_key'
  ) then
    alter table public.venue_space_mappings
    drop constraint venue_space_mappings_venue_id_venue_space_id_key;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'venue_space_mappings'
      and constraint_name = 'venue_space_mappings_venue_id_space_id_key'
  ) then
    alter table public.venue_space_mappings
    add constraint venue_space_mappings_venue_id_space_id_key unique (venue_id, space_id);
  end if;
end $$;



-- ============================================================
-- Preserved from: 20260711102000_add_event_schedule_venue_mapping.sql
-- ============================================================

-- Venezia Banquet ERP migration proposal
-- Date: 2026-07-11
-- Purpose:
-- - Store venue/space mapping on each schedule row, not on event_orders.
-- - Keep event_schedules.venue as the original extracted venue string.
-- - Use venue_id for the matched operating venue and venue_space_* for actual physical spaces.
--
-- Important:
-- - Run this only after confirming the current event_schedules table has no equivalent mapping columns.
-- - Frontend payload should start writing these columns only after this migration is applied.

alter table public.event_schedules
add column if not exists venue_id uuid references public.venues(id);

alter table public.event_schedules
add column if not exists venue_space_ids uuid[] not null default '{}';

alter table public.event_schedules
add column if not exists venue_space_names text[] not null default '{}';

create index if not exists event_schedules_venue_id_idx
on public.event_schedules (venue_id);


