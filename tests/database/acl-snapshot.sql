-- Effective ACL contract. No business data or credentials; extension functions excluded.
with objects as (
  select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as name,
    'function' as kind,p.oid,p.proowner as owner,coalesce(p.proacl,acldefault('f',p.proowner)) as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and not exists (
    select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
  )
  union all
  select n.nspname||'.'||c.relname,'sequence',c.oid,c.relowner,coalesce(c.relacl,acldefault('S',c.relowner))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='S'
), permissions as (
  select name,kind,role,privilege,
    case when role='PUBLIC' then exists(select 1 from aclexplode(acl) a where a.grantee=0 and a.privilege_type=privilege)
      when kind='function' then has_function_privilege(role,oid,privilege)
      else has_sequence_privilege(role,oid,privilege) end as allowed
  from objects cross join unnest(array['PUBLIC','anon','authenticated','service_role']) role
    cross join lateral unnest(case when kind='function' then array['EXECUTE'] else array['USAGE','SELECT','UPDATE'] end) privilege
)
select jsonb_object_agg(kind||'|'||name||'|'||role||'|'||privilege,allowed order by kind,name,role,privilege) from permissions;
