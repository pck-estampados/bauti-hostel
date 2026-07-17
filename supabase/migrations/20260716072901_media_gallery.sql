begin;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer not null,
  height integer not null,
  alt_text text not null default '',
  caption text,
  category text not null,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  active boolean not null default false,
  room_id uuid references public.rooms(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_storage_path_format check (
    storage_path ~ '^gallery/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ),
  constraint media_assets_original_filename_length check (
    char_length(original_filename) between 1 and 255
    and original_filename !~ '[/\\]'
  ),
  constraint media_assets_mime_type check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint media_assets_size check (size_bytes between 1 and 6291456),
  constraint media_assets_dimensions check (
    width between 1 and 20000
    and height between 1 and 20000
    and width::bigint * height::bigint <= 50000000
  ),
  constraint media_assets_alt_length check (char_length(alt_text) <= 300),
  constraint media_assets_caption_length check (
    caption is null or char_length(caption) <= 1000
  ),
  constraint media_assets_category check (
    category in (
      'exterior', 'recepcion', 'habitacion', 'pileta', 'patio',
      'espacios_comunes', 'desayuno', 'otros'
    )
  ),
  constraint media_assets_sort_order check (sort_order between 0 and 10000),
  constraint media_assets_published_requires_alt check (
    not is_published or char_length(btrim(alt_text)) > 0
  ),
  constraint media_assets_published_requires_active check (
    not is_published or active
  )
);

create index if not exists media_assets_public_gallery_idx
  on public.media_assets (sort_order, created_at, id)
  where active and is_published;
create index if not exists media_assets_admin_filters_idx
  on public.media_assets (category, active, is_published, sort_order, created_at desc);
create index if not exists media_assets_room_id_idx
  on public.media_assets (room_id) where room_id is not null;
create index if not exists media_assets_created_by_idx
  on public.media_assets (created_by) where created_by is not null;
create index if not exists media_assets_updated_by_idx
  on public.media_assets (updated_by) where updated_by is not null;

create or replace function private.prepare_media_asset_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    if new.storage_path is distinct from old.storage_path
       or new.original_filename is distinct from old.original_filename
       or new.mime_type is distinct from old.mime_type
       or new.size_bytes is distinct from old.size_bytes
       or new.width is distinct from old.width
       or new.height is distinct from old.height then
      raise exception using errcode = '22023', message = 'IMMUTABLE_MEDIA_FILE';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
  end if;

  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := now();
  elsif not new.is_published then
    new.published_at := null;
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
  end if;

  return new;
end;
$$;

create or replace function private.capture_media_asset_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then jsonb_build_object(
    'active', old.active,
    'category', old.category,
    'sort_order', old.sort_order,
    'is_published', old.is_published,
    'room_id', old.room_id
  ) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object(
    'active', new.active,
    'category', new.category,
    'sort_order', new.sort_order,
    'is_published', new.is_published,
    'room_id', new.room_id
  ) else null end;
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.audit_logs (
    actor_id, action, table_name, record_id, old_values, new_values
  ) values (
    auth.uid(), lower(tg_op), 'media_assets', v_id, v_old, v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_prepare_change on public.media_assets;
create trigger media_assets_prepare_change
before insert or update on public.media_assets
for each row execute function private.prepare_media_asset_change();

drop trigger if exists media_assets_updated_at on public.media_assets;
create trigger media_assets_updated_at
before update on public.media_assets
for each row execute function private.set_updated_at();

drop trigger if exists audit_media_assets on public.media_assets;
create trigger audit_media_assets
after insert or update or delete on public.media_assets
for each row execute function private.capture_media_asset_change();

revoke all on function private.prepare_media_asset_change() from public, anon, authenticated;
revoke all on function private.capture_media_asset_change() from public, anon, authenticated;

insert into public.permissions (code, description) values
  ('media.read', 'Ver el inventario interno de medios.'),
  ('media.manage', 'Cargar, editar, publicar y eliminar medios.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'owner'
  and permission.code in ('media.read', 'media.manage')
on conflict (role_id, permission_id) do nothing;

alter table public.media_assets enable row level security;

drop policy if exists media_assets_public_read on public.media_assets;
create policy media_assets_public_read on public.media_assets
for select to anon
using (active and is_published and char_length(btrim(alt_text)) > 0);

drop policy if exists media_assets_staff_read on public.media_assets;
create policy media_assets_staff_read on public.media_assets
for select to authenticated
using ((select private.has_permission('media.read')));

drop policy if exists media_assets_staff_insert on public.media_assets;
create policy media_assets_staff_insert on public.media_assets
for insert to authenticated
with check ((select private.has_permission('media.manage')));

drop policy if exists media_assets_staff_update on public.media_assets;
create policy media_assets_staff_update on public.media_assets
for update to authenticated
using ((select private.has_permission('media.manage')))
with check ((select private.has_permission('media.manage')));

drop policy if exists media_assets_staff_delete on public.media_assets;
create policy media_assets_staff_delete on public.media_assets
for delete to authenticated
using ((select private.has_permission('media.manage')));

revoke all on public.media_assets from anon, authenticated;
grant select (
  id, storage_path, width, height, alt_text, caption, category,
  sort_order, published_at
) on public.media_assets to anon;
grant select, insert, update, delete on public.media_assets to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'hostel-media',
  'hostel-media',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hostel_media_staff_read on storage.objects;
create policy hostel_media_staff_read on storage.objects
for select to authenticated
using (
  bucket_id = 'hostel-media'
  and name ~ '^gallery/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and (select private.has_permission('media.read'))
);

drop policy if exists hostel_media_staff_insert on storage.objects;
create policy hostel_media_staff_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'hostel-media'
  and name ~ '^gallery/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and (select private.has_permission('media.manage'))
);

drop policy if exists hostel_media_staff_delete on storage.objects;
create policy hostel_media_staff_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'hostel-media'
  and name ~ '^gallery/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and (select private.has_permission('media.manage'))
);

commit;
