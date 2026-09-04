-- T2: local-only development. No commercial seeds. Existing migrations immutable.
begin;

alter table public.room_types add column sales_enabled boolean not null default false;

insert into public.permissions(code,description) values
 ('rates.read','Consultar tarifas de alojamiento.'),
 ('rates.manage','Administrar reglas tarifarias y fechas especiales.'),
 ('availability.read','Consultar disponibilidad y holds de alojamiento.'),
 ('availability.manage','Administrar holds temporales de alojamiento.');
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p
 where r.code in ('owner','admin') and p.code in ('rates.read','rates.manage','availability.read','availability.manage');

insert into public.settings(key,value) values
 ('lodging.holds','{"webMinutes":15,"adminMinutes":120}'::jsonb);

create table public.lodging_rate_rules (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.room_types(id) on delete restrict,
 name text not null check (length(trim(name)) between 2 and 100),
 kind text not null check (kind in ('day','promotion','override')),
 day_kind text not null check (day_kind in ('normal','holiday','special','any')),
 weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
 valid_from date not null,
 valid_until date,
 amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
 currency text not null default 'ARS' check (currency='ARS'),
 minimum_stay integer not null default 1 check (minimum_stay between 1 and 60),
 conditions text not null default '' check (length(conditions)<=500),
 active boolean not null default true,
 sales_enabled boolean not null default false,
 version integer not null default 1 check (version>0),
 created_by uuid not null references public.profiles(id) on delete restrict,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (valid_until is null or valid_until >= valid_from),
 check (kind<>'promotion' or (valid_until is not null and length(trim(conditions))>=2)),
 check (kind<>'override' or (valid_until is not null and valid_until=valid_from)),
 check (kind<>'day' or day_kind<>'any'),
 check (not sales_enabled or active)
);
create index lodging_rates_category_idx on public.lodging_rate_rules(category_id,valid_from,valid_until) where active and sales_enabled;
create index lodging_rates_created_by_idx on public.lodging_rate_rules(created_by);
create index lodging_rates_updated_by_idx on public.lodging_rate_rules(updated_by);

create table public.lodging_special_dates (
 date date primary key,
 kind text not null check (kind in ('HOLIDAY','SPECIAL','NORMAL_OVERRIDE')),
 name text not null check (length(trim(name)) between 2 and 100),
 active boolean not null default true,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create index lodging_special_dates_actor_idx on public.lodging_special_dates(updated_by);

create table public.lodging_holds (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.room_types(id) on delete restrict,
 room_id uuid not null references public.rooms(id) on delete restrict,
 check_in date not null,
 check_out date not null,
 stay daterange generated always as (daterange(check_in,check_out,'[)')) stored,
 adults integer not null check (adults between 1 and 30),
 children integer not null check (children between 0 and 29),
 party_size integer generated always as (adults+children) stored,
 source text not null check (source in ('web','whatsapp','phone','walk_in','instagram','referral','admin','other')),
 status text not null default 'ACTIVE' check (status in ('ACTIVE','CONSUMED','EXPIRED','CANCELLED')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id) on delete restrict,
 visitor_hash text check (visitor_hash ~ '^[a-f0-9]{64}$'),
 price_snapshot jsonb not null check (jsonb_typeof(price_snapshot)='object' and price_snapshot->>'currency'='ARS' and (price_snapshot->>'complete')::boolean),
 currency text not null default 'ARS' check (currency='ARS'),
 check (check_out>check_in and check_out-check_in<=60),
 check (adults+children<=30),
 check (expires_at>created_at and expires_at<=created_at+interval '2 hours'),
 check ((created_by is null)<>(visitor_hash is null)),
 constraint lodging_holds_no_overlap exclude using gist (room_id with =,stay with &&) where (status='ACTIVE')
);
create index lodging_holds_category_idx on public.lodging_holds(category_id);
create index lodging_holds_actor_idx on public.lodging_holds(created_by);
create index lodging_holds_expiry_idx on public.lodging_holds(expires_at) where status='ACTIVE';
create index lodging_holds_visitor_idx on public.lodging_holds(visitor_hash) where status='ACTIVE';

alter table public.lodging_rate_rules enable row level security;
alter table public.lodging_special_dates enable row level security;
alter table public.lodging_holds enable row level security;
revoke all on public.lodging_rate_rules,public.lodging_special_dates,public.lodging_holds from public,anon,authenticated;
grant select on public.lodging_rate_rules,public.lodging_special_dates to authenticated;
-- Never grant generic SELECT on holds: even staff do not need the visitor hash.
grant select(id,category_id,room_id,check_in,check_out,adults,children,party_size,source,status,expires_at,created_at,updated_at,created_by,price_snapshot,currency)
 on public.lodging_holds to authenticated;
create policy lodging_rates_read on public.lodging_rate_rules for select to authenticated using ((select private.has_permission('rates.read')));
create policy lodging_dates_read on public.lodging_special_dates for select to authenticated using ((select private.has_permission('rates.read')));
create policy lodging_holds_read on public.lodging_holds for select to authenticated using ((select private.has_permission('availability.read')));

create function private.validate_lodging_settings() returns trigger language plpgsql set search_path='' as $$
begin
 if new.key='lodging.holds' and (
  jsonb_typeof(new.value)<>'object' or not (new.value ?& array['webMinutes','adminMinutes'])
  or new.value-array['webMinutes','adminMinutes']<>'{}'::jsonb
  or not coalesce(new.value->>'webMinutes' ~ '^[0-9]+$',false)
  or not coalesce(new.value->>'adminMinutes' ~ '^[0-9]+$',false)
  or (new.value->>'webMinutes')::integer not between 1 and 120
  or (new.value->>'adminMinutes')::integer not between 1 and 120
 ) then raise exception using errcode='22023',message='INVALID_HOLD_SETTINGS'; end if;
 return new;
end $$;
create trigger validate_lodging_settings before insert or update on public.settings for each row execute function private.validate_lodging_settings();

create function private.validate_lodging_request(p_in date,p_out date,p_adults integer,p_children integer)
returns void language plpgsql stable set search_path='' as $$
begin
 if p_in is null or p_out is null or p_out<=p_in or p_out-p_in>60
  or p_in<private.hostel_today() or p_in>private.hostel_today()+730
  or p_adults is null or p_children is null or p_adults<1 or p_children<0 or p_adults+p_children>30 then
  raise exception using errcode='22023',message='INVALID_LODGING_REQUEST';
 end if;
end $$;

create function private.guard_lodging_rate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Per-category serialization makes overlapping-rule validation race safe.
 perform pg_advisory_xact_lock(hashtextextended(new.category_id::text,21));
 if new.active and new.sales_enabled and exists (
  select 1 from public.lodging_rate_rules r where r.id<>new.id and r.category_id=new.category_id
   and r.active and r.sales_enabled and r.kind=new.kind
   and daterange(r.valid_from,r.valid_until,'[]') && daterange(new.valid_from,new.valid_until,'[]')
   and (new.kind='override' or ((r.day_kind=new.day_kind or r.day_kind='any' or new.day_kind='any') and r.weekdays && new.weekdays))
 ) then raise exception using errcode='23514',message='AMBIGUOUS_RATE'; end if;
 if tg_op='UPDATE' then new.version:=old.version+1; new.updated_at:=now(); end if;
 return new;
end $$;
create trigger lodging_rates_guard before insert or update on public.lodging_rate_rules for each row execute function private.guard_lodging_rate();

create function private.lodging_quote(p_category uuid,p_in date,p_out date,p_adults integer,p_children integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare c public.room_types; d date; day_type text; base public.lodging_rate_rules; chosen public.lodging_rate_rules;
 lines jsonb:='[]'; total numeric:=0; complete boolean:=true; minimum integer:=1; reasons jsonb:='[]';
begin
 perform private.validate_lodging_request(p_in,p_out,p_adults,p_children);
 select * into c from public.room_types where id=p_category;
 if not found or not c.active or not c.sales_enabled then reasons:='["CATEGORY_DISABLED"]'; complete:=false;
 elsif c.default_capacity<p_adults+p_children then reasons:='["CAPACITY_EXCEEDED"]'; complete:=false; end if;
 if complete then
  for d in select p_in+i from generate_series(0,p_out-p_in-1) i loop
   select case s.kind when 'HOLIDAY' then 'holiday' when 'SPECIAL' then 'special' else 'normal' end into day_type
    from public.lodging_special_dates s where s.date=d and s.active;
   day_type:=coalesce(day_type,'normal');
   select * into base from public.lodging_rate_rules r where r.category_id=p_category and r.active and r.sales_enabled
    and r.kind='day' and r.day_kind=day_type and extract(isodow from d)::integer=any(r.weekdays)
    and d>=r.valid_from and (r.valid_until is null or d<=r.valid_until) order by r.id limit 1;
   select * into chosen from public.lodging_rate_rules r where r.category_id=p_category and r.active and r.sales_enabled
    and d>=r.valid_from and (r.valid_until is null or d<=r.valid_until)
    and (r.kind='override' or (extract(isodow from d)::integer=any(r.weekdays) and (r.day_kind=day_type or r.day_kind='any')))
    order by case r.kind when 'override' then 3 when 'promotion' then 2 else 1 end desc,r.id limit 1;
   if chosen.id is null then complete:=false; end if;
   minimum:=greatest(minimum,coalesce(chosen.minimum_stay,1));
   total:=total+coalesce(chosen.amount,0);
   lines:=lines||jsonb_build_array(jsonb_build_object('date',d,'category',c.code,'rate_source',coalesce(chosen.kind,'NO_RATE'),
    'base_amount',base.amount,'adjustment',case when chosen.kind in ('promotion','override') then chosen.kind end,
    'final_amount',chosen.amount,'currency','ARS','rule_id',chosen.id,'rule_version',chosen.version));
  end loop;
  if not complete then reasons:=reasons||'"NO_RATE"'::jsonb; end if;
  if p_out-p_in<minimum then complete:=false; reasons:=reasons||'"MINIMUM_STAY"'::jsonb; end if;
 end if;
 return jsonb_build_object('version',1,'quoted_at',statement_timestamp(),'category',c.code,'check_in',p_in,'check_out',p_out,
  'adults',p_adults,'children',p_children,'currency','ARS','complete',complete,'total',case when complete then total end,
  'minimum_stay',minimum,'nights',lines,'reasons',reasons);
end $$;

-- One occupancy read model for public/admin queries and all calendar write guards.
create function private.lodging_room_conflict(p_room uuid,p_in date,p_out date,p_ignore_table text default '',p_ignore_id uuid default null)
returns text language plpgsql volatile set search_path='' as $$
begin
 if exists(select 1 from public.room_assignments a where a.room_id=p_room and a.status='active'
  and a.stay && daterange(p_in,p_out,'[)') and not (p_ignore_table='room_assignments' and a.id is not distinct from p_ignore_id)) then return 'RESERVED'; end if;
 if exists(select 1 from public.availability_blocks b where b.room_id=p_room and b.status='active'
  and b.stay && daterange(p_in,p_out,'[)') and not (p_ignore_table='availability_blocks' and b.id is not distinct from p_ignore_id)) then return 'BLOCKED'; end if;
 if exists(select 1 from public.lodging_holds h where h.room_id=p_room and h.status='ACTIVE' and h.expires_at>clock_timestamp()
  and h.stay && daterange(p_in,p_out,'[)') and not (p_ignore_table='lodging_holds' and h.id is not distinct from p_ignore_id)) then return 'HELD'; end if;
 return null;
end $$;

create function private.lodging_room_state(p_room uuid,p_in date,p_out date,p_party integer)
returns text language plpgsql volatile set search_path='' as $$
declare r public.rooms; c public.room_types; capacity integer; conflict text;
begin
 select * into r from public.rooms where id=p_room;
 if not found or not r.active then return 'INACTIVE'; end if;
 select * into c from public.room_types where id=r.room_type_id;
 if not found or not c.active or not c.sales_enabled then return 'CATEGORY_DISABLED'; end if;
 if r.capacity<p_party or c.default_capacity<p_party then return 'CAPACITY_EXCEEDED'; end if;
 select coalesce(sum(b.capacity*b.quantity),0) into capacity from public.beds b where b.room_id=r.id and b.active;
 if capacity<r.capacity then return 'INVENTORY_INCOMPLETE'; end if;
 conflict:=private.lodging_room_conflict(p_room,p_in,p_out);
 if conflict is not null then return conflict; end if;
 if r.status not in ('available','clean','ready') then return 'NOT_SELLABLE'; end if;
 return 'AVAILABLE';
end $$;

create or replace function private.assert_room_calendar_available()
returns trigger language plpgsql security definer set search_path='' as $$
declare conflict text;
begin
 if new.status::text not in ('active','ACTIVE') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.room_id::text,0));
 conflict:=private.lodging_room_conflict(new.room_id,new.check_in,new.check_out,tg_table_name,new.id);
 if conflict is not null then
  -- Same-table overlaps remain protected by the original GiST constraints.
  if not ((tg_table_name='room_assignments' and conflict='RESERVED') or (tg_table_name='availability_blocks' and conflict='BLOCKED') or (tg_table_name='lodging_holds' and conflict='HELD')) then
   raise exception using errcode='23P01',message='ROOM_NOT_AVAILABLE';
  end if;
 end if;
 return new;
end $$;
create trigger lodging_holds_calendar_guard before insert or update of room_id,check_in,check_out,status on public.lodging_holds
 for each row execute function private.assert_room_calendar_available();

create function private.guard_lodging_hold() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['status','updated_at','stay','party_size']) is distinct from (to_jsonb(old)-array['status','updated_at','stay','party_size']) then
   raise exception using errcode='23514',message='HOLD_IMMUTABLE'; end if;
  if old.status<>'ACTIVE' or new.status not in ('CANCELLED','EXPIRED')
   or (new.status='EXPIRED' and old.expires_at>clock_timestamp()) then
   raise exception using errcode='23514',message='HOLD_TRANSITION_NOT_ALLOWED'; end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;
create trigger lodging_hold_immutable before update on public.lodging_holds for each row execute function private.guard_lodging_hold();

create function private.audit_lodging_change() returns trigger language plpgsql security definer set search_path='' as $$
declare event text; safe jsonb; record uuid;
begin
 if tg_table_name='lodging_rate_rules' then
  event:=case when tg_op='INSERT' then 'RATE_CREATED' when not new.active then 'RATE_DISABLED' else 'RATE_UPDATED' end;
  safe:=jsonb_build_object('kind',new.kind,'active',new.active,'sales_enabled',new.sales_enabled,'version',new.version); record:=new.id;
 elsif tg_table_name='lodging_special_dates' then
  event:='SPECIAL_DATE_CHANGED'; safe:=jsonb_build_object('date',new.date,'kind',new.kind,'active',new.active); record:=null;
 else
  event:=case when tg_op='INSERT' then 'HOLD_CREATED' else 'HOLD_'||new.status end;
  safe:=jsonb_build_object('status',new.status,'source',new.source); record:=new.id;
 end if;
 perform private.log_audit(event,tg_table_name,record,null,safe);
 perform private.log_activity(event,tg_table_name,record,event,safe);
 return new;
end $$;
create trigger audit_lodging_rates after insert or update on public.lodging_rate_rules for each row execute function private.audit_lodging_change();
create trigger audit_lodging_dates after insert or update on public.lodging_special_dates for each row execute function private.audit_lodging_change();
create trigger audit_lodging_holds after insert or update on public.lodging_holds for each row execute function private.audit_lodging_change();

create function public.get_lodging_availability(p_check_in date,p_check_out date,p_adults integer,p_children integer,p_category text default null)
returns table(category text,public_name text,capacity integer,available boolean,eligible_room_count integer,quote jsonb,reasons jsonb)
language plpgsql security definer set search_path='' as $$
declare c public.room_types; q jsonb; n integer;
begin
 perform private.validate_lodging_request(p_check_in,p_check_out,p_adults,p_children);
 for c in select * from public.room_types t where t.active and t.sales_enabled and (p_category is null or t.code=p_category) order by t.code loop
  q:=private.lodging_quote(c.id,p_check_in,p_check_out,p_adults,p_children);
  select count(*)::integer into n from public.rooms r where r.room_type_id=c.id
   and private.lodging_room_state(r.id,p_check_in,p_check_out,p_adults+p_children)='AVAILABLE';
  return query select c.code,coalesce(nullif(c.public_name,''),c.name),c.default_capacity::integer,
   n>0 and (q->>'complete')::boolean,n,q,(q->'reasons')||case when n=0 then '["NO_ROOMS"]'::jsonb else '[]'::jsonb end;
 end loop;
end $$;

create function public.save_lodging_rate(p_id uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; category uuid;
begin
 perform private.require_permission('rates.manage'); perform private.enforce_rate_limit('lodging.rate',60,interval '1 minute');
 category:=(p_payload->>'categoryId')::uuid;
 if p_id is not null and not exists(select 1 from public.lodging_rate_rules where id=p_id and category_id=category) then
  raise exception using errcode='22023',message='INVALID_RATE'; end if;
 insert into public.lodging_rate_rules(id,category_id,name,kind,day_kind,weekdays,valid_from,valid_until,amount,minimum_stay,conditions,active,sales_enabled,created_by,updated_by)
 values(coalesce(p_id,gen_random_uuid()),category,trim(p_payload->>'name'),p_payload->>'kind',p_payload->>'dayKind',
  array(select jsonb_array_elements_text(p_payload->'weekdays')::integer),(p_payload->>'validFrom')::date,nullif(p_payload->>'validUntil','')::date,
  (p_payload->>'amount')::numeric,(p_payload->>'minimumStay')::integer,coalesce(p_payload->>'conditions',''),
  (p_payload->>'active')::boolean,(p_payload->>'salesEnabled')::boolean,auth.uid(),auth.uid())
 on conflict(id) do update set name=excluded.name,kind=excluded.kind,day_kind=excluded.day_kind,weekdays=excluded.weekdays,
  valid_from=excluded.valid_from,valid_until=excluded.valid_until,amount=excluded.amount,minimum_stay=excluded.minimum_stay,
  conditions=excluded.conditions,active=excluded.active,sales_enabled=excluded.sales_enabled,updated_by=auth.uid()
 returning id into result;
 return result;
end $$;

create function public.save_lodging_special_date(p_date date,p_kind text,p_name text,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('rates.manage'); perform private.enforce_rate_limit('lodging.date',60,interval '1 minute');
 insert into public.lodging_special_dates(date,kind,name,active,updated_by) values(p_date,p_kind,trim(p_name),p_active,auth.uid())
 on conflict(date) do update set kind=excluded.kind,name=excluded.name,active=excluded.active,updated_by=auth.uid(),updated_at=now();
end $$;

create function public.save_lodging_hold_settings(p_web_minutes integer,p_admin_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('rates.manage');
 update public.settings set value=jsonb_build_object('webMinutes',p_web_minutes,'adminMinutes',p_admin_minutes),updated_by=auth.uid() where key='lodging.holds';
end $$;

create function public.set_lodging_category_sales(p_category uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('rates.manage');
 if p_enabled is null then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
 update public.room_types set sales_enabled=p_enabled where id=p_category;
 if not found then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
end $$;

create function public.get_lodging_admin_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('rates.read');
 return jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'name',coalesce(nullif(t.public_name,''),t.name),'capacity',t.default_capacity,'active',t.active,'salesEnabled',t.sales_enabled) order by t.code) from public.room_types t),'[]'::jsonb),
  'rates',coalesce((select jsonb_agg(to_jsonb(r)-array['created_by','updated_by'] order by r.valid_from,r.id) from public.lodging_rate_rules r),'[]'::jsonb),
  'specialDates',coalesce((select jsonb_agg(to_jsonb(s)-'updated_by' order by s.date) from public.lodging_special_dates s),'[]'::jsonb),
  'holdSettings',(select value from public.settings where key='lodging.holds'));
end $$;

create function public.get_lodging_admin_availability(p_check_in date,p_check_out date,p_adults integer,p_children integer,p_category text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('availability.read');
 perform private.validate_lodging_request(p_check_in,p_check_out,p_adults,p_children);
 return jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(a)) from public.get_lodging_availability(p_check_in,p_check_out,p_adults,p_children,p_category) a),'[]'::jsonb),
  'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.display_name,'category',t.code,'state',private.lodging_room_state(r.id,p_check_in,p_check_out,p_adults+p_children)) order by r.code)
   from public.rooms r left join public.room_types t on t.id=r.room_type_id where p_category is null or t.code=p_category),'[]'::jsonb),
  'holds',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'category',t.code,'checkIn',h.check_in,'checkOut',h.check_out,'source',h.source,'expiresAt',h.expires_at,'status',case when h.status='ACTIVE' and h.expires_at<=clock_timestamp() then 'EXPIRED' else h.status end) order by h.created_at desc)
   from public.lodging_holds h join public.room_types t on t.id=h.category_id where h.stay && daterange(p_check_in,p_check_out,'[)') and (p_category is null or t.code=p_category)),'[]'::jsonb));
end $$;

-- Token is 256 bits, supplied in a body/cookie, never in a URL or audit event.
create function private.lodging_visitor_hash(p_token text) returns text language plpgsql immutable set search_path='' as $$
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='HOLD_NOT_FOUND'; end if;
 return encode(extensions.digest(p_token,'sha256'),'hex');
end $$;

create function private.limit_lodging_hold(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare subject uuid; attempt integer; identity text;
begin
 -- Conservative ceilings: per visitor 5/min, globally 120/min. Successful creates
 -- count; rotating visitor tokens cannot bypass the global cap. No PII/IP storage.
 for identity in select unnest(array[coalesce(p_hash,auth.uid()::text),'global-lodging']) loop
  subject:=md5(identity)::uuid;
  insert into private.operation_rate_limits(user_id,action,window_started_at,attempts) values(subject,'lodging.hold',clock_timestamp(),1)
  on conflict(user_id,action) do update set
   attempts=case when operation_rate_limits.window_started_at<=clock_timestamp()-interval '1 minute' then 1 else operation_rate_limits.attempts+1 end,
   window_started_at=case when operation_rate_limits.window_started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else operation_rate_limits.window_started_at end
  returning attempts into attempt;
  if attempt>(case when identity='global-lodging' then 120 else 5 end) then raise exception using errcode='P0001',message='RATE_LIMITED'; end if;
 end loop;
end $$;

create function public.create_lodging_hold(p_category text,p_check_in date,p_check_out date,p_adults integer,p_children integer,
 p_visitor_token text default null,p_source text default 'web',p_minutes integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.room_types; r public.rooms; h public.lodging_holds; q jsonb; hash text; ttl integer; config jsonb; created timestamptz;
begin
 perform private.validate_lodging_request(p_check_in,p_check_out,p_adults,p_children);
 select value into config from public.settings where key='lodging.holds';
 if auth.uid() is null then
  hash:=private.lodging_visitor_hash(p_visitor_token);
  if p_source is distinct from 'web' or p_minutes is not null then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;
  ttl:=(config->>'webMinutes')::integer;
 else
  perform private.require_permission('availability.manage');
  ttl:=coalesce(p_minutes,(config->>'adminMinutes')::integer);
  if ttl>(config->>'adminMinutes')::integer then raise exception using errcode='22023',message='INVALID_HOLD_TTL'; end if;
 end if;
 if ttl is null or ttl not between 1 and 120 then raise exception using errcode='22023',message='INVALID_HOLD_TTL'; end if;
 perform private.limit_lodging_hold(hash);
 if hash is not null and exists(select 1 from public.lodging_holds where visitor_hash=hash and status='ACTIVE' and expires_at>clock_timestamp()) then
  raise exception using errcode='23514',message='ACTIVE_HOLD_EXISTS'; end if;
 select * into c from public.room_types where code=p_category;
 if not found then raise exception using errcode='22023',message='CATEGORY_DISABLED'; end if;
 q:=private.lodging_quote(c.id,p_check_in,p_check_out,p_adults,p_children);
 if not (q->>'complete')::boolean then raise exception using errcode='23514',message='NOT_QUOTABLE'; end if;
 -- Same row->advisory ordering as the existing reservation RPC. No network work
 -- inside this transaction. SKIP LOCKED returns a conservative conflict if busy.
 for r in select * from public.rooms where room_type_id=c.id order by id for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
  update public.lodging_holds set status='EXPIRED' where room_id=r.id and status='ACTIVE' and expires_at<=clock_timestamp();
  if private.lodging_room_state(r.id,p_check_in,p_check_out,p_adults+p_children)<>'AVAILABLE' then continue; end if;
  created:=clock_timestamp();
  insert into public.lodging_holds(category_id,room_id,check_in,check_out,adults,children,source,created_at,expires_at,created_by,visitor_hash,price_snapshot)
   values(c.id,r.id,p_check_in,p_check_out,p_adults,p_children,p_source,created,created+make_interval(mins=>ttl),auth.uid(),hash,q) returning * into h;
  return jsonb_build_object('id',h.id,'status',h.status,'expiresAt',h.expires_at,'quote',h.price_snapshot);
 end loop;
 raise exception using errcode='23P01',message='NO_AVAILABILITY';
end $$;

create function public.cancel_lodging_hold(p_id uuid,p_visitor_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.lodging_holds; hash text;
begin
 if auth.uid() is null then hash:=private.lodging_visitor_hash(p_visitor_token);
 else perform private.require_permission('availability.manage'); end if;
 select * into h from public.lodging_holds where id=p_id and (auth.uid() is not null or visitor_hash=hash);
 if not found then raise exception using errcode='42501',message='HOLD_NOT_FOUND'; end if;
 perform 1 from public.rooms where id=h.room_id for update;
 perform pg_advisory_xact_lock(hashtextextended(h.room_id::text,0));
 select * into h from public.lodging_holds where id=p_id for update;
 if h.status='ACTIVE' then
  update public.lodging_holds set status=case when expires_at<=clock_timestamp() then 'EXPIRED' else 'CANCELLED' end where id=p_id returning * into h;
 end if;
 return jsonb_build_object('id',h.id,'status',h.status);
end $$;

create function public.save_lodging_block(p_room uuid,p_check_in date,p_check_out date,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_permission('rooms.inventory_manage');
 perform private.validate_lodging_request(p_check_in,p_check_out,1,0);
 perform 1 from public.rooms where id=p_room for update;
 insert into public.availability_blocks(room_id,check_in,check_out,reason,created_by)
  values(p_room,p_check_in,p_check_out,trim(p_reason),auth.uid()) returning id into result;
 return result;
end $$;

-- Explicit RPC allowlist; private helpers never executable by clients.
revoke all on function private.validate_lodging_settings(),private.validate_lodging_request(date,date,integer,integer),
 private.guard_lodging_rate(),private.lodging_quote(uuid,date,date,integer,integer),
 private.lodging_room_conflict(uuid,date,date,text,uuid),private.lodging_room_state(uuid,date,date,integer),
 private.guard_lodging_hold(),private.audit_lodging_change(),private.lodging_visitor_hash(text),private.limit_lodging_hold(text)
 from public,anon,authenticated,service_role;
revoke all on function public.get_lodging_availability(date,date,integer,integer,text),
 public.save_lodging_rate(uuid,jsonb),public.save_lodging_special_date(date,text,text,boolean),public.save_lodging_hold_settings(integer,integer),
 public.set_lodging_category_sales(uuid,boolean),public.get_lodging_admin_snapshot(),public.get_lodging_admin_availability(date,date,integer,integer,text),
 public.create_lodging_hold(text,date,date,integer,integer,text,text,integer),public.cancel_lodging_hold(uuid,text),public.save_lodging_block(uuid,date,date,text)
 from public,anon,authenticated,service_role;
grant execute on function public.get_lodging_availability(date,date,integer,integer,text),
 public.create_lodging_hold(text,date,date,integer,integer,text,text,integer),public.cancel_lodging_hold(uuid,text) to anon,authenticated;
grant execute on function public.save_lodging_rate(uuid,jsonb),public.save_lodging_special_date(date,text,text,boolean),public.save_lodging_hold_settings(integer,integer),
 public.set_lodging_category_sales(uuid,boolean),public.get_lodging_admin_snapshot(),public.get_lodging_admin_availability(date,date,integer,integer,text),public.save_lodging_block(uuid,date,date,text) to authenticated;

comment on function public.create_lodging_hold(text,date,date,integer,integer,text,text,integer) is
 'T2 category hold: validates quote and inventory inside one transaction using the existing room calendar lock. No checkout or standalone consume.';
comment on table public.lodging_holds is 'T3 conversion MUST be a single transaction. CONSUMED is reserved and intentionally unreachable in T2; snapshot/allocation immutable.';
commit;
