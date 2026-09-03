begin;

-- Unified wellness inventory. Business data is intentionally not seeded.
create type public.wellness_product_type as enum (
  'circuit_relax', 'day_pass_relax', 'club_relax'
);
create type public.wellness_slot_status as enum ('open', 'blocked');
create type public.wellness_booking_status as enum (
  'pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'
);
create type public.wellness_source as enum (
  'web', 'whatsapp', 'phone', 'walk_in', 'instagram', 'referral', 'admin', 'other'
);
create type public.wellness_settlement_type as enum ('payment', 'membership_credit');

create sequence public.wellness_booking_code_seq start 1;

create table public.wellness_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name text not null check (char_length(name) between 2 and 120),
  product_type public.wellness_product_type not null,
  description text,
  active boolean not null default false,
  sales_enabled boolean not null default false,
  duration_minutes smallint not null check (duration_minutes between 1 and 1440),
  currency char(3) not null default 'ARS' check (currency = upper(currency)),
  pricing_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(pricing_rules) = 'object'),
  policy_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_rules) = 'object'),
  instructions text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not sales_enabled or active),
  check (product_type <> 'club_relax' or not sales_enabled)
);

create table public.wellness_slots (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity_limit smallint check (capacity_limit is null or capacity_limit > 0),
  external_capacity_limit smallint check (external_capacity_limit is null or external_capacity_limit > 0),
  guest_buffer smallint not null default 0 check (guest_buffer >= 0),
  sales_enabled boolean not null default false,
  status public.wellness_slot_status not null default 'blocked',
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (start_at, end_at),
  check (end_at > start_at),
  check (
    capacity_limit is null or external_capacity_limit is null
    or external_capacity_limit + guest_buffer <= capacity_limit
  ),
  check (
    not sales_enabled
    or (capacity_limit is not null and external_capacity_limit is not null)
  )
);

-- Generic financial reference for sellable concepts beyond room reservations.
create table public.financial_references (
  id uuid primary key default gen_random_uuid(),
  reference_type text not null check (reference_type ~ '^[a-z][a-z0-9_]{2,49}$'),
  reference_id uuid not null,
  guest_id uuid references public.guests(id) on delete restrict,
  currency char(3) not null default 'ARS' check (currency = upper(currency)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (reference_type, reference_id)
);

create table public.wellness_bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default (
    'WEL-' || lpad(nextval('public.wellness_booking_code_seq')::text, 8, '0')
  ),
  financial_reference_id uuid not null unique references public.financial_references(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  product_id uuid not null references public.wellness_products(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  party_size smallint not null check (party_size between 1 and 30),
  capacity_units smallint not null check (capacity_units between 1 and 30),
  source public.wellness_source not null,
  status public.wellness_booking_status not null default 'pending_payment',
  settlement_type public.wellness_settlement_type not null default 'payment',
  price_snapshot jsonb not null check (jsonb_typeof(price_snapshot) = 'object'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  total numeric(14,2) not null check (total > 0),
  currency char(3) not null default 'ARS' check (currency = upper(currency)),
  notes text,
  actual_check_in_at timestamptz,
  actual_end_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (capacity_units = party_size),
  check (
    (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and nullif(trim(cancellation_reason), '') is not null
    )
    or (
      status <> 'cancelled'
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
  )
);

create table public.wellness_booking_slots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.wellness_bookings(id) on delete restrict,
  slot_id uuid not null references public.wellness_slots(id) on delete restrict,
  capacity_units smallint not null check (capacity_units between 1 and 30),
  created_at timestamptz not null default now(),
  unique (booking_id, slot_id)
);

create table public.wellness_booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.wellness_bookings(id) on delete restrict,
  event_type text not null check (event_type in (
    'RESERVATION_CREATED', 'PAYMENT_REGISTERED', 'RESERVATION_CONFIRMED',
    'CANCELLED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'ADMIN_OVERRIDE'
  )),
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payments alter column reservation_id drop not null;
alter table public.payments
  add column financial_reference_id uuid references public.financial_references(id) on delete restrict;
alter table public.payments
  add constraint payments_single_financial_target
  check (num_nonnulls(reservation_id, financial_reference_id) = 1);

create index wellness_products_type_idx on public.wellness_products (product_type, active, sales_enabled);
create index wellness_products_created_by_idx on public.wellness_products (created_by);
create index wellness_products_updated_by_idx on public.wellness_products (updated_by);
create index wellness_slots_start_idx on public.wellness_slots (start_at, end_at);
create index wellness_slots_created_by_idx on public.wellness_slots (created_by);
create index wellness_slots_updated_by_idx on public.wellness_slots (updated_by);
create index wellness_bookings_start_idx on public.wellness_bookings (start_at, status);
create index wellness_bookings_guest_idx on public.wellness_bookings (guest_id, start_at desc);
create index wellness_bookings_product_idx on public.wellness_bookings (product_id, start_at desc);
create index wellness_bookings_created_by_idx on public.wellness_bookings (created_by);
create index wellness_bookings_updated_by_idx on public.wellness_bookings (updated_by);
create index wellness_bookings_cancelled_by_idx on public.wellness_bookings (cancelled_by)
  where cancelled_by is not null;
create index wellness_booking_slots_slot_idx on public.wellness_booking_slots (slot_id, booking_id);
create index wellness_booking_events_booking_idx on public.wellness_booking_events (booking_id, created_at desc);
create index wellness_booking_events_actor_idx on public.wellness_booking_events (actor_id)
  where actor_id is not null;
create index financial_references_guest_idx on public.financial_references (guest_id, created_at desc);
create index financial_references_created_by_idx on public.financial_references (created_by);
create index payments_financial_reference_idx on public.payments (financial_reference_id, occurred_at desc)
  where financial_reference_id is not null;

create trigger wellness_products_updated_at before update on public.wellness_products
for each row execute function private.set_updated_at();
create trigger wellness_slots_updated_at before update on public.wellness_slots
for each row execute function private.set_updated_at();
create trigger wellness_bookings_updated_at before update on public.wellness_bookings
for each row execute function private.set_updated_at();

create trigger audit_wellness_products after insert or update or delete on public.wellness_products
for each row execute function private.capture_sensitive_change();
create trigger audit_wellness_slots after insert or update or delete on public.wellness_slots
for each row execute function private.capture_sensitive_change();
create trigger audit_financial_references after insert or update or delete on public.financial_references
for each row execute function private.capture_sensitive_change();
create trigger audit_wellness_bookings after insert or update or delete on public.wellness_bookings
for each row execute function private.capture_sensitive_change();
create trigger audit_wellness_booking_slots after insert or update or delete on public.wellness_booking_slots
for each row execute function private.capture_sensitive_change();

create function private.guard_wellness_payment_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.financial_reference_id is not null
     and old.status = 'posted' and new.status = 'voided'
     and exists (
       select 1
       from public.financial_references reference
       where reference.id = old.financial_reference_id
         and reference.reference_type = 'wellness_booking'
     ) then
    raise exception using errcode = '23514', message = 'WELLNESS_PAYMENT_VOID_REQUIRES_CANCELLATION';
  end if;
  return new;
end;
$$;

create trigger wellness_payment_void_guard
before update of status on public.payments
for each row execute function private.guard_wellness_payment_void();

create function private.wellness_price_snapshot(
  p_product public.wellness_products,
  p_start_at timestamptz,
  p_party_size smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_date date := (p_start_at at time zone 'America/Argentina/Buenos_Aires')::date;
  v_day_kind text;
  v_party_kind text;
  v_amount numeric(14,2);
begin
  if p_party_size not in (1, 2) then
    raise exception using errcode = '22023', message = 'INVALID_PARTY_SIZE';
  end if;
  v_party_kind := case when p_party_size = 1 then 'individual' else 'couple' end;

  begin
    if p_product.product_type = 'circuit_relax' then
      v_day_kind := 'fixed';
      v_amount := (p_product.pricing_rules ->> v_party_kind)::numeric;
    elsif p_product.product_type = 'day_pass_relax' then
      if coalesce(p_product.pricing_rules -> 'holiday_dates', '[]'::jsonb) ? v_local_date::text
         or extract(isodow from v_local_date) in (6, 7) then
        v_day_kind := 'weekend_holiday';
      elsif extract(isodow from v_local_date) = 5 then
        v_day_kind := 'friday';
      else
        v_day_kind := 'mon_thu';
      end if;
      v_amount := (p_product.pricing_rules -> v_day_kind ->> v_party_kind)::numeric;
    else
      raise exception using errcode = '22023', message = 'CLUB_RELAX_NOT_AVAILABLE';
    end if;
  exception when others then
    if sqlerrm = 'CLUB_RELAX_NOT_AVAILABLE' then raise; end if;
    raise exception using errcode = '22023', message = 'PRICE_CONFIGURATION_REQUIRED';
  end;

  if v_amount is null or v_amount <= 0 then
    raise exception using errcode = '22023', message = 'PRICE_CONFIGURATION_REQUIRED';
  end if;

  return jsonb_build_object(
    'amount', v_amount,
    'currency', p_product.currency,
    'partyKind', v_party_kind,
    'dayKind', v_day_kind,
    'productCode', p_product.code,
    'productName', p_product.name,
    'productType', p_product.product_type,
    'productUpdatedAt', p_product.updated_at
  );
end;
$$;

create function private.lock_wellness_capacity(
  p_booking_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_capacity_units smallint,
  p_expected_slots smallint
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.wellness_slots%rowtype;
  v_slot_ids uuid[] := array[]::uuid[];
  v_booked integer;
begin
  for v_slot in
    select slot.*
    from public.wellness_slots slot
    where slot.start_at < p_end_at and slot.end_at > p_start_at
    order by slot.start_at, slot.id
    for update
  loop
    if v_slot.status <> 'open' or not v_slot.sales_enabled
       or v_slot.capacity_limit is null or v_slot.external_capacity_limit is null then
      raise exception using errcode = '23514', message = 'WELLNESS_CAPACITY_NOT_CONFIGURED';
    end if;

    select coalesce(sum(allocation.capacity_units), 0)::integer
      into v_booked
    from public.wellness_booking_slots allocation
    join public.wellness_bookings booking on booking.id = allocation.booking_id
    where allocation.slot_id = v_slot.id
      and booking.status in ('confirmed', 'checked_in', 'completed', 'no_show')
      and (p_booking_id is null or booking.id <> p_booking_id);

    if v_booked + p_capacity_units > v_slot.external_capacity_limit then
      raise exception using errcode = '23P01', message = 'WELLNESS_CAPACITY_EXCEEDED';
    end if;
    v_slot_ids := array_append(v_slot_ids, v_slot.id);
  end loop;

  if cardinality(v_slot_ids) <> p_expected_slots then
    raise exception using errcode = '23514', message = 'WELLNESS_REQUIRED_SLOTS_MISSING';
  end if;
  return v_slot_ids;
end;
$$;

create function private.log_wellness_event(
  p_booking_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.wellness_booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, p_event_type, auth.uid(), coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create view public.wellness_slot_availability
with (security_invoker = true)
as
select
  slot.id,
  slot.start_at,
  slot.end_at,
  slot.capacity_limit,
  slot.external_capacity_limit,
  slot.guest_buffer,
  slot.sales_enabled,
  slot.status,
  coalesce(sum(allocation.capacity_units) filter (
    where booking.status in ('confirmed', 'checked_in', 'completed', 'no_show')
  ), 0)::integer as booked_external,
  case
    when slot.status <> 'open' or not slot.sales_enabled or slot.external_capacity_limit is null then null
    else greatest(slot.external_capacity_limit - coalesce(sum(allocation.capacity_units) filter (
      where booking.status in ('confirmed', 'checked_in', 'completed', 'no_show')
    ), 0), 0)::integer
  end as available_external
from public.wellness_slots slot
left join public.wellness_booking_slots allocation on allocation.slot_id = slot.id
left join public.wellness_bookings booking on booking.id = allocation.booking_id
group by slot.id;

create view public.wellness_booking_financials
with (security_invoker = true)
as
select
  booking.id as booking_id,
  coalesce(sum(
    case
      when payment.status <> 'posted' then 0
      when payment.direction = 'charge' then payment.amount
      else -payment.amount
    end
  ), 0)::numeric(14,2) as amount_paid,
  greatest(booking.total - coalesce(sum(
    case
      when payment.status <> 'posted' then 0
      when payment.direction = 'charge' then payment.amount
      else -payment.amount
    end
  ), 0), 0)::numeric(14,2) as balance_due
from public.wellness_bookings booking
left join public.payments payment on payment.financial_reference_id = booking.financial_reference_id
group by booking.id, booking.total;

alter table public.wellness_products enable row level security;
alter table public.wellness_slots enable row level security;
alter table public.financial_references enable row level security;
alter table public.wellness_bookings enable row level security;
alter table public.wellness_booking_slots enable row level security;
alter table public.wellness_booking_events enable row level security;

create policy wellness_products_read on public.wellness_products
for select to authenticated using ((select private.has_permission('experiences.read')));
create policy wellness_slots_read on public.wellness_slots
for select to authenticated using ((select private.has_permission('experiences.read')));
create policy financial_references_read on public.financial_references
for select to authenticated using (
  (
    reference_type = 'wellness_booking'
    and (select private.has_permission('experiences.read'))
  )
  or (select private.has_permission('payments.read'))
);
create policy wellness_bookings_read on public.wellness_bookings
for select to authenticated using ((select private.has_permission('experiences.read')));
create policy wellness_booking_slots_read on public.wellness_booking_slots
for select to authenticated using ((select private.has_permission('experiences.read')));
create policy wellness_booking_events_read on public.wellness_booking_events
for select to authenticated using ((select private.has_permission('experiences.read')));
create policy wellness_payments_read on public.payments
for select to authenticated using (
  financial_reference_id is not null
  and (select private.has_permission('experiences.read'))
  and exists (
    select 1
    from public.financial_references reference
    where reference.id = payments.financial_reference_id
      and reference.reference_type = 'wellness_booking'
  )
);

revoke all on public.wellness_products, public.wellness_slots, public.financial_references,
  public.wellness_bookings, public.wellness_booking_slots, public.wellness_booking_events
  from public, anon, authenticated;
grant select on public.wellness_products, public.wellness_slots, public.financial_references,
  public.wellness_bookings, public.wellness_booking_slots, public.wellness_booking_events
  to authenticated;
revoke all on public.wellness_slot_availability, public.wellness_booking_financials
  from public, anon, authenticated;
grant select on public.wellness_slot_availability, public.wellness_booking_financials
  to authenticated;

insert into public.permissions (code, description) values
  ('experiences.read', 'Ver productos, turnos, reservas y capacidad wellness.'),
  ('experiences.manage', 'Administrar productos, capacidad y operación wellness.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('experiences.read', 'experiences.manage')
where role.code = 'owner'
on conflict do nothing;

create function public.save_wellness_product(p_product_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_type public.wellness_product_type;
  v_duration smallint;
  v_active boolean;
  v_sales_enabled boolean;
  v_currency text;
  v_pricing jsonb;
  v_policy jsonb;
  v_existing public.wellness_products%rowtype;
begin
  perform private.require_permission('experiences.manage');
  perform private.enforce_rate_limit('save_wellness_product', 30, interval '1 minute');
  begin
    v_type := (p_payload ->> 'productType')::public.wellness_product_type;
    v_duration := (p_payload ->> 'durationMinutes')::smallint;
    v_active := coalesce((p_payload ->> 'active')::boolean, false);
    v_sales_enabled := coalesce((p_payload ->> 'salesEnabled')::boolean, false);
    v_currency := coalesce(nullif(upper(trim(p_payload ->> 'currency')), ''), 'ARS');
    v_pricing := coalesce(p_payload -> 'pricingRules', '{}'::jsonb);
    v_policy := coalesce(p_payload -> 'policyRules', '{}'::jsonb);
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_PRODUCT';
  end;

  if char_length(trim(coalesce(p_payload ->> 'code', ''))) < 2
     or char_length(trim(coalesce(p_payload ->> 'name', ''))) < 2
     or jsonb_typeof(v_pricing) <> 'object' or jsonb_typeof(v_policy) <> 'object'
     or v_currency <> 'ARS' or (v_sales_enabled and not v_active) then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_PRODUCT';
  end if;
  if (v_type = 'circuit_relax' and v_duration <> 180)
     or (v_type = 'day_pass_relax' and v_duration <> 540)
     or (v_type = 'club_relax' and v_sales_enabled) then
    raise exception using errcode = '23514', message = 'INVALID_WELLNESS_PRODUCT_RULES';
  end if;
  begin
    if v_type = 'circuit_relax' then
      if coalesce((v_pricing ->> 'individual')::numeric, 0) <= 0
         or coalesce((v_pricing ->> 'couple')::numeric, 0) <= 0 then
        raise exception 'invalid';
      end if;
    elsif v_type = 'day_pass_relax' then
      if jsonb_typeof(v_pricing -> 'holiday_dates') <> 'array'
         or coalesce((v_pricing -> 'mon_thu' ->> 'individual')::numeric, 0) <= 0
         or coalesce((v_pricing -> 'mon_thu' ->> 'couple')::numeric, 0) <= 0
         or coalesce((v_pricing -> 'friday' ->> 'individual')::numeric, 0) <= 0
         or coalesce((v_pricing -> 'friday' ->> 'couple')::numeric, 0) <= 0
         or coalesce((v_pricing -> 'weekend_holiday' ->> 'individual')::numeric, 0) <= 0
         or coalesce((v_pricing -> 'weekend_holiday' ->> 'couple')::numeric, 0) <= 0 then
        raise exception 'invalid';
      end if;
    elsif v_pricing <> '{}'::jsonb then
      raise exception 'invalid';
    end if;

    if (v_policy ? 'rebookingHours' and (v_policy ->> 'rebookingHours')::integer < 0)
       or (v_policy ? 'lateCancellationCreditPercent'
           and (v_policy ->> 'lateCancellationCreditPercent')::integer not between 0 and 100)
       or (v_policy ? 'noShowCreditPercent'
           and (v_policy ->> 'noShowCreditPercent')::integer not between 0 and 100) then
      raise exception 'invalid';
    end if;
    if v_sales_enabled and not (
      v_policy ? 'rebookingHours'
      and v_policy ? 'lateCancellationCreditPercent'
      and v_policy ? 'noShowCreditPercent'
    ) then
      raise exception 'invalid';
    end if;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_PRODUCT_RULES';
  end;

  if p_product_id is null then
    insert into public.wellness_products (
      code, name, product_type, description, active, sales_enabled, duration_minutes,
      currency, pricing_rules, policy_rules, instructions, created_by, updated_by
    ) values (
      lower(trim(p_payload ->> 'code')), trim(p_payload ->> 'name'), v_type,
      nullif(trim(p_payload ->> 'description'), ''),
      v_active, v_sales_enabled, v_duration, v_currency,
      v_pricing, v_policy, nullif(trim(p_payload ->> 'instructions'), ''), auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    select * into v_existing from public.wellness_products where id = p_product_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'WELLNESS_PRODUCT_NOT_FOUND';
    end if;
    if v_type <> v_existing.product_type and exists (
      select 1 from public.wellness_bookings where product_id = p_product_id
    ) then
      raise exception using errcode = '23514', message = 'PRODUCT_TYPE_HAS_EXISTING_BOOKINGS';
    end if;
    update public.wellness_products
    set code = lower(trim(p_payload ->> 'code')),
        name = trim(p_payload ->> 'name'),
        product_type = v_type,
        description = nullif(trim(p_payload ->> 'description'), ''),
        active = v_active,
        sales_enabled = v_sales_enabled,
        duration_minutes = v_duration,
        currency = v_currency,
        pricing_rules = v_pricing,
        policy_rules = v_policy,
        instructions = nullif(trim(p_payload ->> 'instructions'), ''),
        updated_by = auth.uid()
    where id = p_product_id
    returning id into v_id;
  end if;

  perform private.log_activity(
    'wellness.product_saved', 'wellness_product', v_id,
    'Producto wellness guardado.', jsonb_build_object('productType', v_type)
  );
  return jsonb_build_object('productId', v_id);
exception when unique_violation then
  raise exception using errcode = '23505', message = 'WELLNESS_PRODUCT_CODE_EXISTS';
end;
$$;

create function public.save_wellness_slot(p_slot_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_start_local timestamp;
  v_end_local timestamp;
  v_capacity smallint;
  v_external smallint;
  v_buffer smallint;
  v_sales_enabled boolean;
  v_status public.wellness_slot_status;
  v_booked integer;
  v_existing public.wellness_slots%rowtype;
begin
  perform private.require_permission('experiences.manage');
  perform private.enforce_rate_limit('save_wellness_slot', 60, interval '1 minute');
  begin
    v_start_at := (p_payload ->> 'startAt')::timestamptz;
    v_end_at := (p_payload ->> 'endAt')::timestamptz;
    v_capacity := nullif(p_payload ->> 'capacityLimit', '')::smallint;
    v_external := nullif(p_payload ->> 'externalCapacityLimit', '')::smallint;
    v_buffer := coalesce(nullif(p_payload ->> 'guestBuffer', '')::smallint, 0);
    v_sales_enabled := coalesce((p_payload ->> 'salesEnabled')::boolean, false);
    v_status := coalesce((p_payload ->> 'status')::public.wellness_slot_status, 'blocked');
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_SLOT';
  end;

  v_start_local := v_start_at at time zone 'America/Argentina/Buenos_Aires';
  v_end_local := v_end_at at time zone 'America/Argentina/Buenos_Aires';
  if v_start_local::date <> v_end_local::date
     or not (
       (v_start_local::time = time '10:00' and v_end_local::time = time '13:00')
       or (v_start_local::time = time '14:00' and v_end_local::time = time '17:00')
       or (v_start_local::time = time '18:00' and v_end_local::time = time '21:00')
     ) then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_SLOT';
  end if;
  if v_buffer < 0 or (v_capacity is not null and v_capacity <= 0)
     or (v_external is not null and v_external <= 0)
     or (v_capacity is not null and v_external is not null and v_external + v_buffer > v_capacity)
     or (v_sales_enabled and (v_capacity is null or v_external is null)) then
    raise exception using errcode = '23514', message = 'INVALID_WELLNESS_CAPACITY';
  end if;

  if p_slot_id is null then
    insert into public.wellness_slots (
      start_at, end_at, capacity_limit, external_capacity_limit, guest_buffer,
      sales_enabled, status, notes, created_by, updated_by
    ) values (
      v_start_at, v_end_at, v_capacity, v_external, v_buffer,
      v_sales_enabled, v_status, nullif(trim(p_payload ->> 'notes'), ''), auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    select * into v_existing from public.wellness_slots where id = p_slot_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'WELLNESS_SLOT_NOT_FOUND';
    end if;
    select coalesce(sum(allocation.capacity_units), 0)::integer into v_booked
    from public.wellness_booking_slots allocation
    join public.wellness_bookings booking on booking.id = allocation.booking_id
    where allocation.slot_id = p_slot_id
      and booking.status in ('confirmed', 'checked_in', 'completed', 'no_show');
    if v_booked > 0 and (v_capacity is null or v_external is null or v_external < v_booked) then
      raise exception using errcode = '23514', message = 'CAPACITY_BELOW_EXISTING_BOOKINGS';
    end if;
    if v_booked > 0 and (v_start_at <> v_existing.start_at or v_end_at <> v_existing.end_at) then
      raise exception using errcode = '23514', message = 'SLOT_TIME_HAS_EXISTING_BOOKINGS';
    end if;
    update public.wellness_slots
    set start_at = v_start_at, end_at = v_end_at,
        capacity_limit = v_capacity, external_capacity_limit = v_external,
        guest_buffer = v_buffer, sales_enabled = v_sales_enabled, status = v_status,
        notes = nullif(trim(p_payload ->> 'notes'), ''), updated_by = auth.uid()
    where id = p_slot_id
    returning id into v_id;
  end if;

  perform private.log_activity(
    'ADMIN_OVERRIDE', 'wellness_slot', v_id, 'Configuración de capacidad wellness actualizada.',
    jsonb_build_object('salesEnabled', v_sales_enabled, 'status', v_status)
  );
  return jsonb_build_object('slotId', v_id);
exception when unique_violation then
  raise exception using errcode = '23505', message = 'WELLNESS_SLOT_EXISTS';
end;
$$;

create function public.create_wellness_booking(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.wellness_products%rowtype;
  v_booking_id uuid := gen_random_uuid();
  v_financial_reference_id uuid;
  v_payment_id uuid;
  v_guest_id uuid;
  v_product_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_start_local timestamp;
  v_party_size smallint;
  v_source public.wellness_source;
  v_method public.payment_method;
  v_expected_slots smallint;
  v_slot_ids uuid[];
  v_price_snapshot jsonb;
  v_total numeric(14,2);
begin
  perform private.require_permission('experiences.manage');
  perform private.require_permission('payments.manage');
  perform private.enforce_rate_limit('create_wellness_booking', 20, interval '1 minute');
  begin
    v_guest_id := (p_payload ->> 'guestId')::uuid;
    v_product_id := (p_payload ->> 'productId')::uuid;
    v_start_at := (p_payload ->> 'startAt')::timestamptz;
    v_party_size := (p_payload ->> 'partySize')::smallint;
    v_source := (p_payload ->> 'source')::public.wellness_source;
    v_method := (p_payload ->> 'paymentMethod')::public.payment_method;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
  end;

  select * into v_product
  from public.wellness_products product
  where product.id = v_product_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'WELLNESS_PRODUCT_NOT_FOUND';
  end if;
  if not v_product.active or not v_product.sales_enabled then
    raise exception using errcode = '23514', message = 'WELLNESS_PRODUCT_NOT_SELLABLE';
  end if;
  if v_product.product_type = 'club_relax' then
    raise exception using errcode = '23514', message = 'CLUB_RELAX_NOT_AVAILABLE';
  end if;
  if not exists (select 1 from public.guests where id = v_guest_id and deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'GUEST_NOT_FOUND';
  end if;

  v_start_local := v_start_at at time zone 'America/Argentina/Buenos_Aires';
  if v_product.product_type = 'circuit_relax' then
    if v_party_size not in (1, 2) or v_product.duration_minutes <> 180
       or v_start_local::time not in (time '10:00', time '14:00', time '18:00') then
      raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
    end if;
    v_end_at := v_start_at + interval '3 hours';
    v_expected_slots := 1;
  else
    if v_party_size not in (1, 2) or v_product.duration_minutes <> 540
       or v_start_local::time <> time '10:00' then
      raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
    end if;
    v_end_at := v_start_at + interval '9 hours';
    v_expected_slots := 3;
  end if;
  if v_start_at <= now() then
    raise exception using errcode = '22023', message = 'WELLNESS_START_MUST_BE_FUTURE';
  end if;

  v_price_snapshot := private.wellness_price_snapshot(v_product, v_start_at, v_party_size);
  v_total := (v_price_snapshot ->> 'amount')::numeric;
  v_slot_ids := private.lock_wellness_capacity(
    null, v_start_at, v_end_at, v_party_size, v_expected_slots
  );

  insert into public.financial_references (
    reference_type, reference_id, guest_id, currency, created_by
  ) values (
    'wellness_booking', v_booking_id, v_guest_id, v_product.currency, auth.uid()
  ) returning id into v_financial_reference_id;

  insert into public.wellness_bookings (
    id, financial_reference_id, guest_id, product_id, start_at, end_at,
    party_size, capacity_units, source, status, settlement_type,
    price_snapshot, policy_snapshot, total, currency, notes, created_by, updated_by
  ) values (
    v_booking_id, v_financial_reference_id, v_guest_id, v_product.id, v_start_at, v_end_at,
    v_party_size, v_party_size, v_source, 'confirmed', 'payment',
    v_price_snapshot,
    jsonb_build_object(
      'rules', v_product.policy_rules,
      'productCode', v_product.code,
      'productType', v_product.product_type,
      'lateArrivalExtendsEndAt', false,
      'capturedAt', now()
    ),
    v_total, v_product.currency, nullif(trim(p_payload ->> 'notes'), ''), auth.uid(), auth.uid()
  );

  insert into public.wellness_booking_slots (booking_id, slot_id, capacity_units)
  select v_booking_id, selected.slot_id, v_party_size
  from unnest(v_slot_ids) as selected(slot_id);

  insert into public.payments (
    reservation_id, financial_reference_id, guest_id, amount, currency, method,
    reference, note, created_by
  ) values (
    null, v_financial_reference_id, v_guest_id, v_total, v_product.currency, v_method,
    nullif(trim(p_payload ->> 'paymentReference'), ''),
    nullif(trim(p_payload ->> 'paymentNote'), ''), auth.uid()
  ) returning id into v_payment_id;

  perform private.log_wellness_event(v_booking_id, 'RESERVATION_CREATED');
  perform private.log_wellness_event(
    v_booking_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('paymentId', v_payment_id, 'amount', v_total, 'method', v_method)
  );
  perform private.log_wellness_event(v_booking_id, 'RESERVATION_CONFIRMED');
  perform private.log_activity(
    'wellness.reservation_confirmed', 'wellness_booking', v_booking_id,
    'Reserva wellness creada, pagada y confirmada.',
    jsonb_build_object('productType', v_product.product_type, 'partySize', v_party_size)
  );
  return jsonb_build_object(
    'bookingId', v_booking_id, 'paymentId', v_payment_id,
    'total', v_total, 'amountPaid', v_total, 'balanceDue', 0
  );
end;
$$;

create function public.update_wellness_booking(p_booking_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.wellness_bookings%rowtype;
  v_product public.wellness_products%rowtype;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_start_local timestamp;
  v_party_size smallint;
  v_expected_slots smallint;
  v_slot_ids uuid[];
  v_price jsonb;
begin
  perform private.require_permission('experiences.manage');
  perform private.enforce_rate_limit('update_wellness_booking', 30, interval '1 minute');
  select * into v_booking from public.wellness_bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WELLNESS_BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('confirmed') then
    raise exception using errcode = '23514', message = 'WELLNESS_BOOKING_NOT_EDITABLE';
  end if;
  select * into v_product from public.wellness_products where id = v_booking.product_id;
  begin
    v_start_at := (p_payload ->> 'startAt')::timestamptz;
    v_party_size := (p_payload ->> 'partySize')::smallint;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
  end;
  v_start_local := v_start_at at time zone 'America/Argentina/Buenos_Aires';
  if v_product.product_type = 'circuit_relax' then
    if v_party_size not in (1, 2) or v_start_local::time not in (time '10:00', time '14:00', time '18:00') then
      raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
    end if;
    v_end_at := v_start_at + interval '3 hours';
    v_expected_slots := 1;
  elsif v_product.product_type = 'day_pass_relax' then
    if v_party_size not in (1, 2) or v_start_local::time <> time '10:00' then
      raise exception using errcode = '22023', message = 'INVALID_WELLNESS_BOOKING';
    end if;
    v_end_at := v_start_at + interval '9 hours';
    v_expected_slots := 3;
  else
    raise exception using errcode = '23514', message = 'CLUB_RELAX_NOT_AVAILABLE';
  end if;
  if v_start_at <= now() then
    raise exception using errcode = '22023', message = 'WELLNESS_START_MUST_BE_FUTURE';
  end if;
  if v_party_size <> v_booking.party_size then
    v_price := private.wellness_price_snapshot(v_product, v_start_at, v_party_size);
    if (v_price ->> 'amount')::numeric <> v_booking.total then
      raise exception using errcode = '23514', message = 'PRICE_CHANGE_REQUIRES_PAYMENT_ADJUSTMENT';
    end if;
  end if;
  v_slot_ids := private.lock_wellness_capacity(
    p_booking_id, v_start_at, v_end_at, v_party_size, v_expected_slots
  );
  delete from public.wellness_booking_slots where booking_id = p_booking_id;
  insert into public.wellness_booking_slots (booking_id, slot_id, capacity_units)
  select p_booking_id, selected.slot_id, v_party_size
  from unnest(v_slot_ids) as selected(slot_id);
  update public.wellness_bookings
  set start_at = v_start_at, end_at = v_end_at, party_size = v_party_size,
      capacity_units = v_party_size, notes = nullif(trim(p_payload ->> 'notes'), ''),
      updated_by = auth.uid()
  where id = p_booking_id;
  perform private.log_wellness_event(
    p_booking_id, 'ADMIN_OVERRIDE',
    jsonb_build_object('action', 'booking_updated', 'partySize', v_party_size)
  );
  return jsonb_build_object('bookingId', p_booking_id);
end;
$$;

create function public.transition_wellness_booking(
  p_booking_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.wellness_bookings%rowtype;
  v_new_status public.wellness_booking_status;
  v_event text;
  v_reason text := nullif(trim(p_reason), '');
begin
  perform private.require_permission('experiences.manage');
  perform private.enforce_rate_limit('transition_wellness_booking', 60, interval '1 minute');
  select * into v_booking from public.wellness_bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WELLNESS_BOOKING_NOT_FOUND'; end if;

  if p_action = 'check_in' then
    if v_booking.status <> 'confirmed'
       or (now() at time zone 'America/Argentina/Buenos_Aires')::date
          <> (v_booking.start_at at time zone 'America/Argentina/Buenos_Aires')::date
       or now() >= v_booking.end_at then
      raise exception using errcode = '23514', message = 'WELLNESS_BOOKING_NOT_CHECKIN_READY';
    end if;
    v_new_status := 'checked_in'; v_event := 'CHECKED_IN';
    update public.wellness_bookings
    set status = v_new_status, actual_check_in_at = now(), updated_by = auth.uid()
    where id = p_booking_id;
  elsif p_action = 'complete' then
    if v_booking.status <> 'checked_in' then
      raise exception using errcode = '23514', message = 'WELLNESS_BOOKING_NOT_COMPLETABLE';
    end if;
    v_new_status := 'completed'; v_event := 'COMPLETED';
    update public.wellness_bookings
    set status = v_new_status, actual_end_at = now(), updated_by = auth.uid()
    where id = p_booking_id;
  elsif p_action = 'no_show' then
    if v_booking.status <> 'confirmed' or now() < v_booking.start_at then
      raise exception using errcode = '23514', message = 'WELLNESS_BOOKING_NOT_NO_SHOW_READY';
    end if;
    v_new_status := 'no_show'; v_event := 'NO_SHOW';
    update public.wellness_bookings set status = v_new_status, updated_by = auth.uid()
    where id = p_booking_id;
  elsif p_action = 'cancel' then
    if v_booking.status <> 'confirmed' or v_reason is null then
      raise exception using errcode = '23514', message = 'WELLNESS_BOOKING_NOT_CANCELLABLE';
    end if;
    v_new_status := 'cancelled'; v_event := 'CANCELLED';
    update public.wellness_bookings
    set status = v_new_status, cancelled_by = auth.uid(), cancelled_at = now(),
        cancellation_reason = v_reason, updated_by = auth.uid()
    where id = p_booking_id;
  else
    raise exception using errcode = '22023', message = 'INVALID_WELLNESS_TRANSITION';
  end if;

  perform private.log_wellness_event(
    p_booking_id, v_event, jsonb_build_object('reason', v_reason, 'from', v_booking.status, 'to', v_new_status)
  );
  perform private.log_activity(
    'wellness.' || lower(v_event), 'wellness_booking', p_booking_id,
    'Estado de reserva wellness actualizado.', jsonb_build_object('from', v_booking.status, 'to', v_new_status)
  );
  return jsonb_build_object('bookingId', p_booking_id, 'status', v_new_status);
end;
$$;

revoke all on function private.wellness_price_snapshot(public.wellness_products, timestamptz, smallint)
  from public, anon, authenticated;
revoke all on function private.lock_wellness_capacity(uuid, timestamptz, timestamptz, smallint, smallint)
  from public, anon, authenticated;
revoke all on function private.log_wellness_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_wellness_payment_void()
  from public, anon, authenticated;
revoke all on function public.save_wellness_product(uuid, jsonb) from public, anon;
revoke all on function public.save_wellness_slot(uuid, jsonb) from public, anon;
revoke all on function public.create_wellness_booking(jsonb) from public, anon;
revoke all on function public.update_wellness_booking(uuid, jsonb) from public, anon;
revoke all on function public.transition_wellness_booking(uuid, text, text) from public, anon;
grant execute on function public.save_wellness_product(uuid, jsonb) to authenticated;
grant execute on function public.save_wellness_slot(uuid, jsonb) to authenticated;
grant execute on function public.create_wellness_booking(jsonb) to authenticated;
grant execute on function public.update_wellness_booking(uuid, jsonb) to authenticated;
grant execute on function public.transition_wellness_booking(uuid, text, text) to authenticated;

comment on table public.wellness_slots is
  'Shared external wellness capacity slots; no capacity is seeded or inferred.';
comment on function public.create_wellness_booking(jsonb) is
  'Atomically locks every overlapping slot, confirms a fully paid wellness booking and records its payment.';

commit;
