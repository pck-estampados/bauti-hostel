-- Read-only assertions against the disposable LOCAL bootstrap, never production.
begin read only;
do $$
declare t record; n bigint;
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 13 then
    raise exception 'Expected 13 applied repository migrations';
  end if;
  if (select count(*) from public.roles) <> 5
    or (select count(*) from public.permissions) <> 26
    or (select count(*) from public.role_permissions) <> 65
    or (select count(*) from public.room_services) <> 6 then
    raise exception 'Structural seed mismatch';
  end if;
  if not exists (select 1 from storage.buckets where id = 'hostel-media' and public
    and file_size_limit = 6291456 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and cardinality(allowed_mime_types) = 3) then
    raise exception 'Media bucket contract mismatch';
  end if;
  for t in select tablename from pg_tables where schemaname='public'
    and tablename not in ('roles','permissions','role_permissions','room_services','audit_logs') loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    if n <> 0 then raise exception 'Bootstrap contains non-structural rows: %', t.tablename; end if;
  end loop;
  if (select count(*) from public.audit_logs) <> 4 or exists (
    select 1 from public.audit_logs a
    where a.actor_id is not null or a.table_name <> 'role_permissions' or a.action <> 'insert'
      or not exists (
        select 1 from public.roles r cross join public.permissions p
        where r.id::text = a.new_values->>'role_id' and r.code='owner'
          and p.id::text = a.new_values->>'permission_id'
          and p.code in ('media.read','media.manage','experiences.read','experiences.manage')
      )
  ) then raise exception 'Unexpected bootstrap audit records'; end if;
  if exists (select 1 from auth.users) or exists (select 1 from storage.objects)
    or exists (select 1 from private.operation_rate_limits) then
    raise exception 'Bootstrap contains test users, objects or rate-limit records';
  end if;
  if (select count(*) from pg_tables where schemaname='public') <> 31
    or exists (select 1 from pg_tables where schemaname='public' and not rowsecurity) then
    raise exception 'Application table/RLS mismatch';
  end if;
  if (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname in ('public','private') and c.contype='x') <> 2 then
    raise exception 'Missing exclusion constraints';
  end if;
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where extname in ('pgcrypto','btree_gist') and nspname <> 'extensions') then
    raise exception 'App extensions must be in extensions';
  end if;
  if has_function_privilege('anon','public.register_payment(jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.register_payment(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','private.capture_sensitive_change()','EXECUTE') then
    raise exception 'Function ACL mismatch';
  end if;
  -- Guard both direct grants and inherited PUBLIC access after every replay.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in ('enforce_rate_limit','hostel_today',
      'log_activity','log_audit','reservation_balance','reservation_paid_total')
      and (has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then raise exception 'Bootstrap ACL drift: private helper client EXECUTE'; end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('wellness_booking_code_seq','wellness_booking_events_id_seq')
      and (has_sequence_privilege('anon',c.oid,'UPDATE')
        or has_sequence_privilege('authenticated',c.oid,'UPDATE'))
  ) then raise exception 'Bootstrap ACL drift: wellness sequence client UPDATE'; end if;
  if not has_function_privilege('authenticated','private.has_permission(text,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','private.is_active_staff(uuid)','EXECUTE')
    or has_function_privilege('authenticated','private.require_permission(text)','EXECUTE') then
    raise exception 'Intentional RLS helper ACL changed';
  end if;
  -- Future private non-trigger helpers must opt into an intentional client ACL.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('has_permission','is_active_staff')
      and (has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then raise exception 'Unexpected private function client EXECUTE'; end if;
  if has_table_privilege('anon','public.media_assets','SELECT')
    or not has_column_privilege('anon','public.media_assets','alt_text','SELECT')
    or has_column_privilege('anon','public.media_assets','original_filename','SELECT') then
    raise exception 'Public media column allowlist mismatch';
  end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
    and policyname like 'hostel_media%') < 2 then
    raise exception 'Missing Storage policies';
  end if;
end;
$$;
select 'PASS: 13 migrations; structural seeds 5/26/65/6; 31 public tables with RLS; business/auth/media empty; critical grants/constraints/bucket';
rollback;
