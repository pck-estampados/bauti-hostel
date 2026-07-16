begin;

grant usage on schema private to authenticated;
grant execute on function private.is_active_staff(uuid) to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

create table private.operation_rate_limits (
  user_id uuid not null,
  action text not null,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (user_id, action)
);

revoke all on private.operation_rate_limits from public, anon, authenticated;

create function private.enforce_rate_limit(
  p_action text,
  p_max_attempts integer default 30,
  p_window interval default interval '1 minute'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  insert into private.operation_rate_limits (user_id, action, window_started_at, attempts)
  values (auth.uid(), p_action, now(), 1)
  on conflict (user_id, action) do update
  set window_started_at = case
        when private.operation_rate_limits.window_started_at <= now() - p_window then now()
        else private.operation_rate_limits.window_started_at
      end,
      attempts = case
        when private.operation_rate_limits.window_started_at <= now() - p_window then 1
        else private.operation_rate_limits.attempts + 1
      end
  returning attempts into v_attempts;

  if v_attempts > p_max_attempts then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;
end;
$$;

create function private.hostel_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

create function private.reservation_paid_total(p_reservation_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case payment.direction when 'charge' then payment.amount else -payment.amount end
  ), 0)::numeric
  from public.payments payment
  where payment.reservation_id = p_reservation_id
    and payment.status = 'posted';
$$;

create function private.reservation_balance(p_reservation_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(reservation.agreed_total - private.reservation_paid_total(reservation.id), 0)
  from public.reservations reservation
  where reservation.id = p_reservation_id
    and reservation.deleted_at is null;
$$;

create function private.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb));
$$;

create function private.log_audit(
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_values jsonb,
  p_new_values jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  values (auth.uid(), p_action, p_table_name, p_record_id, p_old_values, p_new_values);
$$;

create view public.reservation_financials
with (security_invoker = true)
as
select
  reservation.id as reservation_id,
  reservation.agreed_total,
  coalesce(sum(
    case
      when payment.status = 'posted' and payment.direction = 'charge' then payment.amount
      when payment.status = 'posted' and payment.direction = 'refund' then -payment.amount
      else 0
    end
  ), 0)::numeric(14,2) as paid_total,
  greatest(
    reservation.agreed_total - coalesce(sum(
      case
        when payment.status = 'posted' and payment.direction = 'charge' then payment.amount
        when payment.status = 'posted' and payment.direction = 'refund' then -payment.amount
        else 0
      end
    ), 0),
    0
  )::numeric(14,2) as balance
from public.reservations reservation
left join public.payments payment on payment.reservation_id = reservation.id
where reservation.deleted_at is null
group by reservation.id, reservation.agreed_total;

create function public.create_guest(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_document text;
begin
  perform private.require_permission('guests.manage');
  perform private.enforce_rate_limit('create_guest', 30, interval '1 minute');

  if jsonb_typeof(p_payload) <> 'object'
     or char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
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

  perform private.log_activity(
    'guest.created', 'guest', v_guest_id, 'Huésped registrado.', '{}'::jsonb
  );
  return jsonb_build_object('guestId', v_guest_id);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'GUEST_ALREADY_EXISTS';
end;
$$;

create function public.create_internal_note(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_body text;
begin
  perform private.require_permission('notes.manage');
  perform private.enforce_rate_limit('create_internal_note', 60, interval '1 minute');

  v_entity_type := p_payload ->> 'entityType';
  v_body := trim(coalesce(p_payload ->> 'text', ''));
  if v_entity_type not in ('general', 'guest', 'reservation', 'room', 'payment', 'issue')
     or char_length(v_body) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'INVALID_NOTE';
  end if;
  begin
    v_entity_id := nullif(p_payload ->> 'entityId', '')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_NOTE';
  end;

  insert into public.internal_notes (entity_type, entity_id, body, visibility, created_by)
  values (v_entity_type, v_entity_id, v_body, 'staff', auth.uid())
  returning id into v_note_id;

  perform private.log_activity(
    'note.created', 'note', v_note_id, 'Nota interna registrada.',
    jsonb_build_object('entityType', v_entity_type, 'entityId', v_entity_id)
  );
  return jsonb_build_object('noteId', v_note_id);
end;
$$;

create function public.create_walk_in(p_payload jsonb)
returns jsonb
language plpgsql
volatile
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
  if v_guest_count < 1 or v_nightly_rate < 0 or v_paid < 0 then
    raise exception using errcode = '22023', message = 'INVALID_AMOUNTS';
  end if;
  if char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'lastName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'phone', ''))) < 6 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST';
  end if;

  select * into v_room
  from public.rooms room
  where room.id = (p_payload ->> 'roomId')::uuid
    and room.active
  for update;

  if not found or v_room.status not in ('available', 'clean', 'ready') then
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
      trim(p_payload ->> 'firstName'),
      trim(p_payload ->> 'lastName'),
      trim(p_payload ->> 'phone'),
      nullif(lower(trim(p_payload ->> 'email')), ''),
      case when v_document is null then null else coalesce(nullif(p_payload ->> 'documentType', ''), 'dni') end,
      v_document,
      auth.uid()
    ) returning id into v_guest_id;
  else
    update public.guests
    set first_name = trim(p_payload ->> 'firstName'),
        last_name = trim(p_payload ->> 'lastName'),
        phone = trim(p_payload ->> 'phone'),
        email = coalesce(nullif(lower(trim(p_payload ->> 'email')), ''), email)
    where id = v_guest_id;
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
      v_reservation_id,
      v_guest_id,
      v_paid,
      (p_payload ->> 'paymentMethod')::public.payment_method,
      nullif(trim(p_payload ->> 'paymentReference'), ''),
      nullif(trim(p_payload ->> 'paymentNote'), ''),
      auth.uid()
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
  ) values (
    v_reservation_id, null, 'accommodated', 'Walk-in creado y alojado', auth.uid()
  );

  perform private.log_activity(
    'walk_in.created_and_checked_in', 'reservation', v_reservation_id,
    'Ingreso directo registrado y habitación ocupada.',
    jsonb_build_object('roomId', v_room.id)
  );
  perform private.log_audit(
    'insert', 'reservations', v_reservation_id, null,
    jsonb_build_object('status', 'accommodated', 'source', 'walk_in', 'roomId', v_room.id)
  );

  return jsonb_build_object(
    'reservationId', v_reservation_id,
    'guestId', v_guest_id,
    'paidTotal', v_paid,
    'balance', v_total - v_paid
  );
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
end;
$$;

create function public.create_reservation(p_payload jsonb)
returns jsonb
language plpgsql
volatile
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
begin
  perform private.require_permission('reservations.manage');
  perform private.require_permission('guests.manage');
  perform private.enforce_rate_limit('create_reservation', 20, interval '1 minute');

  begin
    v_check_in := (p_payload ->> 'checkIn')::date;
    v_check_out := (p_payload ->> 'checkOut')::date;
    v_guest_count := (p_payload ->> 'guestCount')::smallint;
    v_nightly_rate := (p_payload ->> 'nightlyRate')::numeric;
    v_paid := coalesce((p_payload ->> 'amountPaid')::numeric, 0);
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end;

  if v_check_out <= v_check_in or v_guest_count < 1 or v_nightly_rate < 0 or v_paid < 0 then
    raise exception using errcode = '22023', message = 'INVALID_RESERVATION';
  end if;
  if char_length(trim(coalesce(p_payload ->> 'firstName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'lastName', ''))) < 1
     or char_length(trim(coalesce(p_payload ->> 'phone', ''))) < 6 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST';
  end if;

  select * into v_room
  from public.rooms room
  where room.id = (p_payload ->> 'roomId')::uuid and room.active
  for update;

  if not found or v_room.status in ('maintenance', 'blocked', 'out_of_service') then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
  end if;
  if v_guest_count > v_room.capacity then
    raise exception using errcode = '23514', message = 'ROOM_CAPACITY_EXCEEDED';
  end if;

  v_total := (v_check_out - v_check_in) * v_nightly_rate;
  if v_paid > v_total then
    raise exception using errcode = '23514', message = 'PAYMENT_EXCEEDS_TOTAL';
  end if;

  insert into public.guests (
    first_name, last_name, phone, email, document_type, document_number, created_by
  ) values (
    trim(p_payload ->> 'firstName'), trim(p_payload ->> 'lastName'),
    trim(p_payload ->> 'phone'), nullif(lower(trim(p_payload ->> 'email')), ''),
    case when nullif(trim(p_payload ->> 'document'), '') is null then null else 'dni' end,
    nullif(trim(p_payload ->> 'document'), ''), auth.uid()
  ) returning id into v_guest_id;

  insert into public.reservations (
    primary_guest_id, guest_count, check_in, check_out, expected_arrival,
    status, source, nightly_rate, agreed_total, internal_summary, created_by
  ) values (
    v_guest_id, v_guest_count, v_check_in, v_check_out,
    nullif(p_payload ->> 'expectedArrival', '')::time,
    'confirmed', (p_payload ->> 'source')::public.reservation_source,
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
    'Reserva manual creada.', jsonb_build_object('roomId', v_room.id)
  );
  perform private.log_audit(
    'insert', 'reservations', v_reservation_id, null,
    jsonb_build_object('status', 'confirmed', 'roomId', v_room.id)
  );

  return jsonb_build_object(
    'reservationId', v_reservation_id,
    'guestId', v_guest_id,
    'paidTotal', v_paid,
    'balance', v_total - v_paid
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'GUEST_ALREADY_EXISTS';
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_AVAILABLE';
end;
$$;

create function public.perform_check_in(p_reservation_id uuid)
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
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('perform_check_in', 30, interval '1 minute');

  select * into v_reservation from public.reservations
  where id = p_reservation_id and deleted_at is null for update;
  if not found or v_reservation.status not in ('confirmed', 'partially_paid', 'paid') then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_CHECKIN_READY';
  end if;

  select * into v_assignment from public.room_assignments
  where reservation_id = p_reservation_id and status = 'active'
  order by created_at desc limit 1 for update;
  if not found then
    raise exception using errcode = '22023', message = 'ROOM_ASSIGNMENT_REQUIRED';
  end if;

  select * into v_room from public.rooms where id = v_assignment.room_id for update;
  if v_room.status not in ('available', 'reserved', 'ready', 'clean') then
    raise exception using errcode = '23P01', message = 'ROOM_NOT_CHECKIN_READY';
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

create function public.perform_check_out(p_reservation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_assignment public.room_assignments%rowtype;
  v_balance numeric;
begin
  perform private.require_permission('reservations.manage');
  perform private.enforce_rate_limit('perform_check_out', 30, interval '1 minute');

  select * into v_reservation from public.reservations
  where id = p_reservation_id and deleted_at is null for update;
  if not found or v_reservation.status <> 'accommodated' then
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
    raise exception using errcode = '22023', message = 'ROOM_ASSIGNMENT_REQUIRED';
  end if;

  perform 1 from public.rooms where id = v_assignment.room_id for update;
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
  ) values (v_assignment.room_id, 'occupied', 'pending_cleaning', 'Check-out realizado', auth.uid());
  perform private.log_activity(
    'check_out.completed', 'reservation', p_reservation_id,
    'Check-out completado y limpieza pendiente.',
    jsonb_build_object('roomId', v_assignment.room_id)
  );
  perform private.log_audit(
    'update', 'reservations', p_reservation_id,
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'checked_out')
  );

  return jsonb_build_object(
    'reservationId', p_reservation_id,
    'roomId', v_assignment.room_id,
    'housekeepingStatus', 'pending'
  );
end;
$$;

create function public.register_payment(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_amount numeric(14,2);
  v_payment_id uuid;
  v_balance numeric(14,2);
begin
  perform private.require_permission('payments.manage');
  perform private.enforce_rate_limit('register_payment', 30, interval '1 minute');

  begin
    v_amount := (p_payload ->> 'amount')::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT';
  end;
  if v_amount <= 0 then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT';
  end if;

  select * into v_reservation from public.reservations
  where id = (p_payload ->> 'reservationId')::uuid and deleted_at is null
  for update;
  if not found or v_reservation.status in ('cancelled', 'rejected') then
    raise exception using errcode = '22023', message = 'RESERVATION_NOT_PAYABLE';
  end if;

  v_balance := private.reservation_balance(v_reservation.id);
  if v_amount > v_balance then
    raise exception using errcode = '23514', message = 'PAYMENT_EXCEEDS_BALANCE';
  end if;

  insert into public.payments (
    reservation_id, guest_id, amount, method, reference, note, created_by
  ) values (
    v_reservation.id, v_reservation.primary_guest_id, v_amount,
    (p_payload ->> 'method')::public.payment_method,
    nullif(trim(p_payload ->> 'reference'), ''),
    nullif(trim(p_payload ->> 'note'), ''), auth.uid()
  ) returning id into v_payment_id;

  perform private.log_activity(
    'payment.registered', 'payment', v_payment_id,
    'Pago registrado.', jsonb_build_object('reservationId', v_reservation.id)
  );
  perform private.log_audit(
    'insert', 'payments', v_payment_id, null,
    jsonb_build_object('reservationId', v_reservation.id, 'amount', v_amount)
  );

  return jsonb_build_object(
    'paymentId', v_payment_id,
    'reservationId', v_reservation.id,
    'balance', v_balance - v_amount
  );
end;
$$;

create function public.set_room_operational_status(
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

  select * into v_room from public.rooms where id = p_room_id and active for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status = 'occupied' and p_status <> 'occupied' then
    raise exception using errcode = '23514', message = 'OCCUPIED_ROOM_STATUS_LOCKED';
  end if;

  update public.rooms
  set status = p_status, status_note = nullif(trim(p_reason), '')
  where id = p_room_id;
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

revoke all on public.reservation_financials from public, anon, authenticated;
grant select on public.reservation_financials to authenticated;

revoke all on function public.create_walk_in(jsonb) from public, anon;
revoke all on function public.create_guest(jsonb) from public, anon;
revoke all on function public.create_internal_note(jsonb) from public, anon;
revoke all on function public.create_reservation(jsonb) from public, anon;
revoke all on function public.perform_check_in(uuid) from public, anon;
revoke all on function public.perform_check_out(uuid) from public, anon;
revoke all on function public.register_payment(jsonb) from public, anon;
revoke all on function public.set_room_operational_status(uuid, public.room_status, text) from public, anon;

grant execute on function public.create_walk_in(jsonb) to authenticated;
grant execute on function public.create_guest(jsonb) to authenticated;
grant execute on function public.create_internal_note(jsonb) to authenticated;
grant execute on function public.create_reservation(jsonb) to authenticated;
grant execute on function public.perform_check_in(uuid) to authenticated;
grant execute on function public.perform_check_out(uuid) to authenticated;
grant execute on function public.register_payment(jsonb) to authenticated;
grant execute on function public.set_room_operational_status(uuid, public.room_status, text) to authenticated;

commit;
