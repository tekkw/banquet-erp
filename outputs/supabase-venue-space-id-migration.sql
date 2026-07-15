-- Venue space column compatibility migration
-- Purpose:
-- - Current Supabase DB uses venue_space_mappings.space_id.
-- - Older draft SQL used venue_space_mappings.venue_space_id.
-- - This migration avoids creating new business tables and only normalizes
--   incorrect legacy column names/indexes/constraints when they exist.

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

create index if not exists venue_space_mappings_space_id_idx
on public.venue_space_mappings (space_id);

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
