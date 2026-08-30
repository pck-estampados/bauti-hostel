-- Harden the existing stay-operation RPCs without adding a second operational model.
begin;

create or replace function private.is_valid_room_status_transition(
  p_from public.room_status,
  p_to public.room_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'available' then p_to in ('ready', 'maintenance', 'blocked', 'out_of_service')
    when 'reserved' then p_to in ('available', 'ready', 'maintenance', 'blocked', 'out_of_service')
    when 'occupied' then false
    when 'pending_cleaning' then p_to in ('cleaning', 'maintenance', 'blocked', 'out_of_service')
    when 'cleaning' then p_to in ('clean', 'maintenance', 'blocked', 'out_of_service')
    when 'clean' then p_to in ('ready', 'available', 'maintenance', 'blocked', 'out_of_service')
    when 'ready' then p_to in ('available', 'maintenance', 'blocked', 'out_of_service')
    when 'maintenance' then p_to in ('pending_cleaning', 'blocked', 'out_of_service')
    when 'blocked' then p_to in ('pending_cleaning', 'maintenance', 'out_of_service')
    when 'out_of_service' then p_to in ('pending_cleaning', 'maintenance', 'blocked')
    else false
  end;
$$;

create or replace function public.create_walk_in(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_guest_id uuid;
  v_existing_guest_id uuid;
  v_reservation_id uuid;
  v_room_id uuid;
  v_check_in date;
  v_check_out date;
  v_guest_count smallint;
  v_nightly_rate numeric(14,2);
  v_paid numeric(14,2);
  v_total numeric(14,2);
  v_document text;
  v_notes text;
begin
  perform private.require_permission('reservations.manage');
  perform private.require_permission('guests.manage');
  perform private.enforce_rate_limit('create_walk_in', 20, interval '1 minute');

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;

  begin
    v_room_id := (p_payload ->> 'roomId')::uuid;
    v_existing_guest_id := nullif(p_payload ->> 'guestId', '')::uuid;
    v_check_in := (p_payload ->> 'checkIn')::date;
    v_check_out := (p_payload ->> 'checkOut')::date;
    v_guest_count := (p_payload ->> 'guestCount')::smallint;
    v_nightly_rate := (p_payload ->> 'nightlyRate')::numeric;
    v_paid := coalesce((p_payload ->> 'amountPaid')::numeric, 0);
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end;

  if v_check_in <> private.hostel_today() or v_check_out <= v_check_in then
    raise exception using errcode = '22023', message = 'INVALID_STAY_DATES';
  end if;
  if v_guest_count < 1 or v_nightly_rate <= 0 or v_paid < 0 then
    raise exception using errcode = '22023', message = 'INVALID_AMOUNTS';
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

  v_total := (v_check_out - v_check_in) * v_nightly_rate;
  if v_paid > v_total then
    raise exception using errcode = '23514', message = 'PAYMENT_EXCEEDS_TOTAL';
  end if;

  v_document := nullif(trim(p_payload ->> 'document'), '');
  v_notes := nullif(trim(p_payload ->> 'notes'), '');

  if v_existing_guest_id is not null then
    select guest.id into v_guest_id
    from public.guests guest
    where guest.id = v_existing_guest_id and guest.deleted_at is null
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'GUEST_NOT_FOUND';
    end if;
  else
    if char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
       or char_length(trim(coalesce(p_payload ->> 'lastName', ''))) < 1
       or char_length(trim(coalesce(p_payload ->> 'phone', ''))) < 6 then
      raise exception using errcode = '22023', message = 'INVALID_GUEST';
    end if;

    if v_document is not null then
      select guest.id into v_guest_id
      from public.guests guest
      where guest.document_type = coalesce(nullif(p_payload ->> 'documentType', ''), 'dni')
        and upper(guest.document_number) = upper(v_document)
        and guest.deleted_at is null
      for update;
    end if;

    if v_guest_id is null then
      insert into public.guests (
        first_name, last_name, phone, email, document_type, document_number, created_by
      ) values (
        trim(p_payload ->> 'firstName'), trim(p_payload ->> 'lastName'),
        trim(p_payload ->> 'phone'), nullif(lower(trim(p_payload ->> 'email')), ''),
        case when v_document is null then null else coalesce(nullif(p_payload ->> 'documentType', ''), 'dni') end,
        v_document, auth.uid()
      ) returning id into v_guest_id;
    else
      update public.guests
      set first_name = trim(p_payload ->> 'firstName'),
          last_name = trim(p_payload ->> 'lastName'),
          phone = trim(p_payload ->> 'phone'),
          email = coalesce(nullif(lower(trim(p_payload ->> 'email')), ''), email)
      where id = v_guest_id;
    end if;
  end if;

  insert into public.reservations (
    primary_guest_id, guest_count, check_in, check_out, status, source,
    nightly_rate, agreed_total, internal_summary, actual_check_in_at, created_by
  ) values (
    v_guest_id, v_guest_count, v_check_in, v_check_out, 'accommodated', 'walk_in',
    v_nightly_rate, v_total, v_notes, now(), auth.uid()
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

  if v_notes is not null then
    perform private.require_permission('notes.manage');
    insert into public.internal_notes (entity_type, entity_id, body, visibility, created_by)
    values ('reservation', v_reservation_id, v_notes, 'reception', auth.uid());
  end if;

  update public.rooms set status = 'occupied', status_note = null where id = v_room.id;
  insert into public.room_status_history (room_id, previous_status, new_status, reason, changed_by)
  values (v_room.id, v_room.status, 'occupied', 'Walk-in con check-in atómico', auth.uid());
  insert into public.reservation_status_history (
    reservation_id, previous_status, new_status, reason, changed_by
  ) values (v_reservation_id, null, 'accommodated', 'Walk-in creado y alojado', auth.uid());

  perform private.log_activity(
    'walk_in.created_and_checked_in', 'reservation', v_reservation_id,
    'Ingreso directo registrado y habitación ocupada.', jsonb_build_object('roomId', v_room.id)
  );
  perform private.log_audit(
    'insert', 'reservations', v_reservation_id, null,
    jsonb_build_object('status', 'accommodated', 'source', 'walk_in', 'roomId', v_room.id)
  );

  return jsonb_build_object(
    'reservationId', v_reservation_id, 'guestId', v_guest_id,
    'paidTotal', v_paid, 'balance', v_total - v_paid
  );
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
end;
$$;

create or replace function public.perform_check_in(p_reservation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_assignment public.room_assignments%rowtype;
  v_room public.rooms%rowtype;
  v_today date := private.hostel_today();
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('perform_check_in', 30, interval '1 minute');

  select * into v_reservation from public.reservations
  where id = p_reservation_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND';
  end if;
  if v_reservation.status not in ('confirmed', 'partially_paid', 'paid')
     or v_reservation.actual_check_in_at is not null then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_CHECKIN_READY';
  end if;
  if v_reservation.check_in > v_today or v_reservation.check_out <= v_today then
    raise exception using errcode = '22023', message = 'CHECKIN_NOT_TODAY';
  end if;

  select * into v_assignment from public.room_assignments
  where reservation_id = p_reservation_id and status = 'active'
  order by created_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_ASSIGNMENT_REQUIRED';
  end if;
  if v_assignment.check_in <> v_reservation.check_in
     or v_assignment.check_out <> v_reservation.check_out
     or v_assignment.check_in > v_today
     or v_assignment.check_out <= v_today then
    raise exception using errcode = '22023', message = 'ROOM_ASSIGNMENT_MISMATCH';
  end if;

  select * into v_room from public.rooms
  where id = v_assignment.room_id and active for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status not in ('available', 'reserved', 'ready', 'clean') then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_CHECKIN_READY';
  end if;
  if v_reservation.guest_count > v_room.capacity then
    raise exception using errcode = '23514', message = 'ROOM_CAPACITY_EXCEEDED';
  end if;

  update public.reservations
  set status = 'accommodated', actual_check_in_at = now()
  where id = p_reservation_id;
  update public.rooms set status = 'occupied', status_note = null where id = v_room.id;

  insert into public.reservation_status_history (
    reservation_id, previous_status, new_status, reason, changed_by
  ) values (p_reservation_id, v_reservation.status, 'accommodated', 'Check-in realizado', auth.uid());
  insert into public.room_status_history (
    room_id, previous_status, new_status, reason, changed_by
  ) values (v_room.id, v_room.status, 'occupied', 'Check-in realizado', auth.uid());
  perform private.log_activity(
    'check_in.completed', 'reservation', p_reservation_id,
    'Check-in completado.', jsonb_build_object('roomId', v_room.id)
  );
  perform private.log_audit(
    'update', 'reservations', p_reservation_id,
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'accommodated')
  );

  return jsonb_build_object('reservationId', p_reservation_id, 'roomId', v_room.id);
end;
$$;

create or replace function public.perform_check_out(p_reservation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_assignment public.room_assignments%rowtype;
  v_room public.rooms%rowtype;
  v_balance numeric;
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('perform_check_out', 30, interval '1 minute');

  select * into v_reservation from public.reservations
  where id = p_reservation_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND';
  end if;
  if v_reservation.status <> 'accommodated' or v_reservation.actual_check_in_at is null then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_CHECKOUT_READY';
  end if;

  v_balance := private.reservation_balance(p_reservation_id);
  if v_balance > 0 then
    raise exception using errcode = '23514', message = 'OUTSTANDING_BALANCE';
  end if;

  select * into v_assignment from public.room_assignments
  where reservation_id = p_reservation_id and status = 'active'
  order by created_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_ASSIGNMENT_REQUIRED';
  end if;

  select * into v_room from public.rooms where id = v_assignment.room_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'occupied' then
    raise exception using errcode = '23514', message = 'ROOM_NOT_OCCUPIED';
  end if;

  update public.reservations
  set status = 'checked_out', actual_check_out_at = now()
  where id = p_reservation_id;
  update public.room_assignments set status = 'cancelled' where id = v_assignment.id;
  update public.rooms
  set status = 'pending_cleaning', status_note = 'Check-out realizado; requiere limpieza.'
  where id = v_assignment.room_id;

  insert into public.housekeeping_tasks (
    room_id, reservation_id, status, priority, notes, created_by
  ) values (
    v_assignment.room_id, p_reservation_id, 'pending', 'medium',
    'Limpieza posterior a check-out.', auth.uid()
  );
  insert into public.reservation_status_history (
    reservation_id, previous_status, new_status, reason, changed_by
  ) values (p_reservation_id, v_reservation.status, 'checked_out', 'Check-out realizado', auth.uid());
  insert into public.room_status_history (
    room_id, previous_status, new_status, reason, changed_by
  ) values (v_assignment.room_id, v_room.status, 'pending_cleaning', 'Check-out realizado', auth.uid());
  perform private.log_activity(
    'check_out.completed', 'reservation', p_reservation_id,
    'Check-out completado y limpieza pendiente.', jsonb_build_object('roomId', v_assignment.room_id)
  );
  perform private.log_audit(
    'update', 'reservations', p_reservation_id,
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'checked_out')
  );

  return jsonb_build_object(
    'reservationId', p_reservation_id, 'roomId', v_assignment.room_id,
    'housekeepingStatus', 'pending'
  );
end;
$$;

create or replace function public.set_room_operational_status(
  p_room_id uuid,
  p_status public.room_status,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_housekeeping boolean;
begin
  v_housekeeping := private.has_permission('housekeeping.manage');
  perform private.enforce_rate_limit('set_room_operational_status', 60, interval '1 minute');
  if not private.has_permission('rooms.manage') and not v_housekeeping then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if v_housekeeping and not private.has_permission('rooms.manage')
     and p_status not in ('pending_cleaning', 'cleaning', 'clean', 'ready') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_REASON';
  end if;

  select * into v_room from public.rooms where id = p_room_id and active for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status = p_status then
    return jsonb_build_object('roomId', p_room_id, 'status', p_status, 'unchanged', true);
  end if;
  if v_room.status = 'occupied' then
    raise exception using errcode = '23514', message = 'OCCUPIED_ROOM_STATUS_LOCKED';
  end if;
  if not private.is_valid_room_status_transition(v_room.status, p_status) then
    raise exception using errcode = '23514', message = 'INVALID_ROOM_STATUS_TRANSITION';
  end if;

  update public.rooms
  set status = p_status, status_note = nullif(trim(p_reason), '')
  where id = p_room_id;

  if p_status = 'pending_cleaning' then
    insert into public.housekeeping_tasks (room_id, status, priority, notes, created_by)
    select p_room_id, 'pending', 'medium', 'Preparación operativa de habitación.', auth.uid()
    where not exists (
      select 1 from public.housekeeping_tasks task
      where task.room_id = p_room_id and task.status not in ('completed', 'cancelled')
    );
  elsif p_status = 'cleaning' then
    update public.housekeeping_tasks
    set status = 'in_progress', started_at = coalesce(started_at, now())
    where id = (
      select task.id from public.housekeeping_tasks task
      where task.room_id = p_room_id and task.status not in ('completed', 'cancelled')
      order by task.created_at desc limit 1
    );
  elsif p_status = 'clean' then
    update public.housekeeping_tasks
    set status = 'review', started_at = coalesce(started_at, now())
    where id = (
      select task.id from public.housekeeping_tasks task
      where task.room_id = p_room_id and task.status not in ('completed', 'cancelled')
      order by task.created_at desc limit 1
    );
  elsif p_status = 'ready' then
    update public.housekeeping_tasks
    set status = 'completed', started_at = coalesce(started_at, now()), completed_at = now()
    where id = (
      select task.id from public.housekeeping_tasks task
      where task.room_id = p_room_id and task.status not in ('completed', 'cancelled')
      order by task.created_at desc limit 1
    );
  end if;

  insert into public.room_status_history (
    room_id, previous_status, new_status, reason, changed_by
  ) values (p_room_id, v_room.status, p_status, nullif(trim(p_reason), ''), auth.uid());
  perform private.log_activity(
    'room.status_changed', 'room', p_room_id,
    'Estado operativo de habitación actualizado.',
    jsonb_build_object('from', v_room.status, 'to', p_status)
  );
  perform private.log_audit(
    'update', 'rooms', p_room_id,
    jsonb_build_object('status', v_room.status),
    jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('roomId', p_room_id, 'status', p_status);
end;
$$;

revoke all on function private.is_valid_room_status_transition(public.room_status, public.room_status) from public, anon, authenticated;
revoke all on function public.create_walk_in(jsonb) from public, anon;
revoke all on function public.perform_check_in(uuid) from public, anon;
revoke all on function public.perform_check_out(uuid) from public, anon;
revoke all on function public.set_room_operational_status(uuid, public.room_status, text) from public, anon;

grant execute on function public.create_walk_in(jsonb) to authenticated;
grant execute on function public.perform_check_in(uuid) to authenticated;
grant execute on function public.perform_check_out(uuid) to authenticated;
grant execute on function public.set_room_operational_status(uuid, public.room_status, text) to authenticated;

commit;
