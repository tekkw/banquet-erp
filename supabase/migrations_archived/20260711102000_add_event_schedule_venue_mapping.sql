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

