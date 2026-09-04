-- T1, LOCAL ONLY. Additive evolution; L1-L13 and business data are preserved.
-- No credentials, test identities, inventory, prices or booking/payment seeds.
begin;

-- Stable codes/IDs remain. Gerencia has operational capabilities; only owner
-- retains security-matrix/audit administration. Bar is prepared, not a POS.
update public.roles set name = 'Gerencia / Super admin' where code = 'owner';
update public.roles set name = 'Gerencia', description = 'Gestión operativa; matriz de seguridad reservada al propietario.' where code = 'admin';
insert into public.roles(code,name,description,is_system)
values ('bar','Barra','Preparado para T6; sin acceso a POS, huéspedes, reservas o finanzas en T1.',true)
on conflict (code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='admin' and p.code in ('media.read','media.manage','experiences.read','experiences.manage')
on conflict do nothing;
-- Revocation of a structural grant, not deletion of roles or business rows.
delete from public.role_permissions rp using public.roles r,public.permissions p
where rp.role_id=r.id and rp.permission_id=p.id and r.code='housekeeping' and p.code='rooms.read';

-- Keep broad task metadata for operations managers, not cleaning-only staff.
alter policy housekeeping_read on public.housekeeping_tasks
using ((select private.has_permission('housekeeping.read')) and (select private.has_permission('rooms.read')));
alter policy housekeeping_manage on public.housekeeping_tasks
using ((select private.has_permission('housekeeping.manage')) and (select private.has_permission('rooms.manage')))
with check ((select private.has_permission('housekeeping.manage')) and (select private.has_permission('rooms.manage')));
alter policy settings_staff_read on public.settings
using ((select private.has_permission('settings.read')));

-- A dedicated operational note must never reuse guest/financial/status notes.
alter table public.rooms add column if not exists cleaning_note text
check (cleaning_note is null or char_length(cleaning_note) <= 500);
comment on column public.rooms.cleaning_note is 'Minimal housekeeping instruction; no guest identities, documents or financial information.';

create or replace function public.get_housekeeping_room_state()
returns table (room_id uuid, code text, display_name text, sector text,
  status public.room_status, cleaning_note text, task_status public.task_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('housekeeping.read');
  return query
  select r.id,r.code,r.display_name,r.sector,r.status,r.cleaning_note,t.status
  from public.rooms r
  left join lateral (
    select h.status from public.housekeeping_tasks h
    where h.room_id=r.id and h.status not in ('completed','cancelled')
    order by h.created_at desc limit 1
  ) t on true
  where r.active order by r.code;
end;
$$;
revoke all on function public.get_housekeeping_room_state() from public,anon,authenticated,service_role;
grant execute on function public.get_housekeeping_room_state() to authenticated;
comment on function public.get_housekeeping_room_state() is 'Permission-checked projection: no personal, reservation, financial or private notes. Definer is necessary because cleaning staff cannot read the base tables.';

-- Restrict the existing definer RPC's reach for cleaning-only staff.
create or replace function private.guard_housekeeping_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and private.has_permission('housekeeping.manage')
    and not private.has_permission('rooms.manage')
    and (old.status not in ('pending_cleaning','cleaning','clean','ready')
      or new.status not in ('pending_cleaning','cleaning','clean','ready')) then
    raise exception using errcode='42501',message='HOUSEKEEPING_TRANSITION_FORBIDDEN';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_housekeeping_transition() from public,anon,authenticated,service_role;
drop trigger if exists guard_housekeeping_transition on public.rooms;
create trigger guard_housekeeping_transition before update of status on public.rooms
for each row when (old.status is distinct from new.status) execute function private.guard_housekeeping_transition();

-- Database-side validation closes the direct Data API path as well as the UI.
create or replace function private.validate_core_settings()
returns trigger language plpgsql set search_path = '' as $$
declare k text; v jsonb := new.value;
begin
  if new.key not in ('hostel.general','hostel.schedules','hostel.policies','pricing.base_price') then return new; end if;
  if jsonb_typeof(v) is distinct from 'object' or new.is_public then
    raise exception using errcode='22023',message='INVALID_CORE_SETTING';
  end if;
  if new.key='hostel.general' then
    foreach k in array array['name','descriptor','phone','whatsapp','email','address','city','province','country','website'] loop
      if jsonb_typeof(v->k) is distinct from 'string' or char_length(v->>k)>240 then
        raise exception using errcode='22023',message='INVALID_GENERAL_SETTING';
      end if;
    end loop;
    if char_length(trim(v->>'name'))<2 or char_length(trim(v->>'descriptor'))<2
      or (v->>'descriptor') ilike '%hotel boutique%'
      or (v->>'name') ilike '%hostel bauti%' or (v->>'name') ilike '%bauti hostel%' then
      raise exception using errcode='22023',message='INVALID_PUBLIC_BRAND';
    end if;
  elsif new.key='hostel.schedules' then
    foreach k in array array['checkInFrom','checkOutUntil','courtesyCheckoutUntil','breakfastFrom','breakfastUntil','quietHoursFrom','quietHoursUntil'] loop
      if jsonb_typeof(v->k) is distinct from 'string' or not coalesce((v->>k) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false) then
        raise exception using errcode='22023',message='INVALID_SCHEDULE';
      end if;
    end loop;
    if jsonb_typeof(v->'checkInUntil') is distinct from 'string'
      or ((v->>'checkInUntil') <> '' and not (v->>'checkInUntil') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      or v->'courtesyRequiresApproval' is distinct from 'true'::jsonb
      or v->>'courtesyCheckoutUntil' < v->>'checkOutUntil'
      or v->>'breakfastFrom' >= v->>'breakfastUntil'
      or ((v->>'checkInUntil') <> '' and v->>'checkInUntil' < v->>'checkInFrom') then
      raise exception using errcode='22023',message='INVALID_SCHEDULE';
    end if;
  elsif new.key='hostel.policies' then
    foreach k in array array['cancellation','minors','pets','residentPetsDisclosure','smoking','quietHours'] loop
      if jsonb_typeof(v->k) is distinct from 'string' or char_length(v->>k)>2000 then
        raise exception using errcode='22023',message='INVALID_POLICY';
      end if;
    end loop;
    if v->'guestPetsAllowed' is distinct from 'false'::jsonb
      or v->>'pets' <> 'No se admiten mascotas de huéspedes ni visitantes.' then
      raise exception using errcode='22023',message='GUEST_PETS_NOT_ALLOWED';
    end if;
  elsif not coalesce((v->>'amount') ~ '^[0-9]+$',false)
    or (v->>'amount')::numeric not between 1 and 100000000 or v->>'currency' is distinct from 'ARS' then
    raise exception using errcode='22023',message='INVALID_LEGACY_PRICE';
  end if;
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
revoke all on function private.validate_core_settings() from public,anon,authenticated,service_role;
drop trigger if exists validate_core_settings on public.settings;
create trigger validate_core_settings before insert or update on public.settings
for each row execute function private.validate_core_settings();

-- Audits record the changed key, never its value or potentially private content.
create or replace function private.audit_core_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id,action,table_name,old_values,new_values)
  values (auth.uid(),lower(tg_op),'settings',
    case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('key',old.key) end,
    case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('key',new.key) end);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_core_setting() from public,anon,authenticated,service_role;
drop trigger if exists audit_settings on public.settings;
create trigger audit_settings after insert or update or delete on public.settings
for each row execute function private.audit_core_setting();

-- Settings remain private rows. Only explicit public RPC projections expose data.
insert into public.settings(key,value,is_public,description) values
('hostel.general','{"name":"Casa Albor","descriptor":"Casa boutique · Estadías & Experiencias","address":"Uruguayana 235","city":"Ezeiza","province":"Buenos Aires","country":"Argentina","phone":"","whatsapp":"","email":"","website":""}',false,'Configuración canónica Casa Albor, Handoff V1.27.'),
('hostel.schedules','{"checkInFrom":"15:00","checkInUntil":"","checkOutUntil":"11:00","courtesyCheckoutUntil":"12:00","courtesyRequiresApproval":true,"breakfastFrom":"08:00","breakfastUntil":"10:00","quietHoursFrom":"23:00","quietHoursUntil":"08:00"}',false,'Horarios V1.27. Cortesía exclusivamente con autorización operativa.'),
('hostel.policies','{"cancellation":"","minors":"Los menores deben alojarse acompañados por una persona adulta responsable.","pets":"No se admiten mascotas de huéspedes ni visitantes.","guestPetsAllowed":false,"residentPetsDisclosure":"","smoking":"No está permitido fumar en interiores.","quietHours":"Durante el horario de descanso deben evitarse ruidos que molesten a otros huéspedes."}',false,'Políticas V1.27. Cancelación de alojamiento pendiente; no inferir reglas wellness.')
on conflict (key) do update set
  value = case
    when excluded.key='hostel.general' then excluded.value || public.settings.value || jsonb_build_object(
      'name','Casa Albor','descriptor','Casa boutique · Estadías & Experiencias',
      'address','Uruguayana 235','city','Ezeiza','province','Buenos Aires','country','Argentina')
    when excluded.key='hostel.schedules' then public.settings.value || excluded.value
    else public.settings.value || excluded.value
  end,
  is_public=false, description=excluded.description;
update public.settings set is_public=false,
  description='LEGACY: referencia interna de compatibilidad. No representa una tarifa pública canónica; motor comercial en T2.'
where key='pricing.base_price';

-- Versioned typed projection. No generic key parameter, prices or internal data.
create or replace function public.get_public_site_configuration_v127()
returns table (hostel_name text, descriptor text,phone text,whatsapp text,address text,
  city text,province text,country text,check_in_from text,check_in_until text,check_out_until text,
  courtesy_checkout_until text,courtesy_requires_approval boolean,breakfast_from text,breakfast_until text,
  quiet_hours_from text,quiet_hours_until text,cancellation_policy text,minors_policy text,
  pets_policy text,resident_pets_disclosure text,smoking_policy text,quiet_hours_policy text)
language sql stable security definer set search_path = '' as $$
  with config as (
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) as v from public.settings
    where key in ('hostel.general','hostel.schedules','hostel.policies')
  ) select v->'hostel.general'->>'name',v->'hostel.general'->>'descriptor',
    v->'hostel.general'->>'phone',v->'hostel.general'->>'whatsapp',v->'hostel.general'->>'address',
    v->'hostel.general'->>'city',v->'hostel.general'->>'province',v->'hostel.general'->>'country',
    v->'hostel.schedules'->>'checkInFrom',v->'hostel.schedules'->>'checkInUntil',v->'hostel.schedules'->>'checkOutUntil',
    v->'hostel.schedules'->>'courtesyCheckoutUntil',true,
    v->'hostel.schedules'->>'breakfastFrom',v->'hostel.schedules'->>'breakfastUntil',
    v->'hostel.schedules'->>'quietHoursFrom',v->'hostel.schedules'->>'quietHoursUntil',
    v->'hostel.policies'->>'cancellation',v->'hostel.policies'->>'minors',
    v->'hostel.policies'->>'pets',v->'hostel.policies'->>'residentPetsDisclosure',
    v->'hostel.policies'->>'smoking',v->'hostel.policies'->>'quietHours' from config;
$$;
revoke all on function public.get_public_site_configuration_v127() from public,anon,authenticated,service_role;
grant execute on function public.get_public_site_configuration_v127() to anon;
comment on function public.get_public_site_configuration_v127() is 'Anonymous, strictly typed public allowlist. Definer required to read private settings without granting the settings table to anon.';

-- Old return signature remains callable. Never advertise the legacy base price.
create or replace function public.get_public_site_configuration()
returns table (hostel_name text,phone text,whatsapp text,address text,city text,province text,
  base_price_ars numeric,check_in_from text,check_in_until text,check_out_until text,
  quiet_hours_from text,quiet_hours_until text,cancellation_policy text,minors_policy text,
  pets_policy text,smoking_policy text,quiet_hours_policy text)
language sql stable security definer set search_path = '' as $$
  select c.hostel_name,c.phone,c.whatsapp,c.address,c.city,c.province,null::numeric,
    c.check_in_from,c.check_in_until,c.check_out_until,c.quiet_hours_from,c.quiet_hours_until,
    c.cancellation_policy,c.minors_policy,c.pets_policy,c.smoking_policy,c.quiet_hours_policy
  from public.get_public_site_configuration_v127() c;
$$;
revoke all on function public.get_public_site_configuration() from public,anon,authenticated,service_role;
grant execute on function public.get_public_site_configuration() to anon;
revoke select on public.settings from anon;

-- Read-only compatibility state. No writes/backfill or new financial total.
create or replace view public.reservation_lifecycle with (security_invoker=true) as
select r.id as reservation_id,r.status as legacy_status,
  case when r.status not in ('partially_paid','paid') then r.status::text
    when r.actual_check_out_at is not null then 'checked_out'
    when r.actual_check_in_at is not null then 'checked_in'
    when r.status in ('partially_paid','paid') then 'confirmed'
    else r.status::text end as lifecycle_status
from public.reservations r;
revoke all on public.reservation_lifecycle from public,anon,authenticated,service_role;
grant select on public.reservation_lifecycle to authenticated;
comment on view public.reservation_lifecycle is 'T1 compatibility projection, not a new stored state. Payment lifecycle derives independently from posted/voided ledger and reservation_financials. Legacy enum transition deferred to T3.';

commit;
