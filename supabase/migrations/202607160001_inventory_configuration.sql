begin;

-- El esquema original cubre inventario operativo, pero no distingue nombres
-- públicos, tarifas, ubicación física, cantidades ni servicios configurables.
alter table public.room_types
  add column if not exists public_name text,
  add column if not exists base_rate numeric(12, 2);

alter table public.rooms
  add column if not exists sector text,
  add column if not exists internal_notes text;

alter table public.beds
  add column if not exists quantity smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_types_public_name_length'
      and conrelid = 'public.room_types'::regclass
  ) then
    alter table public.room_types
      add constraint room_types_public_name_length
      check (public_name is null or char_length(public_name) between 2 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_types_base_rate_positive'
      and conrelid = 'public.room_types'::regclass
  ) then
    alter table public.room_types
      add constraint room_types_base_rate_positive
      check (base_rate is null or base_rate > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_sector_length'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_sector_length
      check (sector is null or char_length(sector) between 1 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_internal_notes_length'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_internal_notes_length
      check (internal_notes is null or char_length(internal_notes) <= 2000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'beds_quantity_range'
      and conrelid = 'public.beds'::regclass
  ) then
    alter table public.beds
      add constraint beds_quantity_range check (quantity between 1 and 30);
  end if;
end;
$$;

create table if not exists public.room_services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (char_length(name) between 2 and 100),
  description text check (description is null or char_length(description) <= 500),
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_service_assignments (
  room_id uuid not null references public.rooms(id) on delete cascade,
  service_id uuid not null references public.room_services(id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, service_id)
);

create index if not exists rooms_room_type_id_idx on public.rooms (room_type_id);
create index if not exists beds_room_id_idx on public.beds (room_id);
create index if not exists room_service_assignments_service_id_idx
  on public.room_service_assignments (service_id);

create or replace function private.validate_room_inventory_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_room_active boolean;
  v_room_capacity integer;
  v_type_active boolean;
  v_base_rate numeric;
  v_bed_capacity integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select room.active,
         room.capacity,
         room_type.active,
         room_type.base_rate,
         coalesce(sum(bed.capacity * bed.quantity) filter (where bed.active), 0)::integer
  into v_room_active, v_room_capacity, v_type_active, v_base_rate, v_bed_capacity
  from public.rooms room
  left join public.room_types room_type on room_type.id = room.room_type_id
  left join public.beds bed on bed.room_id = room.id
  where room.id = new.room_id
  group by room.id, room.active, room.capacity, room_type.active, room_type.base_rate;

  if not found
     or not coalesce(v_room_active, false)
     or not coalesce(v_type_active, false)
     or coalesce(v_base_rate, 0) <= 0
     or coalesce(v_bed_capacity, 0) < v_room_capacity then
    raise exception using errcode = '23514', message = 'ROOM_INVENTORY_INCOMPLETE';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_room_inventory_assignment on public.room_assignments;
create trigger validate_room_inventory_assignment
before insert or update of room_id, status on public.room_assignments
for each row execute function private.validate_room_inventory_assignment();

insert into public.room_services (code, name, description, is_system)
values
  ('fan', 'Ventilador', 'Ventilador disponible en la habitación.', true),
  ('air_conditioning', 'Aire acondicionado', 'Equipo de aire acondicionado.', true),
  ('heating', 'Calefacción', 'Sistema o equipo de calefacción.', true),
  ('television', 'Televisión', 'Televisión disponible en la habitación.', true),
  ('bed_linen', 'Ropa de cama', 'Ropa de cama incluida.', true),
  ('towels', 'Toallas', 'Toallas incluidas.', true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

drop trigger if exists room_services_updated_at on public.room_services;
create trigger room_services_updated_at before update on public.room_services
for each row execute function private.set_updated_at();

drop trigger if exists room_service_assignments_updated_at on public.room_service_assignments;
create trigger room_service_assignments_updated_at before update on public.room_service_assignments
for each row execute function private.set_updated_at();

alter table public.room_services enable row level security;
alter table public.room_service_assignments enable row level security;

-- Editar una habitación exige tanto administrar el inventario estructural
-- como operar sus estados. Esto mantiene la misma defensa en API y en RLS.
drop policy if exists rooms_manage on public.rooms;
drop policy if exists rooms_insert on public.rooms;
drop policy if exists rooms_update on public.rooms;
drop policy if exists rooms_delete on public.rooms;
create policy rooms_insert on public.rooms
for insert to authenticated
with check (
  (select private.has_permission('rooms.inventory_manage'))
  and (select private.has_permission('rooms.manage'))
);
create policy rooms_update on public.rooms
for update to authenticated
using (
  (select private.has_permission('rooms.inventory_manage'))
  and (select private.has_permission('rooms.manage'))
)
with check (
  (select private.has_permission('rooms.inventory_manage'))
  and (select private.has_permission('rooms.manage'))
);
create policy rooms_delete on public.rooms
for delete to authenticated
using (
  (select private.has_permission('rooms.inventory_manage'))
  and (select private.has_permission('rooms.manage'))
);

drop policy if exists room_services_read on public.room_services;
drop policy if exists room_services_manage on public.room_services;
drop policy if exists room_services_insert on public.room_services;
drop policy if exists room_services_update on public.room_services;
drop policy if exists room_services_delete on public.room_services;
create policy room_services_read on public.room_services
for select to authenticated using ((select private.has_permission('rooms.read')));
create policy room_services_insert on public.room_services
for insert to authenticated
with check ((select private.has_permission('rooms.inventory_manage')));
create policy room_services_update on public.room_services
for update to authenticated
using ((select private.has_permission('rooms.inventory_manage')))
with check ((select private.has_permission('rooms.inventory_manage')));
create policy room_services_delete on public.room_services
for delete to authenticated
using ((select private.has_permission('rooms.inventory_manage')));

drop policy if exists room_service_assignments_read on public.room_service_assignments;
drop policy if exists room_service_assignments_manage on public.room_service_assignments;
drop policy if exists room_service_assignments_insert on public.room_service_assignments;
drop policy if exists room_service_assignments_update on public.room_service_assignments;
drop policy if exists room_service_assignments_delete on public.room_service_assignments;
create policy room_service_assignments_read on public.room_service_assignments
for select to authenticated using ((select private.has_permission('rooms.read')));
create policy room_service_assignments_insert on public.room_service_assignments
for insert to authenticated
with check ((select private.has_permission('rooms.inventory_manage')));
create policy room_service_assignments_update on public.room_service_assignments
for update to authenticated
using ((select private.has_permission('rooms.inventory_manage')))
with check ((select private.has_permission('rooms.inventory_manage')));
create policy room_service_assignments_delete on public.room_service_assignments
for delete to authenticated
using ((select private.has_permission('rooms.inventory_manage')));

revoke all on public.room_services, public.room_service_assignments from anon, authenticated;
grant select, insert, update, delete on public.room_services, public.room_service_assignments to authenticated;

-- Todas las escrituras de configuración quedan asociadas a auth.uid() en audit_logs.
drop trigger if exists audit_settings on public.settings;
create trigger audit_settings after insert or update or delete on public.settings
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_room_types on public.room_types;
create trigger audit_room_types after insert or update or delete on public.room_types
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_beds on public.beds;
create trigger audit_beds after insert or update or delete on public.beds
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_roles on public.roles;
create trigger audit_roles after insert or update or delete on public.roles
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_role_permissions on public.role_permissions;
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles after insert or update or delete on public.user_roles
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_room_services on public.room_services;
create trigger audit_room_services after insert or update or delete on public.room_services
for each row execute function private.capture_sensitive_change();

drop trigger if exists audit_room_service_assignments on public.room_service_assignments;
create trigger audit_room_service_assignments after insert or update or delete on public.room_service_assignments
for each row execute function private.capture_sensitive_change();

commit;
