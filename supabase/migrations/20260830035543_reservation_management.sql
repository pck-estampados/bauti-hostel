-- Atomic guest, reservation, assignment and cancellation operations for Casa Albor.
begin;

alter table public.reservations
  add column if not exists external_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_external_reference_check'
  ) then
    alter table public.reservations
      add constraint reservations_external_reference_check
      check (external_reference is null or char_length(external_reference) between 1 and 200);
  end if;
end;
$$;

create unique index if not exists reservations_source_external_reference_unique
  on public.reservations (source, external_reference)
  where external_reference is not null and deleted_at is null;

create or replace function public.create_reservation_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_guest_id uuid;
  v_reservation_id uuid;
  v_check_in date;
  v_check_out date;
  v_guest_count smallint;
  v_nightly_rate numeric(14,2);
  v_paid numeric(14,2);
  v_total numeric(14,2);
  v_source public.reservation_source;
  v_room_id uuid;
  v_existing_guest_id uuid;
  v_document text;
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('create_reservation_v2', 20, interval '1 minute');

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;

  begin
    v_check_in := (p_payload ->> 'checkIn')::date;
    v_check_out := (p_payload ->> 'checkOut')::date;
    v_guest_count := (p_payload ->> 'guestCount')::smallint;
    v_nightly_rate := (p_payload ->> 'nightlyRate')::numeric;
    v_paid := coalesce((p_payload ->> 'amountPaid')::numeric, 0);
    v_source := (p_payload ->> 'source')::public.reservation_source;
    v_room_id := (p_payload ->> 'roomId')::uuid;
    v_existing_guest_id := nullif(p_payload ->> 'guestId', '')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end;

  if v_check_out <= v_check_in or v_guest_count < 1 or v_nightly_rate <= 0 or v_paid < 0 then
    raise exception using errcode = '22023', message = 'INVALID_RESERVATION';
  end if;
  if v_source = 'walk_in' then
    raise exception using errcode = '22023', message = 'INVALID_RESERVATION_SOURCE';
  end if;
  if char_length(coalesce(p_payload ->> 'externalReference', '')) > 200 then
    raise exception using errcode = '22023', message = 'INVALID_EXTERNAL_REFERENCE';
  end if;

  select * into v_room
  from public.rooms room
  where room.id = v_room_id and room.active
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status not in ('available', 'clean', 'ready') then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  end if;
  if v_guest_count > v_room.capacity then
    raise exception using errcode = '23514', message = 'ROOM_CAPACITY_EXCEEDED';
  end if;

  if v_existing_guest_id is not null then
    select guest.id into v_guest_id
    from public.guests guest
    where guest.id = v_existing_guest_id and guest.deleted_at is null
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'GUEST_NOT_FOUND';
    end if;
  else
    perform private.require_permission('guests.manage');
    if char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
       or char_length(trim(coalesce(p_payload ->> 'lastName', ''))) < 1
       or char_length(trim(coalesce(p_payload ->> 'phone', ''))) < 6 then
      raise exception using errcode = '22023', message = 'INVALID_GUEST';
    end if;
    v_document := nullif(trim(p_payload ->> 'document'), '');
    insert into public.guests (
      first_name, last_name, phone, email, document_type, document_number, created_by
    ) values (
      trim(p_payload ->> 'firstName'), trim(p_payload ->> 'lastName'),
      trim(p_payload ->> 'phone'), nullif(lower(trim(p_payload ->> 'email')), ''),
      case when v_document is null then null else 'dni' end, v_document, auth.uid()
    ) returning id into v_guest_id;
  end if;

  v_total := (v_check_out - v_check_in) * v_nightly_rate;
  if v_paid > v_total then
    raise exception using errcode = '23514', message = 'PAYMENT_EXCEEDS_TOTAL';
  end if;

  insert into public.reservations (
    primary_guest_id, guest_count, check_in, check_out, expected_arrival,
    status, source, external_reference, nightly_rate, agreed_total,
    internal_summary, created_by
  ) values (
    v_guest_id, v_guest_count, v_check_in, v_check_out,
    nullif(p_payload ->> 'expectedArrival', '')::time,
    'confirmed', v_source, nullif(trim(p_payload ->> 'externalReference'), ''),
    v_nightly_rate, v_total, nullif(trim(p_payload ->> 'notes'), ''), auth.uid()
  ) returning id into v_reservation_id;

  insert into public.reservation_guests (reservation_id, guest_id, is_primary)
  values (v_reservation_id, v_guest_id, true);

  insert into public.room_assignments (
    reservation_id, room_id, check_in, check_out, assigned_by
  ) values (
    v_reservation_id, v_room.id, v_check_in, v_check_out, auth.uid()
  );

  if v_paid > 0 then
    perform private.require_permission('payments.manage');
    insert into public.payments (
      reservation_id, guest_id, amount, method, reference, note, created_by
    ) values (
      v_reservation_id, v_guest_id, v_paid,
      (p_payload ->> 'paymentMethod')::public.payment_method,
      nullif(trim(p_payload ->> 'paymentReference'), ''),
      nullif(trim(p_payload ->> 'paymentNote'), ''), auth.uid()
    );
  end if;

  insert into public.reservation_status_history (
    reservation_id, previous_status, new_status, reason, changed_by
  ) values (v_reservation_id, null, 'confirmed', 'Reserva manual creada', auth.uid());

  perform private.log_activity(
    'reservation.created', 'reservation', v_reservation_id,
    'Reserva manual creada.', jsonb_build_object('roomId', v_room.id, 'source', v_source)
  );
  perform private.log_audit(
    'insert', 'reservations', v_reservation_id, null,
    jsonb_build_object('status', 'confirmed', 'roomId', v_room.id, 'source', v_source)
  );

  return jsonb_build_object('reservationId', v_reservation_id, 'guestId', v_guest_id);
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  when unique_violation then
    if sqlerrm ilike '%reservations_source_external_reference_unique%' then
      raise exception using errcode = '23505', message = 'EXTERNAL_REFERENCE_ALREADY_EXISTS';
    end if;
    raise exception using errcode = '23505', message = 'GUEST_ALREADY_EXISTS';
end;
$$;

create or replace function public.update_guest(p_guest_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.guests%rowtype;
  v_document text;
begin
  perform private.require_permission('guests.manage');
  perform private.enforce_rate_limit('update_guest', 30, interval '1 minute');

  if p_guest_id is null or jsonb_typeof(p_payload) <> 'object'
     or char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'lastName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'phone', ''))) < 6 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST';
  end if;

  select * into v_guest
  from public.guests guest
  where guest.id = p_guest_id and guest.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GUEST_NOT_FOUND';
  end if;

  v_document := nullif(trim(p_payload ->> 'document'), '');
  update public.guests
  set first_name = trim(p_payload ->> 'firstName'),
      last_name = trim(p_payload ->> 'lastName'),
      phone = trim(p_payload ->> 'phone'),
      email = nullif(lower(trim(p_payload ->> 'email')), ''),
      document_type = case when v_document is null then null else 'dni' end,
      document_number = v_document
  where id = p_guest_id;

  perform private.log_activity('guest.updated', 'guest', p_guest_id, 'Datos básicos de huésped actualizados.', '{}'::jsonb);
  return jsonb_build_object('guestId', p_guest_id);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'GUEST_ALREADY_EXISTS';
end;
$$;

create or replace function public.update_reservation(p_reservation_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_assignment public.room_assignments%rowtype;
  v_room public.rooms%rowtype;
  v_guest_id uuid;
  v_room_id uuid;
  v_check_in date;
  v_check_out date;
  v_guest_count smallint;
  v_nightly_rate numeric(14,2);
  v_total numeric(14,2);
  v_source public.reservation_source;
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('update_reservation', 30, interval '1 minute');

  select * into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id and reservation.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND';
  end if;
  if v_reservation.status not in ('inquiry', 'pending', 'pending_deposit', 'confirmed', 'partially_paid', 'paid') then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_EDITABLE';
  end if;

  begin
    v_guest_id := (p_payload ->> 'guestId')::uuid;
    v_room_id := (p_payload ->> 'roomId')::uuid;
    v_check_in := (p_payload ->> 'checkIn')::date;
    v_check_out := (p_payload ->> 'checkOut')::date;
    v_guest_count := (p_payload ->> 'guestCount')::smallint;
    v_nightly_rate := (p_payload ->> 'nightlyRate')::numeric;
    v_source := (p_payload ->> 'source')::public.reservation_source;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end;

  if v_check_out <= v_check_in or v_guest_count < 1 or v_nightly_rate <= 0 or v_source = 'walk_in' then
    raise exception using errcode = '22023', message = 'INVALID_RESERVATION';
  end if;
  if char_length(coalesce(p_payload ->> 'externalReference', '')) > 200 then
    raise exception using errcode = '22023', message = 'INVALID_EXTERNAL_REFERENCE';
  end if;

  perform 1 from public.guests guest
  where guest.id = v_guest_id and guest.deleted_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'GUEST_NOT_FOUND';
  end if;

  select * into v_room from public.rooms room
  where room.id = v_room_id and room.active
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status not in ('available', 'clean', 'ready') then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  end if;
  if v_guest_count > v_room.capacity then
    raise exception using errcode = '23514', message = 'ROOM_CAPACITY_EXCEEDED';
  end if;

  v_total := (v_check_out - v_check_in) * v_nightly_rate;
  if private.reservation_paid_total(p_reservation_id) > v_total then
    raise exception using errcode = '23514', message = 'PAYMENT_EXCEEDS_TOTAL';
  end if;

  select * into v_assignment
  from public.room_assignments assignment
  where assignment.reservation_id = p_reservation_id and assignment.status = 'active'
  order by assignment.created_at desc limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_ASSIGNMENT_REQUIRED';
  end if;

  update public.reservations
  set primary_guest_id = v_guest_id,
      guest_count = v_guest_count,
      check_in = v_check_in,
      check_out = v_check_out,
      expected_arrival = nullif(p_payload ->> 'expectedArrival', '')::time,
      source = v_source,
      external_reference = nullif(trim(p_payload ->> 'externalReference'), ''),
      nightly_rate = v_nightly_rate,
      agreed_total = v_total,
      internal_summary = nullif(trim(p_payload ->> 'notes'), '')
  where id = p_reservation_id;

  update public.reservation_guests set is_primary = false where reservation_id = p_reservation_id;
  insert into public.reservation_guests (reservation_id, guest_id, is_primary)
  values (p_reservation_id, v_guest_id, true)
  on conflict (reservation_id, guest_id) do update set is_primary = excluded.is_primary;

  update public.room_assignments
  set room_id = v_room_id, check_in = v_check_in, check_out = v_check_out
  where id = v_assignment.id;

  perform private.log_activity(
    'reservation.updated', 'reservation', p_reservation_id,
    'Reserva actualizada.', jsonb_build_object('roomId', v_room_id, 'source', v_source)
  );
  perform private.log_audit(
    'update', 'reservations', p_reservation_id,
    jsonb_build_object('status', v_reservation.status, 'roomId', v_assignment.room_id),
    jsonb_build_object('status', v_reservation.status, 'roomId', v_room_id, 'source', v_source)
  );

  return jsonb_build_object('reservationId', p_reservation_id);
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  when unique_violation then
    raise exception using errcode = '23505', message = 'EXTERNAL_REFERENCE_ALREADY_EXISTS';
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('cancel_reservation', 30, interval '1 minute');

  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION_REASON';
  end if;

  select * into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id and reservation.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND';
  end if;
  if v_reservation.status = 'cancelled' then
    return jsonb_build_object('reservationId', p_reservation_id, 'alreadyCancelled', true);
  end if;
  if v_reservation.status in ('checked_in', 'accommodated', 'checked_out', 'completed') then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_CANCELLABLE';
  end if;

  perform 1 from public.room_assignments assignment
  where assignment.reservation_id = p_reservation_id and assignment.status = 'active'
  for update;

  update public.room_assignments
  set status = 'cancelled'
  where reservation_id = p_reservation_id and status = 'active';

  update public.reservations
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancellation_reason = trim(p_reason)
  where id = p_reservation_id;

  insert into public.reservation_status_history (
    reservation_id, previous_status, new_status, reason, changed_by
  ) values (p_reservation_id, v_reservation.status, 'cancelled', trim(p_reason), auth.uid());

  perform private.log_activity('reservation.cancelled', 'reservation', p_reservation_id, 'Reserva cancelada.', '{}'::jsonb);
  perform private.log_audit(
    'update', 'reservations', p_reservation_id,
    jsonb_build_object('status', v_reservation.status), jsonb_build_object('status', 'cancelled')
  );

  return jsonb_build_object('reservationId', p_reservation_id, 'cancelled', true);
end;
$$;

revoke all on function public.create_reservation_v2(jsonb) from public, anon;
revoke all on function public.update_guest(uuid, jsonb) from public, anon;
revoke all on function public.update_reservation(uuid, jsonb) from public, anon;
revoke all on function public.cancel_reservation(uuid, text) from public, anon;

grant execute on function public.create_reservation_v2(jsonb) to authenticated;
grant execute on function public.update_guest(uuid, jsonb) to authenticated;
grant execute on function public.update_reservation(uuid, jsonb) to authenticated;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;

commit;
