-- READ ONLY release gate, distinct from the current-state no-expansion contract.
-- Production grants no direct UPDATE to service_role on app sequences.
-- Also guards future sequences inheriting permissive platform defaults.
begin read only;
do $$
declare excessive text;
begin
  select string_agg(n.nspname||'.'||c.relname, ', ' order by c.relname) into excessive
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='S' and n.nspname in ('public','private')
    and case when c.relkind='S' then has_sequence_privilege('service_role',c.oid,'UPDATE') else false end;
  if excessive is not null then
    raise exception 'BRANCHING NOT READY: service_role sequence UPDATE drift: %', excessive;
  end if;
end;
$$;
select 'PASS: no service_role sequence UPDATE drift';
rollback;
