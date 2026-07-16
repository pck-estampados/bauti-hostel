import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("keeps secrets server-only and requires an explicit application mode", async () => {
  const [example, gitignore, envModule, adminClient] = await Promise.all([
    read(".env.example"), read(".gitignore"), read("app/lib/config/env.ts"), read("app/lib/supabase/admin.ts"),
  ]);
  assert.match(example, /^APP_MODE=demo$/m);
  assert.match(example, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.match(example, /^SUPABASE_SECRET_KEY=/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_(?:SUPABASE_)?(?:SECRET|SERVICE_ROLE)/);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(envModule, /assertProductionEnvironment/);
  assert.match(adminClient, /import "server-only"/);
});

test("creates the complete operational schema without production inventory seeds", async () => {
  const core = await read("supabase/migrations/202607150001_core_operational_schema.sql");
  for (const table of [
    "profiles", "roles", "permissions", "user_roles", "room_types", "rooms", "beds",
    "guests", "reservations", "reservation_guests", "room_assignments",
    "availability_blocks", "payments", "housekeeping_tasks", "maintenance_issues",
    "internal_notes", "activity_logs", "audit_logs", "settings",
  ]) assert.match(core, new RegExp(`create table public\\.${table} \\(`, "i"), `missing ${table}`);

  assert.match(core, /daterange\(check_in, check_out, '\[\)'\)/);
  assert.match(core, /exclude using gist \(room_id with =, stay with &&\)/);
  assert.doesNotMatch(core, /insert\s+into\s+public\.(rooms|beds|guests|reservations|payments)\b/i);
});

test("enables RLS, least-privilege roles and no anonymous sensitive access", async () => {
  const security = await read("supabase/migrations/202607150002_rbac_and_rls.sql");
  for (const table of ["guests", "reservations", "payments", "internal_notes", "audit_logs"]) {
    assert.match(security, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(security, /private\.has_permission/);
  assert.match(security, /\('housekeeping', 'Limpieza'/);
  assert.match(security, /\('maintenance', 'Mantenimiento'/);
  assert.doesNotMatch(security, /grant\s+(?:select|insert|update|delete|all)[^;]*public\.(guests|reservations|payments|internal_notes)[^;]*\bto\s+anon\b/is);
  assert.doesNotMatch(security, /create policy (?:guests|reservations|payments|internal_notes)_manage/i);
});

test("keeps critical operations atomic, rate-limited and auditable", async () => {
  const [operations, audit] = await Promise.all([
    read("supabase/migrations/202607150003_atomic_operations.sql"),
    read("supabase/migrations/202607150004_automatic_audit.sql"),
  ]);
  for (const operation of [
    "create_guest", "create_internal_note", "create_walk_in", "create_reservation", "perform_check_in", "perform_check_out",
    "register_payment", "set_room_operational_status",
  ]) assert.match(operations, new RegExp(`create function public\\.${operation}`, "i"));
  assert.match(operations, /America\/Argentina\/Buenos_Aires/);
  assert.match(operations, /private\.enforce_rate_limit/);
  assert.match(operations, /ROOM_NOT_AVAILABLE/);
  assert.match(operations, /private\.log_audit/);
  assert.match(operations, /with \(security_invoker = true\)/);
  assert.match(audit, /private\.capture_sensitive_change/);
  assert.match(audit, /audit_payments/);
  assert.match(audit, /audit_guests/);
});

test("routes production operations through validated server-side adapters", async () => {
  const [layout, route, repository, proxy] = await Promise.all([
    read("app/admin/layout.tsx"),
    read("app/api/admin/operations/route.ts"),
    read("app/admin/data/supabase-operations-repository.ts"),
    read("app/lib/supabase/proxy.ts"),
  ]);
  assert.match(layout, /requireStaffSession/);
  assert.match(layout, /mode="production"/);
  assert.match(route, /assertSameOrigin/);
  assert.match(route, /operationSchema\.parse/);
  assert.match(repository, /import "server-only"/);
  assert.match(repository, /\.rpc\("create_walk_in"/);
  assert.match(proxy, /auth\.getClaims\(\)/);
  assert.doesNotMatch(proxy, /auth\.getSession\(\)/);
});
