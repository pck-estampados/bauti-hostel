import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CORE_GENERAL, CORE_POLICIES, CORE_SCHEDULES, generalSettingsSchema, policySettingsSchema, scheduleSettingsSchema, checkInLabel, ROLE_LABELS } from "../app/lib/core-settings.ts";
import { reservationLifecycle } from "../app/admin/data/reservation-lifecycle.ts";
import { getPublicSupabaseConfig } from "../app/lib/config/env.ts";
import { whatsappHref } from "../app/lib/site.ts";
import { buildAvailabilityWhatsappMessage } from "../app/lib/availability.ts";

test("T1 canonical general settings and pending contacts", () => {
  assert.equal(generalSettingsSchema.parse(CORE_GENERAL).name, "Casa Albor");
  assert.equal(CORE_GENERAL.descriptor, "Casa boutique · Estadías & Experiencias");
  for (const field of ["phone", "whatsapp", "email", "website"]) assert.equal(CORE_GENERAL[field], "");
});
test("T1 rejects legacy branding and official Hotel Boutique description", () => {
  assert.throws(() => generalSettingsSchema.parse({ ...CORE_GENERAL, name: "Hostel Bauti" }));
  assert.throws(() => generalSettingsSchema.parse({ ...CORE_GENERAL, descriptor: "Hotel Boutique" }));
  assert.throws(() => generalSettingsSchema.parse({ ...CORE_GENERAL, website: "javascript:alert(1)" }));
});
test("T1 confirmed schedules with unconfirmed check-in end empty", () => {
  assert.deepEqual(scheduleSettingsSchema.parse(CORE_SCHEDULES), CORE_SCHEDULES);
  assert.equal(CORE_SCHEDULES.checkInFrom, "15:00");
  assert.equal(CORE_SCHEDULES.checkOutUntil, "11:00");
  assert.equal(CORE_SCHEDULES.courtesyCheckoutUntil, "12:00");
  assert.equal(checkInLabel(CORE_SCHEDULES), "desde las 15:00");
});
test("T1 courtesy is never automatic and intervals must be valid", () => {
  for (const patch of [{ courtesyRequiresApproval: false }, { courtesyCheckoutUntil: "10:00" }, { breakfastUntil: "07:00" }, { checkInUntil: "12:00" }, { checkInFrom: "25:00" }]) {
    assert.throws(() => scheduleSettingsSchema.parse({ ...CORE_SCHEDULES, ...patch }));
  }
});
test("T1 guest pets forbidden and resident disclosure independent", () => {
  assert.equal(policySettingsSchema.parse(CORE_POLICIES).guestPetsAllowed, false);
  assert.throws(() => policySettingsSchema.parse({ ...CORE_POLICIES, guestPetsAllowed: true }));
  assert.throws(() => policySettingsSchema.parse({ ...CORE_POLICIES, pets: "Con consulta" }));
  assert.equal(policySettingsSchema.parse({ ...CORE_POLICIES, residentPetsDisclosure: "Texto a confirmar" }).guestPetsAllowed, false);
  assert.equal(CORE_POLICIES.cancellation, "");
});
test("T1 visible MVP role mapping preserves internal codes", () => {
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ["admin", "bar", "housekeeping", "maintenance", "owner", "reception"]);
  assert.equal(ROLE_LABELS.housekeeping, "Limpieza");
});
test("T1 legacy paid status does not imply arrival or a ledger balance", () => {
  for (const status of ["paid", "partially_paid"]) {
    assert.equal(reservationLifecycle({ status }), "confirmed");
    assert.equal(reservationLifecycle({ status, actualCheckIn: "2026-09-04" }), "checked_in");
    assert.equal(reservationLifecycle({ status, actualCheckOut: "2026-09-05" }), "checked_out");
  }
});
test("T1 explicit operational states are never replaced by financial compatibility", () => {
  for (const status of ["completed", "cancelled", "accommodated", "no_show", "pending_deposit"]) {
    assert.equal(reservationLifecycle({ status, actualCheckIn: "2026-09-04", actualCheckOut: "2026-09-05" }), status);
  }
});
test("T1 local HTTP Supabase restricted to isolated loopback port", () => {
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-only-not-a-real-key-value";
    for (const url of ["http://127.0.0.1:55421", "http://localhost:55421"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url; assert.equal(getPublicSupabaseConfig().url, url);
    }
    for (const url of ["http://remote.invalid:55421", "http://localhost:54321", "http://127.0.0.1:55421@remote.invalid"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url; assert.throws(() => getPublicSupabaseConfig());
    }
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previous.key;
  }
});
test("T1 migration only introduces structural settings, roles and contracts", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260904043936_align_core_model_with_handoff_v127.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /insert into (?:auth\.|public\.(?:guests|reservations|rooms|payments|wellness_))/i);
  assert.match(sql, /security_invoker=true/);
  assert.match(sql, /grant execute on function public\.get_housekeeping_room_state\(\) to authenticated/);
  assert.match(sql, /grant execute on function public\.get_public_site_configuration_v127\(\) to anon/);
  assert.match(sql, /null::numeric/);
  assert.doesNotMatch(sql, /60000|60_000|service_role.*to anon/i);
});

test("T1 WhatsApp carries inquiry fields only when a contact is configured", () => {
  const message = buildAvailabilityWhatsappMessage({ name: "Persona de prueba", checkin: "2026-09-10", checkout: "2026-09-12", adults: 2, children: 0 }, "Casa Albor");
  assert.equal(whatsappHref("", message), "/contacto");
  const link = new URL(whatsappHref("+54 9 11 0000-0000", message));
  assert.equal(link.origin, "https://wa.me");
  assert.equal(link.pathname, "/5491100000000");
  assert.equal(link.searchParams.get("text"), message);
  assert.match(message, /Fecha de ingreso: 10\/09\/2026/);
  assert.match(message, /Cantidad de huéspedes: 2/);
  assert.match(message, /no confirma disponibilidad/);
});
