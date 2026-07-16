begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.profile_status as enum ('pending', 'active', 'disabled');
create type public.room_status as enum (
  'available', 'reserved', 'occupied', 'pending_cleaning', 'cleaning',
  'clean', 'ready', 'maintenance', 'blocked', 'out_of_service'
);
create type public.reservation_status as enum (
  'inquiry', 'pending', 'pending_deposit', 'confirmed', 'partially_paid',
  'paid', 'checked_in', 'accommodated', 'checked_out', 'completed',
  'cancelled', 'no_show', 'rejected'
);
create type public.reservation_source as enum (
  'phone', 'whatsapp', 'instagram', 'walk_in', 'web', 'booking',
  'airbnb', 'referral', 'other'
);
create type public.assignment_status as enum ('active', 'cancelled');
create type public.payment_direction as enum ('charge', 'refund');
create type public.payment_status as enum ('posted', 'voided');
create type public.payment_method as enum (
  'cash', 'transfer', 'mercado_pago', 'card', 'other'
);
create type public.task_status as enum (
  'pending', 'assigned', 'in_progress', 'review', 'completed', 'cancelled'
);
create type public.issue_priority as enum ('low', 'medium', 'high', 'critical');
create type public.issue_status as enum (
  'open', 'pending', 'review', 'in_progress', 'resolved', 'closed'
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  phone text,
  status public.profile_status not null default 'pending',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_.]{2,79}$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name text not null check (char_length(name) between 2 and 100),
  description text,
  default_capacity smallint not null check (default_capacity between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid references public.room_types(id) on delete restrict,
  code text not null unique check (char_length(code) between 1 and 30),
  display_name text not null check (char_length(display_name) between 1 and 100),
  capacity smallint not null check (capacity between 1 and 30),
  status public.room_status not null default 'out_of_service',
  status_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  code text not null,
  bed_type text not null check (bed_type in ('single', 'double', 'bunk_single', 'crib', 'other')),
  capacity smallint not null default 1 check (capacity between 1 and 4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, code)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null check (char_length(last_name) between 1 and 100),
  phone text not null check (char_length(phone) between 6 and 40),
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9+]', '', 'g')) stored,
  email text,
  document_type text check (document_type is null or document_type in ('dni', 'passport', 'other')),
  document_number text,
  nationality_code char(2),
  birth_date date,
  emergency_contact jsonb,
  consent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((document_type is null) = (document_number is null))
);

create unique index guests_document_unique
  on public.guests (document_type, upper(document_number))
  where document_number is not null and deleted_at is null;
create index guests_phone_idx on public.guests (phone_normalized) where deleted_at is null;

create sequence public.reservation_code_seq start 1;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('RES-' || lpad(nextval('public.reservation_code_seq')::text, 8, '0')),
  primary_guest_id uuid not null references public.guests(id) on delete restrict,
  guest_count smallint not null check (guest_count between 1 and 30),
  check_in date not null,
  check_out date not null,
  expected_arrival time,
  status public.reservation_status not null default 'pending',
  source public.reservation_source not null,
  nightly_rate numeric(14,2) not null check (nightly_rate >= 0),
  agreed_total numeric(14,2) not null check (agreed_total >= 0),
  currency char(3) not null default 'ARS' check (currency = upper(currency)),
  internal_summary text,
  actual_check_in_at timestamptz,
  actual_check_out_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (check_out > check_in),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check (status not in ('cancelled', 'rejected') or cancellation_reason is not null)
);

create index reservations_dates_idx on public.reservations (check_in, check_out);
create index reservations_status_idx on public.reservations (status) where deleted_at is null;
create index reservations_guest_idx on public.reservations (primary_guest_id) where deleted_at is null;

create table public.reservation_guests (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (reservation_id, guest_id)
);

create unique index reservation_single_primary_guest
  on public.reservation_guests (reservation_id)
  where is_primary;

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  status public.assignment_status not null default 'active',
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (reservation_id, room_id, check_in, check_out)
);

alter table public.room_assignments
  add constraint room_assignments_no_overlap
  exclude using gist (room_id with =, stay with &&)
  where (status = 'active');

create index room_assignments_reservation_idx on public.room_assignments (reservation_id);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  status public.assignment_status not null default 'active',
  reason text not null check (char_length(reason) between 2 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

alter table public.availability_blocks
  add constraint availability_blocks_no_overlap
  exclude using gist (room_id with =, stay with &&)
  where (status = 'active');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  guest_id uuid references public.guests(id) on delete restrict,
  direction public.payment_direction not null default 'charge',
  status public.payment_status not null default 'posted',
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'ARS' check (currency = upper(currency)),
  method public.payment_method not null,
  reference text,
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  voided_by uuid references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null)),
  check ((voided_at is null) = (voided_by is null))
);

create index payments_reservation_idx on public.payments (reservation_id, occurred_at desc);

create table public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  status public.task_status not null default 'pending',
  priority public.issue_priority not null default 'medium',
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index housekeeping_open_idx on public.housekeeping_tasks (status, due_at)
  where status not in ('completed', 'cancelled');

create table public.maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete restrict,
  area text not null check (char_length(area) between 1 and 120),
  title text not null check (char_length(title) between 2 and 180),
  description text,
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  blocks_inventory boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((resolved_at is null) = (resolved_by is null))
);

create index maintenance_open_idx on public.maintenance_issues (priority, status)
  where status not in ('resolved', 'closed');

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('general', 'guest', 'reservation', 'room', 'payment', 'issue')),
  entity_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  visibility text not null default 'staff' check (visibility in ('management', 'reception', 'staff')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index internal_notes_entity_idx on public.internal_notes (entity_type, entity_id, created_at desc)
  where deleted_at is null;

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create table public.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_status_history (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete restrict,
  previous_status public.room_status,
  new_status public.room_status not null,
  reason text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create table public.reservation_status_history (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  previous_status public.reservation_status,
  new_status public.reservation_status not null,
  reason text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create function private.assert_room_calendar_available()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.room_id::text, 0));

  if tg_table_name = 'room_assignments' then
    if exists (
      select 1
      from public.availability_blocks b
      where b.room_id = new.room_id
        and b.status = 'active'
        and b.stay && daterange(new.check_in, new.check_out, '[)')
    ) then
      raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
    end if;
  elsif exists (
    select 1
    from public.room_assignments a
    where a.room_id = new.room_id
      and a.status = 'active'
      and a.stay && daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  end if;

  return new;
end;
$$;

create trigger room_assignments_calendar_guard
before insert or update of room_id, check_in, check_out, status
on public.room_assignments
for each row execute function private.assert_room_calendar_available();

create trigger availability_blocks_calendar_guard
before insert or update of room_id, check_in, check_out, status
on public.availability_blocks
for each row execute function private.assert_room_calendar_available();

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger roles_updated_at before update on public.roles
for each row execute function private.set_updated_at();
create trigger room_types_updated_at before update on public.room_types
for each row execute function private.set_updated_at();
create trigger rooms_updated_at before update on public.rooms
for each row execute function private.set_updated_at();
create trigger beds_updated_at before update on public.beds
for each row execute function private.set_updated_at();
create trigger guests_updated_at before update on public.guests
for each row execute function private.set_updated_at();
create trigger reservations_updated_at before update on public.reservations
for each row execute function private.set_updated_at();
create trigger room_assignments_updated_at before update on public.room_assignments
for each row execute function private.set_updated_at();
create trigger availability_blocks_updated_at before update on public.availability_blocks
for each row execute function private.set_updated_at();
create trigger housekeeping_tasks_updated_at before update on public.housekeeping_tasks
for each row execute function private.set_updated_at();
create trigger maintenance_issues_updated_at before update on public.maintenance_issues
for each row execute function private.set_updated_at();
create trigger internal_notes_updated_at before update on public.internal_notes
for each row execute function private.set_updated_at();
create trigger settings_updated_at before update on public.settings
for each row execute function private.set_updated_at();

-- Deliberadamente no se insertan habitaciones, camas, huéspedes, reservas ni pagos.
-- El inventario productivo comienza vacío y debe cargarse con información confirmada.

commit;
