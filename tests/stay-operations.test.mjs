import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  buildStayOperationsReadModel,
  hostelLocalDate,
  isValidRoomStatusTransition,
} from "../app/admin/data/stay-operations-core.ts";
import { walkInInputSchema } from "../app/admin/data/validation.ts";
import {
  createWalkIn,
  performCheckIn,
  performCheckOut,
} from "../app/admin/lib/operations.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const ROOM_A = "123e4567-e89b-42d3-a456-426614174101";
const ROOM_B = "123e4567-e89b-42d3-a456-426614174102";
const GUEST_A = "123e4567-e89b-42d3-a456-426614174103";
const RESERVATION_A = "123e4567-e89b-42d3-a456-426614174104";
const TODAY = "2026-08-30";

async function migrationSql() {
  const files = await readdir(new URL("supabase/migrations/", root));
  const file = files.find((name) => name.endsWith("_stay_operation_guards.sql"));
  assert.ok(file, "stay operation migration is versioned");
  return read(`supabase/migrations/${file}`);
}

function baseState(overrides = {}) {
  return {
    rooms: [
      { id: ROOM_A, code: "A", displayName: "Habitación A", capacity: 2, baseRate: 60000, inventoryValid: true, status: "ready", active: true, isDemo: false },
      { id: ROOM_B, code: "B", displayName: "Habitación B", capacity: 3, baseRate: 80000, inventoryValid: true, status: "occupied", active: true, isDemo: false },
    ],
    guests: [{ id: GUEST_A, firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", createdAt: "2026-08-01T12:00:00Z", isDemo: false }],
    reservations: [], payments: [], notes: [], issues: [], audit: [], availabilityBlocks: [], housekeepingTasks: [],
    ...overrides,
  };
}

function confirmedReservation(overrides = {}) {
  return {
    id: RESERVATION_A, code: "RES-1", primaryGuestId: GUEST_A, roomId: ROOM_A,
    guestCount: 2, checkIn: TODAY, checkOut: "2026-09-01", nightlyRate: 60000,
    total: 120000, paid: 120000, balance: 0, status: "confirmed", paymentStatus: "paid",
    source: "whatsapp", createdAt: "2026-08-29T12:00:00Z", createdBy: "owner", isDemo: false,
    ...overrides,
  };
}

const validWalkIn = {
  firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", email: "", document: "",
  guestCount: 2, roomId: ROOM_A, checkIn: TODAY, checkOut: "2026-08-31",
  nightlyRate: 60000, amountPaid: 0, paymentMethod: "cash", notes: "",
};

test("check-in rejects an unauthenticated request", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /if \(!context\).*status: 401/s);
});

test("check-in rejects a user without reservations.manage", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /checkIn: \["reservations\.manage"\]/);
  assert.match(route, /status: 403/);
});

test("check-in rejects a missing reservation", () => {
  assert.throws(() => performCheckIn(baseState(), "missing", "owner", TODAY));
});

test("check-in rejects an incompatible reservation status", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "cancelled" })] });
  assert.throws(() => performCheckIn(state, RESERVATION_A, "owner", TODAY), /no está habilitada/i);
});

test("check-in occupies the room and accommodates the reservation", () => {
  const result = performCheckIn(baseState({ reservations: [confirmedReservation()] }), RESERVATION_A, "owner", TODAY);
  assert.equal(result.reservations[0].status, "accommodated");
  assert.equal(result.rooms[0].status, "occupied");
  assert.ok(result.reservations[0].actualCheckIn);
});

test("check-in blocks a second execution", () => {
  const once = performCheckIn(baseState({ reservations: [confirmedReservation()] }), RESERVATION_A, "owner", TODAY);
  assert.throws(() => performCheckIn(once, RESERVATION_A, "owner", TODAY), /no está habilitada/i);
});

test("check-out rejects a reservation without prior check-in", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "accommodated", actualCheckIn: undefined })], rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  assert.throws(() => performCheckOut(state, RESERVATION_A), /no está en estado alojado/i);
});

test("check-out records the real departure", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-30T12:00:00Z" })], rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  const result = performCheckOut(state, RESERVATION_A);
  assert.equal(result.reservations[0].status, "checked_out");
  assert.ok(result.reservations[0].actualCheckOut);
});

test("check-out blocks a second execution", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-30T12:00:00Z" })], rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  const once = performCheckOut(state, RESERVATION_A);
  assert.throws(() => performCheckOut(once, RESERVATION_A));
});

test("check-out releases current occupancy", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-30T12:00:00Z" })], rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  const result = buildStayOperationsReadModel(performCheckOut(state, RESERVATION_A), TODAY);
  assert.equal(result.currentlyStaying.length, 0);
  assert.equal(result.occupiedRooms, 0);
});

test("check-out leaves the room pending cleaning and creates a task", () => {
  const state = baseState({ reservations: [confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-30T12:00:00Z" })], rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  const result = performCheckOut(state, RESERVATION_A);
  assert.equal(result.rooms[0].status, "pending_cleaning");
  assert.equal(result.housekeepingTasks[0].status, "pending");
});

test("walk-in creates an accommodated stay atomically", () => {
  const result = createWalkIn(baseState(), validWalkIn, "owner", TODAY);
  assert.equal(result.reservations[0].status, "accommodated");
  assert.equal(result.rooms[0].status, "occupied");
});

test("walk-in blocks an occupied room", () => {
  const state = baseState({ rooms: [{ ...baseState().rooms[0], status: "occupied" }] });
  assert.throws(() => createWalkIn(state, validWalkIn, "owner", TODAY), /no está disponible/i);
});

test("walk-in blocks capacity overflow", () => {
  assert.throws(() => createWalkIn(baseState(), { ...validWalkIn, guestCount: 3 }, "owner", TODAY), /no está disponible/i);
});

test("walk-in rejects an invalid new guest", () => {
  assert.throws(() => createWalkIn(baseState(), { ...validWalkIn, firstName: "", phone: "1" }, "owner", TODAY), /datos básicos/i);
});

test("walk-in permissions are enforced server-side", async () => {
  const [route, migration] = await Promise.all([read("app/api/admin/operations/route.ts"), migrationSql()]);
  assert.match(route, /createWalkIn: \["reservations\.manage"\]/);
  assert.match(migration, /require_permission\('reservations\.manage'\)/);
  assert.match(migration, /require_permission\('guests\.manage'\)/);
});

test("read model returns arrivalsToday", () => {
  const model = buildStayOperationsReadModel(baseState({ reservations: [confirmedReservation()] }), TODAY);
  assert.deepEqual(model.arrivalsToday.map((item) => item.id), [RESERVATION_A]);
});

test("read model returns departuresToday", () => {
  const stay = confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-29T12:00:00Z", checkOut: TODAY });
  assert.deepEqual(buildStayOperationsReadModel(baseState({ reservations: [stay] }), TODAY).departuresToday.map((item) => item.id), [RESERVATION_A]);
});

test("read model returns currentlyStaying", () => {
  const stay = confirmedReservation({ status: "accommodated", actualCheckIn: "2026-08-29T12:00:00Z" });
  assert.equal(buildStayOperationsReadModel(baseState({ reservations: [stay] }), TODAY).currentlyStaying.length, 1);
});

test("read model counts occupied rooms", () => {
  assert.equal(buildStayOperationsReadModel(baseState(), TODAY).occupiedRooms, 1);
});

test("read model counts operationally available rooms", () => {
  assert.equal(buildStayOperationsReadModel(baseState(), TODAY).availableRooms, 1);
});

test("read model has professional zero-safe empty state", () => {
  const model = buildStayOperationsReadModel(baseState({ rooms: [], guests: [], reservations: [] }), TODAY);
  assert.equal(model.totalRooms, 0);
  assert.deepEqual(model.roomOccupancy, []);
  assert.deepEqual(model.pendingCheckIns, []);
});

test("today uses the Buenos Aires timezone rather than UTC", () => {
  assert.equal(hostelLocalDate(new Date("2026-08-30T02:30:00Z")), "2026-08-29");
});

test("operational RPCs are not executable by anon", async () => {
  const migration = await migrationSql();
  for (const signature of ["create_walk_in\\(jsonb\\)", "perform_check_in\\(uuid\\)", "perform_check_out\\(uuid\\)", "set_room_operational_status\\(uuid, public\\.room_status, text\\)"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public, anon`, "i"));
  }
});

test("backend centralizes permissions and safe room transitions", async () => {
  const migration = await migrationSql();
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /private\.is_valid_room_status_transition/);
  assert.equal(isValidRoomStatusTransition("occupied", "ready"), false);
  assert.equal(isValidRoomStatusTransition("pending_cleaning", "cleaning"), true);
});

test("stay operations never use service_role or seed productive data", async () => {
  const [repository, migration] = await Promise.all([read("app/admin/data/supabase-operations-repository.ts"), migrationSql()]);
  assert.doesNotMatch(repository, /service[_-]?role/i);
  assert.doesNotMatch(migration, /service[_-]?role/i);
  const schemaOnly = migration.replace(/create or replace function[\s\S]*?\$\$;/gi, "");
  assert.doesNotMatch(schemaOnly, /insert\s+into\s+public\.(rooms|guests|reservations|housekeeping_tasks)\b/i);
  assert.equal(walkInInputSchema.parse({ ...validWalkIn, guestId: GUEST_A }).guestId, GUEST_A);
});
