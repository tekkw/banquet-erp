-- AI conversation list hide flag.
-- This migration is intentionally safe for the current project state:
-- the checked codebase does not currently define an ai_conversations table.
-- If the table exists in Supabase, add is_hidden without deleting any rows.

do $$
begin
  if to_regclass('public.ai_conversations') is not null then
    alter table public.ai_conversations
      add column if not exists is_hidden boolean not null default false;

    create index if not exists ai_conversations_is_hidden_idx
      on public.ai_conversations(is_hidden);
  end if;
end $$;
