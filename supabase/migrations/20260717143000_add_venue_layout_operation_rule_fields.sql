-- Add operational layout rule fields to registered venue layout images.
-- This keeps existing files, storage objects, and layout image records intact.

alter table public.venue_layout_images
  add column if not exists setup_capacity integer,
  add column if not exists column_count integer,
  add column if not exists row_count integer,
  add column if not exists seats_per_table integer,
  add column if not exists base_table_count integer,
  add column if not exists extra_table_count integer default 0,
  add column if not exists capacity_rule text;

update public.venue_layout_images
set extra_table_count = 0
where extra_table_count is null;

alter table public.venue_layout_images
  alter column extra_table_count set default 0,
  alter column extra_table_count set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venue_layout_images_operation_numbers_check'
      and conrelid = 'public.venue_layout_images'::regclass
  ) then
    alter table public.venue_layout_images
      add constraint venue_layout_images_operation_numbers_check
      check (
        (setup_capacity is null or setup_capacity >= 0)
        and (column_count is null or column_count >= 0)
        and (row_count is null or row_count >= 0)
        and (seats_per_table is null or seats_per_table >= 0)
        and (base_table_count is null or base_table_count >= 0)
        and extra_table_count >= 0
      );
  end if;
end $$;
