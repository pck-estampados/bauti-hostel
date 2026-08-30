import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  availableRoomsForStay,
  findPotentialGuestMatches,
  isValidStayWindow,
  stayWindowsOverlap,
} from "../app/admin/data/reservation-management-core.ts";
import {
  cancelReservationInputSchema,
  guestInputSchema,
  reservationInputSchema,
  reservationUpdateInputSchema,
} from "../app/admin/data/validation.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const ROOM_A = "123e4567-e89b-42d3-a456-426614174001";
const ROOM_B = "123e4567-e89b-42d3-a456-426614174002";
const GUEST_A = "123e4567-e89b-42d3-a456-426614174003";
const RESERVATION_A = "123e4567-e89b-42d3-a456-426614174004";

function state(overrides = {}) {
  return {
    rooms: [
      { id: ROOM_A, code: "A", displayName: "A", capacity: 2, baseRate: 60000, inventoryValid: true, status: "ready", isDemo: false },
      { id: ROOM_B, code: "B", displayName: "B", capacity: 4, baseRate: 80000, inventoryValid: true, status: "available", isDemo: false },
    ],
    guests: [{ id: GUEST_A, firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", email: "ana@example.com", createdAt: "2026-08-01T12:00:00Z", isDemo: false }],
    reservations: [], payments: [], notes: [], issues: [], audit: [], availabilityBlocks: [],
    ...overrides,
  };
}

const validReservation = {
  guestId: GUEST_A, firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", email: "ana@example.com", document: "",
  guestCount: 2, roomId: ROOM_A, checkIn: "2026-09-10", checkOut: "2026-09-12", nightlyRate: 60000,
  amountPaid: 0, paymentMethod: "cash", notes: "", source: "whatsapp", expectedArrival: "", externalReference: "",
};

test("accepts a valid minimum guest", () => assert.equal(guestInputSchema.parse({ firstName: "Ana", lastName: "Pérez", phone: "123456", document: "", email: "" }).phone, "123456"));
test("rejects an invalid guest payload", () => assert.throws(() => guestInputSchema.parse({ firstName: "", lastName: "", phone: "1" })));
test("searches guests by name", () => assert.equal(findPotentialGuestMatches(state(), "ana").length, 1));
test("searches guests by normalized phone", () => assert.equal(findPotentialGuestMatches(state(), "12345678").length, 1));
test("searches guests by email", () => assert.equal(findPotentialGuestMatches(state(), "example.com").length, 1));
test("accepts a valid manual reservation", () => assert.equal(reservationInputSchema.parse(validReservation).source, "whatsapp"));
test("rejects malformed dates", () => assert.throws(() => reservationInputSchema.parse({ ...validReservation, checkIn: "10/09/2026" })));
test("rejects checkout equal to checkin", () => assert.throws(() => reservationInputSchema.parse({ ...validReservation, checkOut: validReservation.checkIn })));
test("rejects checkout before checkin", () => assert.equal(isValidStayWindow({ checkIn: "2026-09-12", checkOut: "2026-09-10" }), false));
test("filters rooms with insufficient capacity", () => assert.deepEqual(availableRoomsForStay(state(), { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 3 }).map((room) => room.id), [ROOM_B]));
test("does not return an unknown room", () => assert.equal(availableRoomsForStay(state(), { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1 }).some((room) => room.id === "missing"), false));
test("filters inactive or incomplete inventory", () => assert.deepEqual(availableRoomsForStay(state({ rooms: [{ ...state().rooms[0], inventoryValid: false }] }), { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1 }), []));
test("filters rooms out of service", () => assert.deepEqual(availableRoomsForStay(state({ rooms: [{ ...state().rooms[0], status: "out_of_service" }] }), { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1 }), []));
test("filters currently occupied rooms", () => assert.deepEqual(availableRoomsForStay(state({ rooms: [{ ...state().rooms[0], status: "occupied" }] }), { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1 }), []));
test("allows consecutive checkout and checkin", () => assert.equal(stayWindowsOverlap({ checkIn: "2026-09-10", checkOut: "2026-09-12" }, { checkIn: "2026-09-12", checkOut: "2026-09-14" }), false));
test("detects partial overlap", () => assert.equal(stayWindowsOverlap({ checkIn: "2026-09-10", checkOut: "2026-09-12" }, { checkIn: "2026-09-11", checkOut: "2026-09-14" }), true));
test("detects total overlap", () => assert.equal(stayWindowsOverlap({ checkIn: "2026-09-10", checkOut: "2026-09-20" }, { checkIn: "2026-09-12", checkOut: "2026-09-14" }), true));
test("blocks a room with an overlapping reservation", () => { const s = state({ reservations: [{ id: RESERVATION_A, roomId: ROOM_A, checkIn: "2026-09-10", checkOut: "2026-09-12", status: "confirmed" }] }); assert.deepEqual(availableRoomsForStay(s, { checkIn: "2026-09-11", checkOut: "2026-09-13", guestCount: 1 }).map((room) => room.id), [ROOM_B]); });
test("allows editing the same reservation without self-conflict", () => { const s = state({ reservations: [{ id: RESERVATION_A, roomId: ROOM_A, checkIn: "2026-09-10", checkOut: "2026-09-12", status: "confirmed" }] }); assert.equal(availableRoomsForStay(s, { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1, excludeReservationId: RESERVATION_A }).some((room) => room.id === ROOM_A), true); });
test("blocks an edit that conflicts with another reservation", () => { const s = state({ reservations: [{ id: RESERVATION_A, roomId: ROOM_A, checkIn: "2026-09-10", checkOut: "2026-09-12", status: "confirmed" }] }); assert.equal(availableRoomsForStay(s, { checkIn: "2026-09-11", checkOut: "2026-09-13", guestCount: 1, excludeReservationId: "another" }).some((room) => room.id === ROOM_A), false); });
test("cancellation releases availability", () => { const s = state({ reservations: [{ id: RESERVATION_A, roomId: undefined, checkIn: "2026-09-10", checkOut: "2026-09-12", status: "cancelled" }] }); assert.equal(availableRoomsForStay(s, { checkIn: "2026-09-10", checkOut: "2026-09-12", guestCount: 1 }).some((room) => room.id === ROOM_A), true); });
test("availability blocks prevent booking", () => { const s = state({ availabilityBlocks: [{ id: "block", roomId: ROOM_A, checkIn: "2026-09-10", checkOut: "2026-09-12", status: "active" }] }); assert.equal(availableRoomsForStay(s, { checkIn: "2026-09-11", checkOut: "2026-09-13", guestCount: 1 }).some((room) => room.id === ROOM_A), false); });
test("accepts Booking.com as a manual source", () => assert.equal(reservationInputSchema.parse({ ...validReservation, source: "booking", externalReference: "BK-1" }).source, "booking"));
test("accepts Airbnb as a manual source", () => assert.equal(reservationInputSchema.parse({ ...validReservation, source: "airbnb", externalReference: "AB-1" }).source, "airbnb"));
test("validates safe reservation edits", () => assert.equal(reservationUpdateInputSchema.parse({ reservationId: RESERVATION_A, guestId: GUEST_A, roomId: ROOM_A, guestCount: 2, checkIn: "2026-09-10", checkOut: "2026-09-12", nightlyRate: 60000, source: "web", expectedArrival: "", externalReference: "", notes: "" }).source, "web"));
test("requires a cancellation reason", () => assert.throws(() => cancelReservationInputSchema.parse({ reservationId: RESERVATION_A, reason: "" })));

test("API validates sessions, permissions and semantic status codes", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /status: 401/); assert.match(route, /status: 403/); assert.match(route, /status: 422/);
  assert.match(route, /OperationsError/); assert.match(route, /operationPermissions/);
});

test("creation and editing revalidate complete room inventory server-side", async () => {
  const repository = await read("app/admin/data/supabase-operations-repository.ts");
  assert.equal(repository.match(/await this\.assertRoomInventoryReady\(payload\.roomId\);/g)?.length, 3);
});

test("migration preserves atomic integrity, audit and least privilege", async () => {
  const migration = await read("supabase/migrations/20260830035543_reservation_management.sql");
  assert.match(migration, /create unique index if not exists reservations_source_external_reference_unique/i);
  assert.match(migration, /create or replace function public\.update_reservation/i);
  assert.match(migration, /create or replace function public\.cancel_reservation/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /private\.require_permission\('reservations\.manage'\)/i);
  assert.match(migration, /when exclusion_violation/i);
  assert.match(migration, /update public\.room_assignments\s+set status = 'cancelled'/i);
  assert.match(migration, /private\.log_activity/i);
  assert.match(migration, /revoke all on function public\.update_reservation\(uuid, jsonb\) from public, anon/i);
  const schemaOnly = migration.replace(/create or replace function[\s\S]*?\$\$;/gi, "");
  assert.doesNotMatch(schemaOnly, /insert\s+into\s+public\.(rooms|beds|guests|reservations)\b/i);
});

test("calendar and production layout use real state without demo fallback", async () => {
  const [calendar, layout] = await Promise.all([read("app/admin/calendario/page.tsx"), read("app/admin/layout.tsx")]);
  assert.match(calendar, /state\.reservations/); assert.match(calendar, /state\.rooms/);
  assert.match(layout, /mode="production"/); assert.match(layout, /SupabaseOperationsRepository/);
});
