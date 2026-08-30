-- Minimal financial operations hardening: keep the existing payments ledger,
-- add a safe void operation, and support chronological cash queries.

create index if not exists payments_occurred_at_idx
  on public.payments (occurred_at desc);

create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_balance numeric(14,2);
begin
  perform private.require_permission('payments.manage');
  perform private.enforce_rate_limit('void_payment', 20, interval '1 minute');

  if p_payment_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT';
  end if;

  if char_length(v_reason) < 2 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_VOID_REASON';
  end if;

  select *
  into v_payment
  from public.payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'voided' then
    raise exception using errcode = '23505', message = 'PAYMENT_ALREADY_VOIDED';
  end if;

  update public.payments
  set status = 'voided',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = v_reason
  where id = v_payment.id;

  v_balance := private.reservation_balance(v_payment.reservation_id);

  perform private.log_activity(
    'payment.voided',
    'payment',
    v_payment.id,
    'Pago anulado.',
    jsonb_build_object(
      'reservationId', v_payment.reservation_id,
      'amount', v_payment.amount,
      'method', v_payment.method
    )
  );

  perform private.log_audit(
    'update',
    'payments',
    v_payment.id,
    jsonb_build_object(
      'reservationId', v_payment.reservation_id,
      'status', v_payment.status,
      'amount', v_payment.amount,
      'method', v_payment.method
    ),
    jsonb_build_object(
      'reservationId', v_payment.reservation_id,
      'status', 'voided',
      'amount', v_payment.amount,
      'method', v_payment.method,
      'voidReason', v_reason
    )
  );

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'reservationId', v_payment.reservation_id,
    'balance', v_balance,
    'status', 'voided'
  );
end;
$$;

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

comment on function public.void_payment(uuid, text) is
  'Voids a posted payment without deleting its financial or audit history.';
