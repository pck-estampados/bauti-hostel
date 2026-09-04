import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { root, sql, sqlAsync, reset, localPublicApi } from "../../scripts/database-local.mjs";

const fixtures = readFileSync(join(root, "tests/database/fixtures.sql"), "utf8");
const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const room = "20000000-0000-4000-8000-000000000002";
const guest = "20000000-0000-4000-8000-000000000003";
const reservation = "20000000-0000-4000-8000-000000000004";
const product = "30000000-0000-4000-8000-000000000001";
const legacySequences = ["activity_logs_id_seq", "audit_logs_id_seq", "reservation_code_seq",
  "reservation_status_history_id_seq", "room_status_history_id_seq"];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const identity = (n) => `reset role; set local role authenticated; set local request.jwt.claim.sub = '${uid(n)}';`;
const payment = (amount, id = reservation) => `select public.register_payment(${json({ reservationId: id, amount, method: "cash", reference: "TEST-FINANCIAL-REF", note: "TEST-PAYMENT-NOTE" })})`;
const wellness = `select public.create_wellness_booking(jsonb_build_object('guestId','${guest}','productId','${product}',
  'startAt',(current_date+30+time '10:00') at time zone 'America/Argentina/Buenos_Aires',
  'partySize',1,'source','admin','paymentMethod','cash'))`;
const expectError = (statement, code, message = null) =>
  `select pg_temp.expect_error(${quote(statement)},${quote(code)},${message ? quote(message) : "null"});`;
const check = (expression, label) => `select pg_temp.check_true((${expression}),${quote(label)});`;
const helpers = `
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',label; end if; end $$;
create function pg_temp.expect_error(statement text,expected_code text,expected_message text) returns void language plpgsql as $$
declare actual_code text; actual_message text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_code = returned_sqlstate, actual_message = message_text; end;
  if actual_code is distinct from expected_code or (expected_message is not null and actual_message is distinct from expected_message) then
    raise exception 'Expected % / %, got % / %', expected_code,expected_message,actual_code,actual_message;
  end if;
end $$;`;

function isolatedRoles() {
  return ["experiences.read", "experiences.manage", "payments.read", "payments.manage", "rooms.read", "rooms.manage", "reservations.read", "reservations.manage"].map((permission, i) => `
    insert into auth.users(id,email) values('${uid(i + 11)}','single-${i}@bootstrap.invalid');
    update public.profiles set status='active' where id='${uid(i + 11)}';
    insert into public.roles(code,name,is_system) values('test_${i}','Synthetic role',false);
    insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code='test_${i}' and p.code='${permission}';
    insert into public.user_roles(user_id,role_id) select '${uid(i + 11)}',id from public.roles where code='test_${i}';
  `).join("\n");
}

function functionalTests() {
  const sections = ["begin;", fixtures, isolatedRoles(), helpers, identity(1)];
  sections.push(check("private.has_permission('payments.manage') and private.has_permission('experiences.manage')", "owner permissions"));
  sections.push(`${payment(50)};`, check(`(select balance from public.reservation_financials where reservation_id='${reservation}')=150`, "valid payment balance through RLS view"));
  for (const amount of ["invalid", 0, -1]) sections.push(expectError(payment(amount), "22023", "INVALID_PAYMENT"));
  sections.push(expectError(payment(151), "23514", "PAYMENT_EXCEEDS_BALANCE"));
  sections.push(expectError(payment(1, "20000000-0000-4000-8000-000000000099"), "22023", "RESERVATION_NOT_PAYABLE"));
  sections.push(`${wellness};`, check("(select count(*) from public.wellness_bookings)=1", "wellness booking and payment"));
  sections.push(check("(select bool_and(code ~ '^WEL-[0-9]+$') from public.wellness_bookings)", "wellness code sequence inside definer RPC"),
    check("(select count(*) from public.wellness_booking_events where id > 0)=3", "wellness event identity inside definer RPC"));
  sections.push(expectError(wellness, "23P01", "WELLNESS_CAPACITY_EXCEEDED"));
  sections.push(check(`(select count(*) from public.payments)=2`, "owner sees both financial targets"));
  sections.push(`update public.rooms set display_name='Synthetic edited' where id='${room}';`);
  sections.push(check(`(select display_name from public.rooms where id='${room}')='Synthetic edited'`, "owner room edit"));

  for (const user of [2, 3, 4]) {
    sections.push(identity(user), check("not private.is_active_staff()", "inactive or no-role profile rejected"));
    for (const table of ["rooms", "reservations", "payments", "wellness_products", "wellness_bookings"]) sections.push(check(`(select count(*) from public.${table})=0`, `${table}: inactive/no-role RLS`));
    sections.push(expectError(payment(1), "42501", "NOT_AUTHORIZED"));
    sections.push(expectError(wellness, "42501", "NOT_AUTHORIZED"));
  }
  sections.push("reset role; set local role anon; set local request.jwt.claim.sub = '';",
    expectError("select * from public.rooms", "42501"), expectError(payment(1), "42501"), expectError(wellness, "42501"),
    check("(select count(id) from public.media_assets)=0", "public media empty allowlist"));
  sections.push(identity(11), check("(select count(*) from public.wellness_bookings)=1", "experiences.read booking"),
    check("(select count(*) from public.payments)=1", "experiences.read only wellness payments"), expectError(wellness, "42501", "NOT_AUTHORIZED"));
  sections.push(identity(12), check("(select count(*) from public.wellness_products)=0", "manage alone does not imply read"),
    expectError(wellness, "42501", "NOT_AUTHORIZED"));
  sections.push(`select public.save_wellness_product(null,${json({ code: "test_rpc", name: "Synthetic RPC", productType: "circuit_relax", durationMinutes: 180, active: false, salesEnabled: false, pricingRules: { individual: 100, couple: 150 }, policyRules: {} })});`);
  sections.push(`select public.save_wellness_slot(null,jsonb_build_object(
    'startAt',(current_date+31+time '14:00') at time zone 'America/Argentina/Buenos_Aires',
    'endAt',(current_date+31+time '17:00') at time zone 'America/Argentina/Buenos_Aires',
    'capacityLimit',1,'externalCapacityLimit',1,'salesEnabled',false,'status','blocked'));`);
  sections.push(expectError("insert into public.wellness_products(code) values('forbidden')", "42501"));
  sections.push(identity(13), check("(select count(*) from public.payments)=2", "payments.read all payment targets"), expectError(payment(1), "42501", "NOT_AUTHORIZED"));
  sections.push(identity(14), `${payment(10)};`, check("(select count(*) from public.payments)=0", "payments.manage alone no read"), expectError(wellness, "42501", "NOT_AUTHORIZED"));
  sections.push(identity(15), check("(select count(*) from public.rooms)=1", "rooms.read"),
    `update public.rooms set display_name='MUST NOT CHANGE' where id='${room}';`,
    check(`(select display_name from public.rooms where id='${room}')='Synthetic edited'`, "rooms.read cannot edit"));
  sections.push(identity(16), expectError("insert into public.rooms(code,display_name,capacity) values('FORBIDDEN','Forbidden',1)", "42501"));
  sections.push(identity(17), check("(select count(*) from public.reservations)=2", "reservations.read"),
    expectError("select public.create_reservation_v2('{}'::jsonb)", "42501", "NOT_AUTHORIZED"));
  sections.push(identity(18), `select public.create_reservation_v2(jsonb_build_object('roomId','${room}','guestId','${guest}',
    'checkIn',current_date+40,'checkOut',current_date+42,'guestCount',1,'nightlyRate',100,'amountPaid',0,'source','other'));`);
  sections.push("reset role;", check(`private.reservation_balance('${reservation}')=140`, "final balance across authorized payments"));
  sections.push(identity(1), `do $$ declare result jsonb; begin
    result := public.create_walk_in(jsonb_build_object('roomId','${room}','guestId','${guest}',
      'checkIn',(now() at time zone 'America/Argentina/Buenos_Aires')::date,
      'checkOut',(now() at time zone 'America/Argentina/Buenos_Aires')::date+1,
      'guestCount',1,'nightlyRate',100,'amountPaid',100,'paymentMethod','cash'));
    perform public.perform_check_out((result->>'reservationId')::uuid);
  end $$;`);
  sections.push(check("(select count(*)=4 and bool_and(code ~ '^RES-[0-9]{8}$') and count(distinct code)=4 from public.reservations)", "reservation codes generated by create_reservation_v2 and walk-in"));
  sections.push(check("exists(select 1 from public.reservation_status_history where id>0 and new_status='checked_out')", "reservation status history identity generated by checkout"));
  sections.push(`select public.set_room_operational_status('${room}','cleaning','Synthetic ACL regression');`,
    check(`exists(select 1 from public.room_status_history where id>0 and room_id='${room}' and previous_status='pending_cleaning' and new_status='cleaning')`, "room status history identity generated by RPC"),
    check(`exists(select 1 from public.activity_logs where id>0 and entity_id='${room}' and action='room.status_changed')`, "activity identity generated by RPC"),
    check(`exists(select 1 from public.audit_logs where id>0 and record_id='${room}' and table_name='rooms' and new_values->>'status'='cleaning')`, "audit identity generated by RPC"));
  const voidPayment = `select public.void_payment((select id from public.payments where reservation_id='${reservation}' and amount=50),'Synthetic ACL reversal')`;
  sections.push(`${voidPayment};`,
    check(`(select balance from public.reservation_financials where reservation_id='${reservation}')=190`, "void recalculates balance without deleting payment"),
    check(`exists(select 1 from public.payments where reservation_id='${reservation}' and amount=50 and status='voided' and voided_at is not null)`, "voided ledger preserved"),
    expectError(voidPayment,"23505","PAYMENT_ALREADY_VOIDED"),
    check("exists(select 1 from public.activity_logs where id>0 and action='payment.voided')", "void activity logged"),
    "select 'PASS: reservation codes, reservation/room history IDs, activity/audit IDs, slot RPC and payment void';",
    "reset role;");
  // Real trigger UPDATE old/new redaction in addition to INSERT fixture records.
  sections.push("update public.guests set phone='1111111111'; update public.profiles set phone='TEST-UPDATED'; update public.internal_notes set body='TEST-UPDATED-NOTE';");
  const redactions = {
    guests: ["first_name", "last_name", "phone", "phone_normalized", "email", "document_type", "document_number", "nationality_code", "birth_date", "emergency_contact"],
    profiles: ["display_name", "phone"], payments: ["amount", "reference", "note", "void_reason"],
    internal_notes: ["body"], reservations: ["internal_summary", "nightly_rate", "agreed_total"],
    housekeeping_tasks: ["notes"], maintenance_issues: ["description"],
  };
  for (const [table, fields] of Object.entries(redactions)) {
    const keys = `array[${fields.map(quote).join(",")}]`;
    // Explicit business audit payloads may legitimately include an amount. C1
    // handles row snapshots, identifiable by id, and must redact both images.
    sections.push(check(`exists(select 1 from public.audit_logs where table_name='${table}' and new_values ? 'id')`, `${table} trigger ran`));
    sections.push(check(`not exists(select 1 from public.audit_logs where table_name='${table}' and
      ((old_values ? 'id' and old_values ?| ${keys}) or (new_values ? 'id' and new_values ?| ${keys})))`, `${table} sensitive fields removed`));
  }
  sections.push(check("not exists(select 1 from public.audit_logs where coalesce(old_values::text,'') || coalesce(new_values::text,'') like '%TEST-DOCUMENT%')", "document absent from all audit records"));
  sections.push("select 'PASS: real C1 redaction (7 tables), H1 SQLSTATE/balance, anon/no-role/pending/disabled, owner and isolated RBAC permissions'; rollback;");
  console.log(sql(sections.join("\n")).split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));
}

function aclTests() {
  const snapshot = JSON.parse(sql(readFileSync(join(root, "tests/database/acl-snapshot.sql"), "utf8")));
  const allowed = Object.keys(snapshot).filter((key) => snapshot[key]).sort();
  assert.deepEqual(allowed, JSON.parse(readFileSync(join(root, "tests/database/acl-contract.json"), "utf8")),
    "effective app function/sequence ACL contract must not expand");
  const forbidden = [
    "select private.enforce_rate_limit('test',1,interval '1 minute')",
    "select private.hostel_today()",
    "select private.log_activity('test','test',null,'test','{}'::jsonb)",
    "select private.log_audit('test','test',null,null,'{}'::jsonb)",
    `select private.reservation_balance('${reservation}')`,
    `select private.reservation_paid_total('${reservation}')`,
    "select private.require_permission('rooms.read')",
  ];
  const statements = ["begin;", fixtures, helpers];
  for (const user of [1, 2]) {
    statements.push(identity(user));
    for (const query of forbidden) statements.push(expectError(query, "42501"));
    for (const sequence of ["wellness_booking_code_seq", "wellness_booking_events_id_seq"]) {
      statements.push(expectError(`select nextval('public.${sequence}')`, "42501"),
        expectError(`select setval('public.${sequence}',1000)`, "42501"),
        expectError(`select last_value from public.${sequence}`, "42501"));
    }
    statements.push(check(`private.is_active_staff() = ${user === 1}`, "intentional active-staff helper still callable"),
      check(`private.has_permission('rooms.read') = ${user === 1}`, "intentional permission helper still callable"));
  }
  statements.push("reset role; set local role anon; set local request.jwt.claim.sub='';");
  for (const query of forbidden) statements.push(expectError(query, "42501"));
  for (const sequence of ["wellness_booking_code_seq", "wellness_booking_events_id_seq"]) {
    statements.push(expectError(`select nextval('public.${sequence}')`, "42501"),
      expectError(`select setval('public.${sequence}',1000)`, "42501"),
      expectError(`select last_value from public.${sequence}`, "42501"));
  }
  statements.push(identity(1), `do $$ declare t record; begin
    for t in select tablename from pg_tables where schemaname='public' loop
      execute format('select count(*) from public.%I',t.tablename);
    end loop;
  end $$;`, "reset role;",
    check(`not exists(select 1 from pg_depend d join pg_policy p on p.oid=d.objid
      join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
      where d.classid='pg_policy'::regclass and d.refclassid='pg_proc'::regclass
      and n.nspname in ('public','storage') and 'authenticated'::regrole::oid=any(p.polroles)
      and not has_function_privilege('authenticated',d.refobjid,'EXECUTE'))`, "every RLS function dependency retains EXECUTE"),
    "reset role; set local role service_role;");
  for (const sequence of legacySequences) {
    statements.push(expectError(`select setval('public.${sequence}',1000)`, "42501"),
      expectError(`select nextval('public.${sequence}')`, "42501"),
      expectError(`select last_value from public.${sequence}`, "42501"));
  }
  statements.push(identity(1), check("nextval('public.reservation_code_seq')>0", "authenticated reservation code USAGE preserved"),
    check("(select last_value from public.reservation_code_seq)>0", "authenticated reservation code SELECT preserved"),
    "select 'PASS: ACL direct calls denied, service_role sequence operations denied, required helpers/RLS and reservation code access preserved'; rollback;");
  console.log(sql(statements.join("\n")).split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));
}

async function authTests() {
  const { url, key } = localPublicApi();
  // Generated inside LOCAL Postgres, ephemeral, never embedded in SQL/logs/files.
  const credential = JSON.parse(sql(`with password as (
    select encode(extensions.gen_random_bytes(24),'hex') as value
  ), updated as (
    update auth.users set instance_id='00000000-0000-0000-0000-000000000000',
      aud='authenticated',role='authenticated',email_confirmed_at=now(),
      encrypted_password=extensions.crypt(password.value,extensions.gen_salt('bf')),
      confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
      email_change_token_current='',reauthentication_token='',
      raw_app_meta_data='{"provider":"email","providers":["email"]}'::jsonb,
      created_at=coalesce(created_at,now()),updated_at=now() from password where id='${uid(1)}' returning email
  ) select json_build_object('email',updated.email,'password',password.value) from updated,password;`));
  sql(`insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
    select gen_random_uuid(),id::text,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now()
    from auth.users where id='${uid(1)}';`);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const signedIn = await client.auth.signInWithPassword(credential);
  assert.equal(signedIn.error === null, true,
    `real local Auth password login must succeed (status=${signedIn.error?.status ?? "none"}, code=${/^[a-z_]+$/.test(signedIn.error?.code ?? "") ? signedIn.error.code : "none"})`);
  assert.equal(signedIn.data.user?.id, uid(1));
  const profile = await client.from("profiles").select("id,status").eq("id",uid(1)).single();
  assert.equal(profile.error === null, true, "real JWT must authorize the profile read");
  assert.equal(profile.data?.status,"active");
  const roles = await client.from("user_roles").select("roles(code)").eq("user_id",uid(1));
  assert.equal(roles.error === null, true, "owner roles must be readable with real JWT");
  assert.equal(roles.data?.some((row) => row.roles?.code === "owner"),true);
  const refreshed = await client.auth.refreshSession();
  assert.equal(refreshed.error === null, true, "local Auth session refresh");
  const refreshToken = refreshed.data.session?.refresh_token;
  assert.equal(typeof refreshToken,"string");
  const signedOut = await client.auth.signOut({ scope: "global" });
  assert.equal(signedOut.error === null,true,"local Auth logout");
  const revoked = await client.auth.refreshSession({ refresh_token: refreshToken });
  assert.equal(revoked.error !== null,true,"logged-out refresh token must be rejected");
  console.log("PASS: real LOCAL Auth login, active owner via JWT/RLS, refresh, logout and refresh revocation");
}

async function waitForLock(label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`) === "t") return;
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error("Concurrency barrier not reached");
}

async function race(statement1, statement2, label, expectedError) {
  const first = sqlAsync(`\\set VERBOSITY verbose\nbegin; set local application_name='${label}'; ${identity(1)} ${statement1}; select pg_sleep(5); commit;`);
  await waitForLock(label);
  const second = sqlAsync(`\\set VERBOSITY verbose\nbegin; ${identity(1)} ${statement2}; commit;`);
  const results = await Promise.all([first, second]);
  assert.equal(results[0].code, 0, results[0].stderr);
  assert.notEqual(results[1].code, 0, "second concurrent operation must lose");
  assert.match(results[1].stderr, /23P01/);
  assert.match(results[1].stderr, expectedError);
  console.log(`PASS: ${label}: one commit, one controlled 23P01 failure`);
}

export async function testDatabase() {
  console.log(sql(readFileSync(join(root, "tests/database/bootstrap-schema.sql"), "utf8")));
  aclTests();
  functionalTests(); // Entire fixture and all role/permission changes ROLLBACK.
  console.log(sql(readFileSync(join(root, "tests/database/bootstrap-schema.sql"), "utf8")));
  // Cross-connection tests require committed LOCAL fixtures. Always reset in
  // finally; a failed reset is a failure, never reported as a clean bootstrap.
  try {
    sql(`begin; ${fixtures} commit;`);
    await authTests();
    const assign = (reservationId) => `insert into public.room_assignments(reservation_id,room_id,check_in,check_out,assigned_by)
      values('${reservationId}','${room}',current_date+30,current_date+32,'${uid(1)}')`;
    // Assignment writes are intentionally RPC-only, so exercise the constraint
    // as the database owner while retaining a synthetic auth.uid actor.
    await race(`reset role; ${assign(reservation)}`, `reset role; ${assign("20000000-0000-4000-8000-000000000005")}`, "t03-room-overlap", /room_assignments_no_overlap/);
    await race(wellness, wellness, "t03-wellness-last-slot", /WELLNESS_CAPACITY_EXCEEDED/);
    assert.equal(sql("select count(*) from public.room_assignments;"), "1");
    assert.equal(sql("select count(*) from public.wellness_bookings;"), "1");
    assert.equal(sql("select count(*) from public.payments;"), "1");
  } finally {
    await reset();
  }
  console.log(sql(readFileSync(join(root, "tests/database/bootstrap-schema.sql"), "utf8")));
}
