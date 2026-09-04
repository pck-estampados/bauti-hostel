import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, sqlAsync, root } from "../../scripts/database-local.mjs";

const owner = "10000000-0000-4000-8000-000000000001";
const category = "20000000-0000-4000-8000-000000000001";
const room = "20000000-0000-4000-8000-000000000002";
const room2 = "40000000-0000-4000-8000-000000000002";
const reservation = "20000000-0000-4000-8000-000000000004";
const monday = "(date_trunc('week',current_date+14)::date)";
const day = (offset = 0) => `${monday}+${offset}`;
const asOwner = `reset role; set local role authenticated; set local request.jwt.claim.sub='${owner}';`;
const asAnon = "reset role; set local role anon; set local request.jwt.claim.sub='';";
const quote = (x) => `'${x.replaceAll("'", "''")}'`;
const call = (offset = 0, nights = 1, adults = 1, children = 0) => `private.lodging_quote('${category}',${day(offset)},${day(offset + nights)},${adults},${children})`;
const availability = (offset = 0, nights = 1, adults = 1, children = 0) => `(select to_jsonb(a) from public.get_lodging_availability(${day(offset)},${day(offset + nights)},${adults},${children},'test_local') a)`;
const hold = (offset = 0, nights = 1, token = null) => `public.create_lodging_hold('test_local',${day(offset)},${day(offset + nights)},1,0,${token ? `repeat('${token}',64)` : "null"},'${token ? "web" : "admin"}')`;
const helpers = `
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'T2 FAIL: %',label; end if; end $$;
create function pg_temp.fails(statement text,code text,message text default null) returns void language plpgsql as $$
declare actual text; detail text;
begin begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate,detail=message_text; end;
 if actual is distinct from code or (message is not null and detail is distinct from message) then raise exception 'T2 expected % / %, got % / %',code,message,actual,detail; end if;
end $$;`;
const rates = `
update public.room_types set sales_enabled=true where id='${category}';
insert into public.lodging_rate_rules(category_id,name,kind,day_kind,weekdays,valid_from,amount,active,sales_enabled,created_by,updated_by)
select '${category}',name,'day','normal',days,current_date,amount,true,true,'${owner}','${owner}'
from (values ('Synthetic weekday',array[1,2,3,4],70000),('Synthetic Friday',array[5],80000),('Synthetic Saturday',array[6],90000)) r(name,days,amount);
insert into public.lodging_rate_rules(category_id,name,kind,day_kind,weekdays,valid_from,amount,active,sales_enabled,created_by,updated_by)
values('${category}','Synthetic holiday','day','holiday',array[1,2,3,4,5,6,7],current_date,90000,true,true,'${owner}','${owner}');`;

export function testLodging() {
  const sections = ["begin;", readFileSync(join(root,"tests/database/fixtures.sql"),"utf8"), helpers,
    `set local request.jwt.claim.sub='${owner}'; update public.room_types set sales_enabled=true where id='${category}';`];
  let count = 0;
  const ok = (expression, label) => { sections.push(`select pg_temp.ok((${expression}),${quote(label)});`); count++; };
  const fails = (statement, code, label = null) => { sections.push(`select pg_temp.fails(${quote(statement)},'${code}',${label ? quote(label) : "null"});`); count++; };
  ok(`(${call()}->>'complete')::boolean=false and ${call()}->>'total' is null`, "1 category without rate, no legacy fallback");
  sections.push(rates);
  for (const [offset, expected, label] of [[0,70000,"2 Monday"],[1,70000,"Tuesday"],[2,70000,"Wednesday"],[3,70000,"Thursday"],[4,80000,"3 Friday"],[5,90000,"4 Saturday"]]) ok(`(${call(offset)}->>'total')::numeric=${expected}`,label);
  sections.push(`select public.save_lodging_special_date(${day(7)},'HOLIDAY','Synthetic holiday',true);`);
  ok(`(${call(7)}->>'total')::numeric=90000`,"5 holiday overrides ordinary weekday");
  sections.push(`insert into public.lodging_rate_rules(category_id,name,kind,day_kind,weekdays,valid_from,valid_until,amount,conditions,active,sales_enabled,created_by,updated_by)
    values('${category}','Synthetic promotion','promotion','any',array[1,2,3,4,5,6,7],${day()},${day(30)},60000,'Synthetic dated conditions',true,true,'${owner}','${owner}');`);
  ok(`(${call()}->>'total')::numeric=60000 and ${call()}#>>'{nights,0,rate_source}'='promotion'`,"7 promotion");
  sections.push(`insert into public.lodging_rate_rules(category_id,name,kind,day_kind,weekdays,valid_from,valid_until,amount,active,sales_enabled,created_by,updated_by)
    values('${category}','Synthetic override','override','any',array[1],${day()},${day()},75000,true,true,'${owner}','${owner}');`);
  ok(`(${call()}->>'total')::numeric=75000 and ${call()}#>>'{nights,0,rate_source}'='override'`,"6/8 date override precedence");
  ok(`(${call(0,2)}->>'total')::numeric=135000 and jsonb_array_length(${call(0,2)}->'nights')=2`,"9/10 multiple nights checkout excluded");
  ok(`${call()}->>'currency'='ARS' and ${call()}#>>'{nights,0,currency}'='ARS'`,"13 ARS");
  ok(`${call(0,1,2,1)}->>'complete'='false'`,"12 adults+children exceed category");
  sections.push("update public.lodging_rate_rules set active=false,sales_enabled=false where kind in ('promotion','override');");
  ok(`(${call()}->>'total')::numeric=70000`,"15 inactive promotion excluded");
  ok(`${call(6)}->>'total' is null and ${call(6)}->'reasons' ? 'NO_RATE'`,"14 ordinary Sunday pending");
  sections.push(`select public.save_lodging_special_date(${day(13)},'HOLIDAY','Synthetic Sunday holiday',true);`);
  ok(`(${call(13)}->>'total')::numeric=90000`,"Sunday holiday explicit rule");
  sections.push(`select public.save_lodging_special_date(${day(7)},'NORMAL_OVERRIDE','Synthetic normal override',true);`);
  ok(`(${call(7)}->>'total')::numeric=70000`,"normal override");
  sections.push(`select public.save_lodging_special_date(${day(8)},'SPECIAL','Synthetic special',true);`);
  ok(`${call(8)}->>'complete'='false'`,"special without explicit rate cannot fallback");
  sections.push(`select public.save_lodging_special_date(${day(8)},'SPECIAL','Synthetic special',false);`);
  sections.push("update public.lodging_rate_rules set minimum_stay=2 where name='Synthetic weekday';");
  ok(`${call()}->'reasons' ? 'MINIMUM_STAY' and ${call(0,2)}->>'complete'='true'`,"configured minimum stay");
  sections.push("update public.lodging_rate_rules set minimum_stay=1 where name='Synthetic weekday';");
  ok(`${availability()}->>'available'='true' and (${availability()}->>'eligible_room_count')::integer=1`,"16 free room");
  sections.push(`insert into public.room_assignments(reservation_id,room_id,check_in,check_out,assigned_by) values('${reservation}','${room}',${day()},${day(2)},'${owner}');`);
  ok(`${availability()}->>'available'='false'`,"17 reserved");
  ok(`${availability(1,2)}->>'available'='false'`,"18 partial overlap");
  ok(`${availability(2)}->>'available'='true'`,"19 adjacent checkout allowed");
  fails(`select public.save_lodging_block('${room}',${day()},${day(1)},'Synthetic conflict')`,"23P01","ROOM_NOT_AVAILABLE");
  ok(`(select status='confirmed' from public.reservations where id='${reservation}') and (select count(*) from public.room_assignments where status='active')=1`,"27 block does not cancel reservation");
  sections.push("update public.room_assignments set status='cancelled';",`select public.save_lodging_block('${room}',${day()},${day(2)},'Synthetic block');`);
  ok(`${availability()}->>'available'='false'`,"20 blocked room");
  sections.push("update public.availability_blocks set status='cancelled';",`update public.rooms set active=false where id='${room}';`);
  ok(`${availability()}->>'available'='false'`,"21 inactive room");
  sections.push(`update public.rooms set active=true,status='out_of_service' where id='${room}';`);
  ok(`${availability()}->>'available'='false'`,"22 out of service");
  sections.push(`update public.rooms set status='ready' where id='${room}';`);
  ok(`${availability(0,1,2,1)}->>'available'='false'`,"23 capacity insufficient");
  sections.push(`insert into public.rooms(id,room_type_id,code,display_name,capacity,status) values('${room2}','${category}','T2-SECOND','Synthetic second',2,'ready');
    insert into public.beds(room_id,code,bed_type,capacity,quantity) values('${room2}','TEST','single',1,2);
    update public.room_assignments set status='active';`);
  ok(`(${availability()}->>'eligible_room_count')::integer=1`,"24 two rooms one occupied");
  sections.push(`update public.rooms set active=false;`);
  ok(`${availability()}->>'available'='false'`,"25 no eligible rooms");
  sections.push(`update public.rooms set active=true where id='${room}'; update public.room_assignments set status='cancelled';`);
  ok(`${availability(6)}->>'available'='false' and ${availability(6)}->'reasons' ? 'NO_RATE'`,"26 no price cannot sell");
  ok(`${availability(0,3)}->>'available'='true'`,"28 multi-night available");
  sections.push(`select ${hold()};`);
  ok("(select count(*) from public.lodging_holds where status='ACTIVE')=1","29 valid persisted hold");
  ok(`${availability()}->>'available'='false'`,"30 hold blocks availability");
  ok(`${availability(0,2)}->>'available'='false'`,"37 hold partial overlap");
  ok("(select expires_at-created_at=interval '120 minutes' from public.lodging_holds limit 1)","34 default admin TTL");
  ok("(select (price_snapshot->>'total')::numeric=70000 and price_snapshot#>>'{nights,0,rule_version}' is not null from public.lodging_holds limit 1)","43 snapshot and rule version");
  sections.push("update public.lodging_rate_rules set amount=71000 where name='Synthetic weekday';");
  ok("(select (price_snapshot->>'total')::numeric=70000 from public.lodging_holds limit 1)","11 immutable quote after rate update");
  fails("update public.lodging_holds set price_snapshot=jsonb_set(price_snapshot,'{total}','1')","23514","HOLD_IMMUTABLE");
  fails("update public.lodging_holds set status='CONSUMED'","23514","HOLD_TRANSITION_NOT_ALLOWED");
  ok("not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%consume%lodging%')","44 no standalone unsafe consume RPC");
  sections.push(`select public.cancel_lodging_hold((select id from public.lodging_holds limit 1));`);
  ok(`${availability()}->>'available'='true'`,"32 cancel releases");
  sections.push(`insert into public.lodging_holds(category_id,room_id,check_in,check_out,adults,children,source,created_at,expires_at,created_by,price_snapshot)
    select category_id,room_id,check_in,check_out,adults,children,source,clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '1 minute',created_by,price_snapshot from public.lodging_holds limit 1;`);
  ok(`${availability()}->>'available'='true'`,"31 expired active hold ignored without cron");
  sections.push(`select public.save_lodging_hold_settings(15,60); select ${hold()};`);
  ok("exists(select 1 from public.lodging_holds where status='EXPIRED') and exists(select 1 from public.lodging_holds where status='ACTIVE' and expires_at-created_at=interval '60 minutes')","lazy expiration and configurable admin TTL");
  sections.push(`select public.cancel_lodging_hold((select id from public.lodging_holds where status='ACTIVE'));`);
  fails(`select public.create_lodging_hold('test_local',${day()},${day()},1,0)`,"22023","INVALID_LODGING_REQUEST");
  fails(`select public.create_lodging_hold('test_local',${day()},${day(1)},0,1)`,"22023","INVALID_LODGING_REQUEST");
  fails(`select public.create_lodging_hold('test_local',${day()},${day(1)},2,1)`,"23514","NOT_QUOTABLE");
  sections.push(`update public.room_types set sales_enabled=false where id='${category}';`);
  fails(`select ${hold()}`,"23514","NOT_QUOTABLE");
  sections.push(`update public.room_types set sales_enabled=true where id='${category}';`,asAnon);
  fails("select * from public.lodging_holds","42501");
  fails("select * from public.lodging_rate_rules","42501");
  fails("insert into public.lodging_holds(id) values(gen_random_uuid())","42501");
  fails(`select public.create_lodging_hold('test_local',${day()},${day(1)},1,0,repeat('a',64),'admin')`,"42501","NOT_AUTHORIZED");
  sections.push(`select ${hold(0,1,"a")}; reset role;`);
  ok("exists(select 1 from public.lodging_holds where status='ACTIVE' and expires_at-created_at=interval '15 minutes' and created_by is null and visitor_hash is not null)","33 web TTL and anonymous identity");
  // Keep the random hold ID in a transaction-local setting, never a visitor token.
  sections.push("select set_config('test.hold_id',(select id::text from public.lodging_holds where status='ACTIVE'),true);",asAnon);
  fails("select public.cancel_lodging_hold(current_setting('test.hold_id')::uuid,repeat('b',64))","42501","HOLD_NOT_FOUND");
  fails(`select ${hold(1,1,"a")}`,"23514","ACTIVE_HOLD_EXISTS");
  sections.push(`select public.cancel_lodging_hold(current_setting('test.hold_id')::uuid,repeat('a',64));`,"reset role;");
  ok(`${availability()}->>'available'='true'`,"visitor can cancel only own hold");
  ok("not exists(select 1 from public.audit_logs where table_name like 'lodging_%' and (coalesce(old_values::text,'')||coalesce(new_values::text,'')) ~ 'visitor_hash|price_snapshot|conditions|Synthetic|token')","redacted audit");
  for (const action of ["RATE_CREATED","RATE_UPDATED","RATE_DISABLED","SPECIAL_DATE_CHANGED","HOLD_CREATED","HOLD_CANCELLED","HOLD_EXPIRED"]) ok(`exists(select 1 from public.audit_logs where action='${action}')`,`${action} audited`);
  sections.push("delete from private.operation_rate_limits;",asOwner);
  for (let i=0;i<5;i++) sections.push(`select public.cancel_lodging_hold((${hold(i%4)}->>'id')::uuid);`);
  fails(`select ${hold()}`,"P0001","RATE_LIMITED");
  sections.push("reset role;");
  for (const code of ["housekeeping","bar"]) {
    sections.push(`delete from public.user_roles where user_id='${owner}'; insert into public.user_roles(user_id,role_id) select '${owner}',id from public.roles where code='${code}';`,asOwner);
    fails("select public.get_lodging_admin_snapshot()","42501","NOT_AUTHORIZED");
    fails(`select ${hold()}`,"42501","NOT_AUTHORIZED");
    ok("(select count(*) from public.lodging_rate_rules)=0",`${code} rate RLS`);
    sections.push("reset role;");
  }
  sections.push(`select 'PASS: T2 ${count} pricing/availability/holds/RBAC/audit DB assertions'; rollback;`);
  console.log(sql(sections.join("\n")).split(/\r?\n/).filter((line)=>line.startsWith("PASS:")).join("\n"));
}

export async function testLodgingRaces() {
  // Caller has committed legacy fixtures and resets the entire local DB in finally.
  sql(`begin; set local request.jwt.claim.sub='${owner}'; ${rates} commit;`);
  const offset=70; // Separate from existing reservation/wellness race fixtures.
  async function race(second, label) {
    const first=sqlAsync(`begin; set local application_name='${label}'; ${asOwner} select ${hold(offset,2)}; select pg_sleep(4); commit;`);
    let reached=false;
    for(let i=0;i<30;i++) { if(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`)==='t'){reached=true;break;} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(reached,"T2 race barrier reached");
    const loser=sqlAsync(`\\set VERBOSITY verbose\nbegin; ${asOwner} ${second}; commit;`);
    const [a,b]=await Promise.all([first,loser]);
    assert.equal(a.code,0,a.stderr); assert.notEqual(b.code,0,"second concurrent writer must lose"); assert.match(b.stderr,/23P01/);
    assert.equal(sql(`select count(*) from public.lodging_holds where status='ACTIVE' and check_in=${day(offset)};`),'1');
    console.log(`PASS: ${label}: one winner; overlapping writer rejected at DB boundary`);
    sql(`begin; ${asOwner} select public.cancel_lodging_hold((select id from public.lodging_holds where status='ACTIVE' and check_in=${day(offset)})); commit;`);
  }
  await race(`select ${hold(offset,2)}`,"t2-last-room-hold");
  await race(`reset role; insert into public.room_assignments(reservation_id,room_id,check_in,check_out,assigned_by) values('${reservation}','${room}',${day(offset+1)},${day(offset+3)},'${owner}')`,"t2-hold-vs-assignment");
  await race(`select public.save_lodging_block('${room}',${day(offset)},${day(offset+2)},'Synthetic race block')`,"t2-hold-vs-block");
}
