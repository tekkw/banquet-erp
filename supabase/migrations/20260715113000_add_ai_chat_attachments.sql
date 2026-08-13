-- AI chat attachments for image/document questions.
-- conversation_id is text for compatibility with older frontend-generated IDs
-- and the newer uuid-based ai_conversations table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-chat-attachments',
  'ai-chat-attachments',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ai_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  message_id text,
  storage_bucket text not null default 'ai-chat-attachments',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  attachment_type text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint ai_chat_attachments_type_check
    check (attachment_type in ('image', 'pdf', 'text', 'file'))
);

create index if not exists ai_chat_attachments_conversation_id_idx
  on public.ai_chat_attachments(conversation_id);

create index if not exists ai_chat_attachments_created_at_idx
  on public.ai_chat_attachments(created_at desc);

alter table public.ai_chat_attachments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_chat_attachments'
      and policyname = 'prototype ai_chat_attachments access'
  ) then
    create policy "prototype ai_chat_attachments access"
      on public.ai_chat_attachments
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'prototype ai chat attachment insert'
  ) then
    create policy "prototype ai chat attachment insert"
      on storage.objects
      for insert
      to anon
      with check (bucket_id = 'ai-chat-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'prototype ai chat attachment read'
  ) then
    create policy "prototype ai chat attachment read"
      on storage.objects
      for select
      to anon
      using (bucket_id = 'ai-chat-attachments');
  end if;
end $$;
