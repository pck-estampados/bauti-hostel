-- READ ONLY structural comparison. No personal data, settings values or keys.
with app_relations as (
  select c.*,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','v','S')
    and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), app_functions as (
  select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), catalog as (
  select 'relations' as kind,nspname||'.'||relname as key,
    jsonb_build_object('kind',relkind,'rls',relrowsecurity,'forceRls',relforcerowsecurity,'options',reloptions) as value from app_relations
  union all select 'columns',c.nspname||'.'||c.relname||'.'||a.attname,
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid))
    from app_relations c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relkind in ('r','v')
  union all select 'enums',n.nspname||'.'||t.typname,jsonb_agg(e.enumlabel order by e.enumsortorder)
    from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
    where n.nspname='public' group by n.nspname,t.typname
  union all select 'constraints',r.nspname||'.'||r.relname||'.'||c.conname,
    jsonb_build_object('type',c.contype,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated)
    from pg_constraint c join app_relations r on r.oid=c.conrelid
  union all select 'indexes',r.nspname||'.'||r.relname||'.'||c.relname,
    jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid)
    from pg_index i join app_relations r on r.oid=i.indrelid join pg_class c on c.oid=i.indexrelid
  union all select 'functions',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('result',pg_get_function_result(p.oid),'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,
      'language',l.lanname,'bodyHash',md5(regexp_replace(trim(p.prosrc),'\s+',' ','g')),
      'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'))
    from app_functions p join pg_language l on l.oid=p.prolang
  union all select 'triggers',n.nspname||'.'||c.relname||'.'||t.tgname,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join app_functions f on f.oid=t.tgfoid where not t.tgisinternal
  union all select 'policies',schemaname||'.'||tablename||'.'||policyname,
    jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
    from pg_policies where schemaname in ('public','private') or (schemaname='storage' and policyname like 'hostel_media%')
  union all select 'grants',r.nspname||'.'||r.relname||'.'||role||'.'||privilege,to_jsonb(has_table_privilege(role,r.oid,privilege))
    from app_relations r cross join unnest(array['anon','authenticated']) role
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE']) privilege where r.relkind in ('r','v')
  union all select 'columnGrants',r.nspname||'.'||r.relname||'.'||a.attname||'.'||role||'.'||privilege,
    to_jsonb(has_column_privilege(role,r.oid,a.attnum,privilege))
    from app_relations r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
    cross join unnest(array['anon','authenticated']) role cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) privilege where r.relkind in ('r','v')
  union all select 'sequenceGrants',r.nspname||'.'||r.relname||'.'||role||'.'||privilege,to_jsonb(has_sequence_privilege(role,r.oid,privilege))
    from app_relations r cross join unnest(array['anon','authenticated']) role cross join unnest(array['USAGE','SELECT','UPDATE']) privilege where r.relkind='S'
  union all select 'schemaGrants',schema||'.'||role||'.'||privilege,to_jsonb(has_schema_privilege(role,schema,privilege))
    from unnest(array['public','private']) schema cross join unnest(array['anon','authenticated']) role cross join unnest(array['USAGE','CREATE']) privilege
  union all select 'extensions',e.extname,jsonb_build_object('version',e.extversion,'schema',n.nspname)
    from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pgcrypto','btree_gist')
  union all select 'roles',code,jsonb_build_object('name',name,'system',is_system) from public.roles
  union all select 'permissions',code,to_jsonb(description) from public.permissions
  union all select 'rolePermissions',r.code||'.'||p.code,'true'::jsonb from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id
  union all select 'roomServices',code,jsonb_build_object('name',name,'description',description,'system',is_system) from public.room_services
  union all select 'bucket',id,jsonb_build_object('public',public,'limit',file_size_limit,'mime',allowed_mime_types) from storage.buckets where id='hostel-media'
)
select jsonb_agg(jsonb_build_object('kind',kind,'key',key,'value',value) order by kind,key) from catalog;
