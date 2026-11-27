-- ERP Setting Manual & AI Knowledge System V1
-- Reuses public.files + public.file_links. No existing layout or AI tables are changed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'setting-manuals', 'setting-manuals', true, 20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.setting_manual_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setting_manual_categories_name_key unique (name)
);

create table if not exists public.setting_manuals (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.setting_manual_categories(id) on delete set null,
  title text not null,
  description text,
  instructions text,
  precautions text,
  keywords text[] not null default '{}',
  applicable_venues text[] not null default '{}',
  status text not null default 'DRAFT',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setting_manuals_status_check check (status in ('DRAFT','PUBLISHED','INACTIVE'))
);

create index if not exists setting_manual_categories_active_order_idx
  on public.setting_manual_categories(is_active, sort_order, name);
create index if not exists setting_manuals_status_updated_idx
  on public.setting_manuals(status, updated_at desc);
create index if not exists setting_manuals_category_idx
  on public.setting_manuals(category_id, status);
create index if not exists setting_manuals_keywords_gin_idx
  on public.setting_manuals using gin(keywords);

create or replace function public.touch_setting_manual_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_setting_manual_categories_updated_at on public.setting_manual_categories;
create trigger set_setting_manual_categories_updated_at before update on public.setting_manual_categories
for each row execute function public.touch_setting_manual_updated_at();
drop trigger if exists set_setting_manuals_updated_at on public.setting_manuals;
create trigger set_setting_manuals_updated_at before update on public.setting_manuals
for each row execute function public.touch_setting_manual_updated_at();

alter table public.setting_manual_categories enable row level security;
alter table public.setting_manuals enable row level security;

drop policy if exists "setting manual categories read" on public.setting_manual_categories;
create policy "setting manual categories read" on public.setting_manual_categories
for select to anon, authenticated using (is_active or auth.role() = 'authenticated');

drop policy if exists "published setting manuals read" on public.setting_manuals;
create policy "published setting manuals read" on public.setting_manuals
for select to anon, authenticated using (status = 'PUBLISHED' or auth.role() = 'authenticated');

-- The ERP currently uses its existing local-login role model rather than Supabase Auth.
-- These prototype write policies intentionally match the project's existing files/file_links
-- contract. UI mutations remain admin-only, but anon is not a cryptographic security boundary.
drop policy if exists "prototype setting manual categories write" on public.setting_manual_categories;
create policy "prototype setting manual categories write" on public.setting_manual_categories
for all to anon, authenticated using (true) with check (true);

drop policy if exists "prototype setting manuals write" on public.setting_manuals;
create policy "prototype setting manuals write" on public.setting_manuals
for all to anon, authenticated using (true) with check (true);

drop policy if exists "setting manual file read" on storage.objects;
create policy "setting manual file read" on storage.objects
for select to anon, authenticated using (bucket_id = 'setting-manuals');

drop policy if exists "prototype setting manual file write" on storage.objects;
create policy "prototype setting manual file write" on storage.objects
for all to anon, authenticated
using (bucket_id = 'setting-manuals')
with check (bucket_id = 'setting-manuals');

insert into public.setting_manual_categories(name, sort_order)
values
  ('커피브레이크',10),('한정식',20),('양정식',30),('월례회의',40),
  ('뷔페',50),('도시락',60),('기본 기물 세팅',70),('행사 운영',80),('기타',90)
on conflict (name) do nothing;
