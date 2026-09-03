begin;

-- PostgreSQL combines permissive policies for the same role and command with
-- OR. Keep that exact access model while avoiding duplicate SELECT policies.
drop policy if exists payments_read on public.payments;
drop policy if exists wellness_payments_read on public.payments;

create policy payments_read on public.payments
for select
to authenticated
using (
  private.has_permission('payments.read')
  or (
    financial_reference_id is not null
    and (select private.has_permission('experiences.read'))
    and exists (
      select 1
      from public.financial_references reference
      where reference.id = payments.financial_reference_id
        and reference.reference_type = 'wellness_booking'
    )
  )
);

commit;
