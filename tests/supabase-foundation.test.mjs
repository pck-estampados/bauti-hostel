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
  assert.match(example, /^# SUPABASE_SECRET_KEY=/m);
  assert.match(example, /^# SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.doesNotMatch(example, /^(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)=/m);
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

test("rejects inactive or roleless staff and protects configuration with session RLS", async () => {
  const [session, login, accessRoute, configurationRoute, repository, client, security] = await Promise.all([
    read("app/lib/auth/staff-session.ts"),
    read("app/acceso-interno/page.tsx"),
    read("app/api/auth/staff-access/route.ts"),
    read("app/api/admin/configuration/route.ts"),
    read("app/admin/data/supabase-configuration-repository.ts"),
    read("app/admin/configuracion/configuration-console.tsx"),
    read("supabase/migrations/202607150002_rbac_and_rls.sql"),
  ]);

  assert.match(session, /profile\.status !== "active"/);
  assert.match(session, /if \(!roles\.length\) return null/);
  assert.match(session, /role_permissions/);
  assert.match(login, /\/api\/auth\/staff-access/);
  assert.match(login, /supabase\.auth\.signOut\(\)/);
  assert.match(accessRoute, /status: 403/);
  assert.match(configurationRoute, /assertSameOrigin/);
  assert.match(configurationRoute, /requirePermissions\(staff, "settings\.manage"\)/);
  assert.match(configurationRoute, /requirePermissions\(staff, "rooms\.inventory_manage"\)/);
  assert.match(configurationRoute, /requirePermissions\(staff, "rooms\.inventory_manage", "rooms\.manage"\)/);
  assert.match(configurationRoute, /requirePermissions\(staff, "staff\.manage", "rbac\.manage"\)/);
  assert.match(repository, /from\("settings"\)/);
  assert.match(repository, /from\("room_types"\)/);
  assert.match(repository, /from\("user_roles"\)/);
  assert.doesNotMatch(repository, /createSupabaseAdminClient|SUPABASE_(?:SECRET|SERVICE_ROLE)/);
  assert.doesNotMatch(client, /SUPABASE_(?:SECRET|SERVICE_ROLE)|createSupabaseAdminClient/);
  assert.match(security, /create policy settings_manage[\s\S]*private\.has_permission\('settings\.manage'\)/);
  assert.match(security, /create policy rooms_manage[\s\S]*private\.has_permission\('rooms\.inventory_manage'\)/);
  assert.match(security, /create policy user_roles_management_all[\s\S]*private\.has_permission\('rbac\.manage'\)/);
});

test("extends inventory additively with RLS, audit and no invented private bathrooms", async () => {
  const [migration, repository, validation, reservation, walkIn, roomsPage] = await Promise.all([
    read("supabase/migrations/202607160001_inventory_configuration.sql"),
    read("app/admin/data/supabase-configuration-repository.ts"),
    read("app/admin/data/configuration-validation.ts"),
    read("app/admin/reservas/nueva/page.tsx"),
    read("app/admin/walk-in/page.tsx"),
    read("app/admin/habitaciones/page.tsx"),
  ]);

  assert.match(migration, /add column if not exists public_name/);
  assert.match(migration, /add column if not exists base_rate/);
  assert.match(migration, /add column if not exists sector/);
  assert.match(migration, /add column if not exists quantity/);
  assert.match(migration, /create table if not exists public\.room_services/);
  assert.match(migration, /create table if not exists public\.room_service_assignments/);
  assert.match(migration, /private\.has_permission\('rooms\.inventory_manage'\)/);
  assert.match(migration, /create policy rooms_update[\s\S]*rooms\.inventory_manage[\s\S]*rooms\.manage/);
  assert.match(migration, /create index if not exists rooms_room_type_id_idx/);
  assert.match(migration, /create index if not exists beds_room_id_idx/);
  assert.match(migration, /create index if not exists room_service_assignments_service_id_idx/);
  assert.match(migration, /validate_room_inventory_assignment/);
  assert.match(migration, /ROOM_INVENTORY_INCOMPLETE/);
  assert.match(migration, /audit_room_services/);
  assert.match(migration, /audit_room_service_assignments/);
  assert.doesNotMatch(migration, /private.?bath|baño privado/i);
  assert.match(repository, /room_service_assignments/);
  assert.match(repository, /set_room_operational_status/);
  assert.match(validation, /baseRate: z\.coerce\.number\(\)\.positive/);
  assert.match(validation, /quantity: z\.coerce\.number\(\)\.int\(\)\.min\(1\)/);
  for (const page of [reservation, walkIn, roomsPage]) {
    assert.match(page, /Todavía no hay habitaciones configuradas\. Completá el inventario desde Configuración\./);
  }
  assert.match(reservation, /mode === "demo" \? DEFAULT_REFERENCE_RATE_ARS/);
  assert.match(walkIn, /mode === "demo" \? DEFAULT_REFERENCE_RATE_ARS/);
});

test("exposes only the typed public-site RPC without generic anonymous settings access", async () => {
  const [migration, repository, site] = await Promise.all([
    read("supabase/migrations/202607160002_public_site_configuration.sql"),
    read("app/lib/public-site-content.ts"),
    read("app/lib/site.ts"),
  ]);

  assert.match(migration, /revoke select on public\.settings from anon/i);
  assert.match(migration, /create or replace function public\.get_public_site_configuration\(\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.get_public_site_configuration\(\) to anon/i);
  assert.match(migration, /where s\.key = any \(array\[/i);
  assert.doesNotMatch(migration, /updated_by|audit_logs|user_roles/);
  assert.match(repository, /import "server-only"/);
  assert.match(repository, /persistSession: false/);
  assert.match(repository, /\.rpc\("get_public_site_configuration"\)/);
  assert.doesNotMatch(repository, /createSupabaseAdminClient|SUPABASE_(?:SECRET|SERVICE_ROLE)/);
  assert.doesNotMatch(site, /NEXT_PUBLIC_BASE_PRICE_ARS|50_000|50000/);
});

test("adds a least-privilege media gallery, public bucket and redacted audit without seeds", async () => {
  const [migration, repository, api, publicGallery, nextConfig, validation, client, documentation] = await Promise.all([
    read("supabase/migrations/20260716072901_media_gallery.sql"),
    read("app/admin/data/supabase-media-repository.ts"),
    read("app/api/admin/media/route.ts"),
    read("app/lib/public-gallery.ts"),
    read("next.config.ts"),
    read("app/lib/media-validation.ts"),
    read("app/admin/galeria/media-console.tsx"),
    read("docs/media-gallery.md"),
  ]);

  assert.match(migration, /create table if not exists public\.media_assets/i);
  assert.match(migration, /size_bytes between 1 and 6291456/i);
  assert.match(migration, /width::bigint \* height::bigint <= 50000000/i);
  assert.match(
    migration,
    /category in \(\s*'exterior', 'recepcion', 'habitacion', 'pileta', 'patio',\s*'espacios_comunes', 'desayuno', 'otros'\s*\)/i,
  );
  assert.match(migration, /storage_path ~ '\^gallery\//i);
  assert.match(migration, /not is_published or char_length\(btrim\(alt_text\)\) > 0/i);
  assert.match(migration, /room_id uuid references public\.rooms\(id\) on delete set null/i);
  assert.match(migration, /alter table public\.media_assets enable row level security/i);
  assert.match(migration, /create policy media_assets_public_read[\s\S]*for select to anon/i);
  assert.match(migration, /create policy media_assets_staff_read[\s\S]*media\.read/i);
  assert.match(migration, /create policy media_assets_staff_insert[\s\S]*media\.manage/i);
  assert.match(migration, /create policy media_assets_staff_update[\s\S]*media\.manage/i);
  assert.match(migration, /create policy media_assets_staff_delete[\s\S]*media\.manage/i);
  assert.match(migration, /grant select \([\s\S]*\) on public\.media_assets to anon/i);
  assert.match(migration, /grant select, insert, update, delete on public\.media_assets to authenticated/i);
  assert.match(migration, /permission\.code in \('media\.read', 'media\.manage'\)/i);
  assert.match(migration, /role\.code = 'owner'/i);
  assert.match(migration, /'hostel-media'[\s\S]*true[\s\S]*6291456/i);
  assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/i);
  assert.match(migration, /create policy hostel_media_staff_insert[\s\S]*for insert to authenticated/i);
  assert.match(migration, /create policy hostel_media_staff_delete[\s\S]*for delete to authenticated/i);
  assert.doesNotMatch(migration, /create policy hostel_media[^;]*for update/is);
  assert.doesNotMatch(migration, /create policy hostel_media[^;]*to anon/is);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.media_assets/i);
  assert.doesNotMatch(migration, /12582912|12 \* 1024 \* 1024/i);

  const auditFunction = migration.match(
    /create or replace function private\.capture_media_asset_change\(\)[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(auditFunction, /active/);
  assert.match(auditFunction, /category/);
  assert.match(auditFunction, /sort_order/);
  assert.match(auditFunction, /is_published/);
  assert.doesNotMatch(auditFunction, /original_filename|alt_text|caption/i);

  assert.match(repository, /import "server-only"/);
  assert.match(repository, /upsert: false/);
  assert.match(repository, /\.storage\.from\(MEDIA_BUCKET\)\.remove/);
  assert.doesNotMatch(repository + api + publicGallery, /SUPABASE_(?:SECRET|SERVICE_ROLE)|createSupabaseAdminClient/);
  assert.match(api, /requireMediaPermissions\(context\.staff, "media\.read", "media\.manage"\)/);
  assert.match(publicGallery, /select\("id,storage_path,width,height,alt_text,caption,category,sort_order"\)/);
  assert.match(nextConfig, /pathname: "\/storage\/v1\/object\/public\/hostel-media\/gallery\/\*\*"/);
  assert.match(validation, /MEDIA_MAX_BYTES = 6 \* 1024 \* 1024/);
  assert.match(validation, /file\.size > MEDIA_MAX_BYTES/);
  assert.match(client, /file\.size > MEDIA_MAX_BYTES/);
  assert.match(documentation, /6 MiB \(6\.291\.456 bytes\)/);
  assert.doesNotMatch(validation + client + documentation, /12 MiB|12 MB|12582912/);
});
