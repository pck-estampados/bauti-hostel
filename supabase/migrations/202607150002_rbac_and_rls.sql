begin;

create function private.is_active_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and exists (
        select 1 from public.user_roles ur where ur.user_id = p.id
      )
  );
$$;

create function private.has_permission(p_permission text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_staff(p_user_id) and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions permission on permission.id = rp.permission_id
    where ur.user_id = p_user_id
      and permission.code = p_permission
  );
$$;

create function private.require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission(p_permission, auth.uid()) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
end;
$$;

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, status)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, new.id::text), '@', 1)
    ),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.permissions (code, description) values
  ('staff.read', 'Ver perfiles, roles y permisos internos.'),
  ('staff.manage', 'Activar personal y administrar roles y permisos.'),
  ('rbac.manage', 'Administrar la matriz de roles y permisos de seguridad.'),
  ('rooms.read', 'Ver inventario y estado de habitaciones.'),
  ('rooms.manage', 'Administrar inventario, bloqueos y estados.'),
  ('rooms.inventory_manage', 'Crear y modificar inventario estructural.'),
  ('guests.read', 'Ver datos personales de huéspedes.'),
  ('guests.manage', 'Crear y actualizar huéspedes.'),
  ('reservations.read', 'Ver reservas y asignaciones.'),
  ('reservations.manage', 'Crear y operar reservas, check-in y check-out.'),
  ('payments.read', 'Ver pagos, totales y saldos.'),
  ('payments.manage', 'Registrar o anular movimientos de pago.'),
  ('housekeeping.read', 'Ver tareas de limpieza.'),
  ('housekeeping.manage', 'Administrar el flujo de limpieza asignado.'),
  ('maintenance.read', 'Ver incidencias de mantenimiento.'),
  ('maintenance.manage', 'Administrar incidencias de mantenimiento.'),
  ('notes.read', 'Ver notas internas de operación.'),
  ('notes.manage', 'Crear y actualizar notas internas.'),
  ('activity.read', 'Ver actividad operativa.'),
  ('audit.read', 'Ver el registro de auditoría sensible.'),
  ('settings.read', 'Ver configuración privada.'),
  ('settings.manage', 'Administrar configuración del sistema.');

insert into public.roles (code, name, description) values
  ('owner', 'Propietario', 'Control total y acceso de auditoría.'),
  ('admin', 'Administrador', 'Administración operativa y de personal.'),
  ('reception', 'Recepción', 'Reservas, huéspedes, cobros y operación diaria.'),
  ('housekeeping', 'Limpieza', 'Tareas y estados del circuito de limpieza.'),
  ('maintenance', 'Mantenimiento', 'Incidencias y ubicaciones necesarias.');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code not in ('audit.read', 'rbac.manage');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'rooms.read', 'rooms.manage', 'guests.read', 'guests.manage',
  'reservations.read', 'reservations.manage', 'payments.read', 'payments.manage',
  'housekeeping.read', 'notes.read', 'notes.manage', 'activity.read', 'settings.read'
])
where r.code = 'reception';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'rooms.read', 'housekeeping.read', 'housekeeping.manage'
])
where r.code = 'housekeeping';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'rooms.read', 'maintenance.read', 'maintenance.manage'
])
where r.code = 'maintenance';

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_guests enable row level security;
alter table public.room_assignments enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.payments enable row level security;
alter table public.housekeeping_tasks enable row level security;
alter table public.maintenance_issues enable row level security;
alter table public.internal_notes enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.room_status_history enable row level security;
alter table public.reservation_status_history enable row level security;

create policy profiles_self_or_staff_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.has_permission('staff.read'));
create policy profiles_management_insert on public.profiles
for insert to authenticated with check (private.has_permission('staff.manage'));
create policy profiles_management_update on public.profiles
for update to authenticated
using (private.has_permission('staff.manage'))
with check (private.has_permission('staff.manage'));

create policy roles_staff_select on public.roles
for select to authenticated using (private.is_active_staff());
create policy roles_management_all on public.roles
for all to authenticated
using (private.has_permission('rbac.manage'))
with check (private.has_permission('rbac.manage'));

create policy permissions_staff_select on public.permissions
for select to authenticated using (private.is_active_staff());
create policy permissions_management_all on public.permissions
for all to authenticated
using (private.has_permission('rbac.manage'))
with check (private.has_permission('rbac.manage'));

create policy role_permissions_staff_select on public.role_permissions
for select to authenticated using (private.is_active_staff());
create policy role_permissions_management_all on public.role_permissions
for all to authenticated
using (private.has_permission('rbac.manage'))
with check (private.has_permission('rbac.manage'));

create policy user_roles_self_or_staff_select on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or private.has_permission('staff.read'));
create policy user_roles_management_all on public.user_roles
for all to authenticated
using (private.has_permission('rbac.manage'))
with check (private.has_permission('rbac.manage'));

create policy room_types_read on public.room_types
for select to authenticated using (private.has_permission('rooms.read'));
create policy room_types_manage on public.room_types
for all to authenticated
using (private.has_permission('rooms.inventory_manage'))
with check (private.has_permission('rooms.inventory_manage'));

create policy rooms_read on public.rooms
for select to authenticated using (private.has_permission('rooms.read'));
create policy rooms_manage on public.rooms
for all to authenticated
using (private.has_permission('rooms.inventory_manage'))
with check (private.has_permission('rooms.inventory_manage'));

create policy beds_read on public.beds
for select to authenticated using (private.has_permission('rooms.read'));
create policy beds_manage on public.beds
for all to authenticated
using (private.has_permission('rooms.inventory_manage'))
with check (private.has_permission('rooms.inventory_manage'));

create policy guests_read on public.guests
for select to authenticated using (private.has_permission('guests.read'));
create policy reservations_read on public.reservations
for select to authenticated using (private.has_permission('reservations.read'));

create policy reservation_guests_read on public.reservation_guests
for select to authenticated using (private.has_permission('reservations.read'));

create policy room_assignments_read on public.room_assignments
for select to authenticated using (private.has_permission('reservations.read'));

create policy availability_blocks_read on public.availability_blocks
for select to authenticated using (private.has_permission('rooms.read'));
create policy availability_blocks_manage on public.availability_blocks
for all to authenticated
using (private.has_permission('rooms.inventory_manage'))
with check (private.has_permission('rooms.inventory_manage'));

create policy payments_read on public.payments
for select to authenticated using (private.has_permission('payments.read'));

create policy housekeeping_read on public.housekeeping_tasks
for select to authenticated using (private.has_permission('housekeeping.read'));
create policy housekeeping_manage on public.housekeeping_tasks
for all to authenticated
using (private.has_permission('housekeeping.manage'))
with check (private.has_permission('housekeeping.manage'));

create policy maintenance_read on public.maintenance_issues
for select to authenticated using (private.has_permission('maintenance.read'));
create policy maintenance_manage on public.maintenance_issues
for all to authenticated
using (private.has_permission('maintenance.manage'))
with check (private.has_permission('maintenance.manage'));

create policy internal_notes_read on public.internal_notes
for select to authenticated using (private.has_permission('notes.read'));

create policy activity_logs_read on public.activity_logs
for select to authenticated using (private.has_permission('activity.read'));
create policy audit_logs_read on public.audit_logs
for select to authenticated using (private.has_permission('audit.read'));

create policy settings_public_read on public.settings
for select to anon using (is_public);
create policy settings_staff_read on public.settings
for select to authenticated using (is_public or private.has_permission('settings.read'));
create policy settings_manage on public.settings
for all to authenticated
using (private.has_permission('settings.manage'))
with check (private.has_permission('settings.manage'));

create policy room_status_history_read on public.room_status_history
for select to authenticated using (private.has_permission('rooms.read'));
create policy reservation_status_history_read on public.reservation_status_history
for select to authenticated using (private.has_permission('reservations.read'));

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.settings to anon;
grant select on public.profiles, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.room_types, public.rooms, public.beds, public.guests,
  public.reservations, public.reservation_guests, public.room_assignments,
  public.availability_blocks, public.payments, public.housekeeping_tasks,
  public.maintenance_issues, public.internal_notes, public.activity_logs,
  public.audit_logs, public.settings, public.room_status_history,
  public.reservation_status_history to authenticated;
grant insert, update, delete on public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.room_types, public.rooms, public.beds,
  public.availability_blocks, public.housekeeping_tasks, public.maintenance_issues,
  public.settings to authenticated;
grant update on public.profiles to authenticated;
grant usage, select on sequence public.reservation_code_seq to authenticated;

commit;
