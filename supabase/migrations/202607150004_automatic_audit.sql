begin;

create function private.capture_sensitive_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id_text text;
  v_id uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_id_text := coalesce(v_new ->> 'id', v_old ->> 'id');

  if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_id := v_id_text::uuid;
  end if;

  insert into public.audit_logs (
    actor_id, action, table_name, record_id, old_values, new_values
  ) values (
    auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles
for each row execute function private.capture_sensitive_change();
create trigger audit_rooms after insert or update or delete on public.rooms
for each row execute function private.capture_sensitive_change();
create trigger audit_guests after insert or update or delete on public.guests
for each row execute function private.capture_sensitive_change();
create trigger audit_reservations after insert or update or delete on public.reservations
for each row execute function private.capture_sensitive_change();
create trigger audit_room_assignments after insert or update or delete on public.room_assignments
for each row execute function private.capture_sensitive_change();
create trigger audit_availability_blocks after insert or update or delete on public.availability_blocks
for each row execute function private.capture_sensitive_change();
create trigger audit_payments after insert or update or delete on public.payments
for each row execute function private.capture_sensitive_change();
create trigger audit_housekeeping after insert or update or delete on public.housekeeping_tasks
for each row execute function private.capture_sensitive_change();
create trigger audit_maintenance after insert or update or delete on public.maintenance_issues
for each row execute function private.capture_sensitive_change();
create trigger audit_internal_notes after insert or update or delete on public.internal_notes
for each row execute function private.capture_sensitive_change();

revoke all on function private.capture_sensitive_change() from public, anon, authenticated;

commit;
