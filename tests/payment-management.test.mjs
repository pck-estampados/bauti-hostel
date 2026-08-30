import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  buildCashReadModel,
  reservationFinancials,
} from "../app/admin/data/payment-management-core.ts";
import { paymentInputSchema } from "../app/admin/data/validation.ts";
import {
  createWalkIn,
  performCheckOut,
  registerPayment,
  voidPayment,
} from "../app/admin/lib/operations.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const ROOM_ID = "123e4567-e89b-42d3-a456-426614175001";
const GUEST_ID = "123e4567-e89b-42d3-a456-426614175002";
const RESERVATION_ID = "123e4567-e89b-42d3-a456-426614175003";
const TODAY = "2026-08-30";

async function migrationSql() {
  const files = await readdir(new URL("supabase/migrations/", root));
  const file = files.find((name) => name.endsWith("_payment_cash_management.sql"));
  assert.ok(file, "payment cash migration is versioned");
  return read(`supabase/migrations/${file}`);
}

function reservation(overrides = {}) {
  return {
    id: RESERVATION_ID,
    code: "RES-FIN-1",
    primaryGuestId: GUEST_ID,
    roomId: ROOM_ID,
    guestCount: 2,
    checkIn: TODAY,
    checkOut: "2026-09-01",
    nightlyRate: 50_000,
    total: 100_000,
    currency: "ARS",
    paid: 0,
    balance: 100_000,
    status: "confirmed",
    paymentStatus: "pending",
    source: "whatsapp",
    createdAt: "2026-08-29T12:00:00-03:00",
    createdBy: "owner",
    isDemo: false,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    rooms: [{ id: ROOM_ID, code: "A", displayName: "Habitación A", capacity: 2, baseRate: 50_000, inventoryValid: true, status: "ready", active: true, isDemo: false }],
    guests: [{ id: GUEST_ID, firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", createdAt: "2026-08-01T12:00:00Z", isDemo: false }],
    reservations: [reservation()],
    payments: [],
    notes: [],
    issues: [],
    audit: [],
    availabilityBlocks: [],
    housekeepingTasks: [],
    ...overrides,
  };
}

const paymentInput = { reservationId: RESERVATION_ID, amount: 40_000, method: "transfer", reference: "REF-1", note: "Pago de prueba" };

test("unauthenticated requests cannot register a payment", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /if \(!context\).*status: 401/s);
});

test("payments.manage is required server-side", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /registerPayment: \["payments\.manage"\]/);
  assert.match(route, /voidPayment: \["payments\.manage"\]/);
});

test("invalid payment amounts are rejected", () => {
  assert.throws(() => paymentInputSchema.parse({ ...paymentInput, amount: 0 }));
});

test("a missing reservation is rejected", () => {
  assert.throws(() => registerPayment(state({ reservations: [] }), paymentInput), /reserva/i);
});

test("a valid payment is recorded", () => {
  const result = registerPayment(state(), paymentInput, "Owner");
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].amount, 40_000);
  assert.equal(result.payments[0].status, "posted");
});

test("reservation balance updates from the payment ledger", () => {
  const result = registerPayment(state(), paymentInput);
  assert.equal(result.reservations[0].paid, 40_000);
  assert.equal(result.reservations[0].balance, 60_000);
});

test("partial payment produces partial financial status", () => {
  assert.equal(registerPayment(state(), paymentInput).reservations[0].paymentStatus, "partial");
});

test("full payment produces paid financial status", () => {
  const result = registerPayment(state(), { ...paymentInput, amount: 100_000 });
  assert.equal(result.reservations[0].paymentStatus, "paid");
  assert.equal(result.reservations[0].balance, 0);
});

test("overpayment is blocked", () => {
  assert.throws(() => registerPayment(state(), { ...paymentInput, amount: 100_001 }), /saldo/i);
});

test("unknown payment method is rejected", () => {
  assert.throws(() => paymentInputSchema.parse({ ...paymentInput, method: "crypto" }));
});

test("payment history is newest first", () => {
  const first = registerPayment(state(), paymentInput);
  const old = { ...first.payments[0], id: "older", createdAt: "2026-08-29T10:00:00-03:00" };
  const model = buildCashReadModel({ ...first, payments: [old, first.payments[0]] }, {}, TODAY);
  assert.notEqual(model.movements[0].id, "older");
});

test("a posted payment can be voided", () => {
  const paid = registerPayment(state(), paymentInput);
  const result = voidPayment(paid, paid.payments[0].id, "Carga duplicada", "Owner");
  assert.equal(result.payments[0].status, "voided");
  assert.equal(result.payments[0].voidReason, "Carga duplicada");
});

test("double void is blocked", () => {
  const paid = registerPayment(state(), paymentInput);
  const once = voidPayment(paid, paid.payments[0].id, "Carga duplicada");
  assert.throws(() => voidPayment(once, paid.payments[0].id, "Otra vez"), /ya está anulado/i);
});

test("void restores the outstanding balance", () => {
  const paid = registerPayment(state(), paymentInput);
  const result = voidPayment(paid, paid.payments[0].id, "Carga duplicada");
  assert.deepEqual(reservationFinancials(100_000, result.payments, RESERVATION_ID), {
    total: 100_000, paid: 0, balance: 100_000, paymentStatus: "pending",
  });
  assert.equal(result.reservations[0].balance, 100_000);
});

test("checkout with outstanding balance is blocked", () => {
  const accommodated = reservation({ status: "accommodated", actualCheckIn: "2026-08-30T10:00:00-03:00" });
  const occupiedRoom = { ...state().rooms[0], status: "occupied" };
  assert.throws(() => performCheckOut(state({ reservations: [accommodated], rooms: [occupiedRoom] }), RESERVATION_ID), /saldo pendiente/i);
});

test("checkout is allowed after the final payment", () => {
  const accommodated = reservation({ status: "accommodated", actualCheckIn: "2026-08-30T10:00:00-03:00" });
  const occupiedRoom = { ...state().rooms[0], status: "occupied" };
  const paid = registerPayment(state({ reservations: [accommodated], rooms: [occupiedRoom] }), { ...paymentInput, amount: 100_000 });
  assert.equal(performCheckOut(paid, RESERVATION_ID).reservations[0].status, "checked_out");
});

test("walk-in initial payment is visible in the ledger", () => {
  const result = createWalkIn(state({ reservations: [] }), {
    firstName: "Ana", lastName: "Pérez", phone: "+54 11 1234 5678", guestId: GUEST_ID,
    guestCount: 2, roomId: ROOM_ID, checkIn: TODAY, checkOut: "2026-08-31",
    nightlyRate: 50_000, amountPaid: 20_000, paymentMethod: "cash", notes: "",
  }, "Owner", TODAY);
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].amount, 20_000);
});

test("daily cash summary counts posted charges", () => {
  const paid = registerPayment(state(), paymentInput);
  paid.payments[0].createdAt = "2026-08-30T08:30:00-03:00";
  const model = buildCashReadModel(paid, {}, TODAY);
  assert.equal(model.incomeToday, 40_000);
  assert.equal(model.paymentCountToday, 1);
  assert.equal(model.byMethod.transfer, 40_000);
});

test("cash filters apply date method and reservation", () => {
  const paid = registerPayment(state(), paymentInput);
  paid.payments[0].createdAt = "2026-08-30T08:30:00-03:00";
  assert.equal(buildCashReadModel(paid, { from: TODAY, to: TODAY, method: "transfer", reservationId: RESERVATION_ID }, TODAY).movements.length, 1);
  assert.equal(buildCashReadModel(paid, { method: "cash" }, TODAY).movements.length, 0);
});

test("cash day uses Buenos Aires timezone", () => {
  const paid = registerPayment(state(), paymentInput);
  paid.payments[0].createdAt = "2026-08-30T02:30:00Z";
  assert.equal(buildCashReadModel(paid, { from: "2026-08-29", to: "2026-08-29" }, TODAY).movements.length, 1);
});

test("register and void operations create audit events", () => {
  const paid = registerPayment(state(), paymentInput, "Owner");
  const result = voidPayment(paid, paid.payments[0].id, "Carga duplicada", "Owner");
  assert.deepEqual(result.audit.slice(0, 2).map((event) => event.action), ["payment.voided", "payment.registered"]);
});

test("privileged payment RPCs are not executable by anon", async () => {
  const migration = await migrationSql();
  assert.match(migration, /revoke all on function public\.void_payment\(uuid, text\) from public, anon/i);
  assert.match(migration, /require_permission\('payments\.manage'\)/);
  assert.doesNotMatch(migration, /service[_-]?role/i);
  const foundation = await read("supabase/migrations/202607150003_atomic_operations.sql");
  assert.match(foundation, /revoke all on function public\.register_payment\(jsonb\) from public, anon/i);
});
