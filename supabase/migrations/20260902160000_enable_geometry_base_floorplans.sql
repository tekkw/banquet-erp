-- Floorplan Editor V2 phase 1.
-- Prepared only: do not apply to production until the V2 UI is approved.

-- A geometry-authored base floorplan has no source image or PDF.
alter table public.venue_floorplans
  alter column file_id drop not null;

-- Locks the base plan as a whole. Individual fixed objects already have is_locked.
alter table public.venue_floorplans
  add column if not exists is_locked boolean not null default false;

comment on column public.venue_floorplans.file_id is
  'Optional source image/PDF. NULL for geometry-authored V2 base floorplans.';

comment on column public.venue_floorplans.is_locked is
  'When true, base geometry and fixed structural objects must not be moved in event-layout mode.';
