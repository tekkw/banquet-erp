-- Allow ERP admins/prototype anon client to remove venue layout files from Storage.
-- This is intentionally separated from the original table creation migration so it
-- can be applied safely after the initial venue-layouts bucket migration.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'prototype venue layout file delete'
  ) then
    create policy "prototype venue layout file delete"
      on storage.objects
      for delete
      to anon
      using (bucket_id = 'venue-layouts');
  end if;
end $$;
