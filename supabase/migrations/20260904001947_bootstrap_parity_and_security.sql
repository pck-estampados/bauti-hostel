-- T0.3: additive bootstrap parity. L1-L12 remain immutable.
-- C1 is the current production redaction implementation, inspected read-only.
-- H1 deliberately preserves the explicit application SQLSTATE contract from L3.
-- This file has NOT been authorized for production in T0.3.
begin;

-- M1: absent from the clean platform; L1 installs this app dependency in public.
-- Real local advisors reported extension_in_public. Preserve its objects/OIDs and
-- exclusion constraints while matching the hardened production namespace.
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname <> 'extensions'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION private.capture_sensitive_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  old_row jsonb;
  new_row jsonb;
  record_text text;
  record_uuid uuid;
begin
  old_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  record_text := coalesce(new_row ->> 'id', old_row ->> 'id');
  if record_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    record_uuid := record_text::uuid;
  end if;

  if tg_table_name = 'guests' then
    old_row := case when old_row is null then null else old_row - array['first_name','last_name','phone','phone_normalized','email','document_type','document_number','nationality_code','birth_date','emergency_contact'] end;
    new_row := case when new_row is null then null else new_row - array['first_name','last_name','phone','phone_normalized','email','document_type','document_number','nationality_code','birth_date','emergency_contact'] end;
  elsif tg_table_name = 'internal_notes' then
    old_row := case when old_row is null then null else old_row - 'body' end;
    new_row := case when new_row is null then null else new_row - 'body' end;
  elsif tg_table_name = 'payments' then
    old_row := case when old_row is null then null else old_row - array['amount','reference','note','void_reason'] end;
    new_row := case when new_row is null then null else new_row - array['amount','reference','note','void_reason'] end;
  elsif tg_table_name = 'profiles' then
    old_row := case when old_row is null then null else old_row - array['display_name','phone'] end;
    new_row := case when new_row is null then null else new_row - array['display_name','phone'] end;
  elsif tg_table_name = 'reservations' then
    old_row := case when old_row is null then null else old_row - array['internal_summary','nightly_rate','agreed_total'] end;
    new_row := case when new_row is null then null else new_row - array['internal_summary','nightly_rate','agreed_total'] end;
  elsif tg_table_name = 'housekeeping_tasks' then
    old_row := case when old_row is null then null else old_row - 'notes' end;
    new_row := case when new_row is null then null else new_row - 'notes' end;
  elsif tg_table_name = 'maintenance_issues' then
    old_row := case when old_row is null then null else old_row - 'description' end;
    new_row := case when new_row is null then null else new_row - 'description' end;
  end if;

  insert into public.audit_logs(actor_id,action,table_name,record_id,old_values,new_values)
  values(auth.uid(),lower(tg_op),tg_table_name,record_uuid,old_row,new_row);

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.capture_sensitive_change() from public, anon, authenticated;

create or replace function public.register_payment(p_payload jsonb)
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

revoke all on function public.register_payment(jsonb) from public, anon;
grant execute on function public.register_payment(jsonb) to authenticated;

-- Explicit object ACLs: these helpers are called only inside SECURITY DEFINER
-- operations owned by the migration role. API users must enter through the
-- permission-checked public RPCs, never invoke financial/audit helpers directly.
-- Keep has_permission/is_active_staff EXECUTE for authenticated: RLS needs it.
revoke all on function
  private.enforce_rate_limit(text, integer, interval),
  private.hostel_today(),
  private.log_activity(text, text, uuid, text, jsonb),
  private.log_audit(text, text, uuid, jsonb, jsonb),
  private.reservation_balance(uuid),
  private.reservation_paid_total(uuid)
from public, anon, authenticated;

-- Both sequences are consumed inside privileged wellness RPCs. UPDATE is not
-- needed by any API role, including service_role; production grants none of it.
-- Do not alter the migration owner's rights or reservation_code_seq.
revoke update on sequence
  public.wellness_booking_code_seq,
  public.wellness_booking_events_id_seq
from public, anon, authenticated, service_role;

-- Authorized follow-up: only the five remaining service_role UPDATE grants.
-- Preserve reservation_code_seq authenticated USAGE/SELECT and all owners.
revoke update on sequence
  public.activity_logs_id_seq,
  public.audit_logs_id_seq,
  public.reservation_code_seq,
  public.reservation_status_history_id_seq,
  public.room_status_history_id_seq
from service_role;

-- No ALTER DEFAULT PRIVILEGES: a private-only REVOKE cannot cancel implicit
-- global PUBLIC EXECUTE. Changing global defaults for postgres would affect
-- other schemas and would not cover a different future migration owner.
-- Every future function must specify explicit ACLs and pass the ACL regression.

commit;
