import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  assertCapacityAvailable,
  bookingEndAt,
  bookingReleasesCapacity,
  buildWellnessReadModel,
  overlappingSlots,
  wellnessLocalDate,
  wellnessPrice,
} from "../app/admin/data/wellness-capacity-core.ts";
import {
  wellnessBookingInputSchema,
  wellnessBookingUpdateSchema,
  wellnessProductInputSchema,
  wellnessSlotInputSchema,
  wellnessTransitionSchema,
} from "../app/admin/data/wellness-validation.ts";
import { buildCashReadModel } from "../app/admin/data/payment-management-core.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const PRODUCT_ID = "123e4567-e89b-42d3-a456-426614176001";
const DAY_PRODUCT_ID = "123e4567-e89b-42d3-a456-426614176002";
const GUEST_ID = "123e4567-e89b-42d3-a456-426614176003";
const BOOKING_ID = "123e4567-e89b-42d3-a456-426614176004";
const FINANCIAL_ID = "123e4567-e89b-42d3-a456-426614176005";
const POLICY = { rebookingHours: 12, lateCancellationCreditPercent: 50, noShowCreditPercent: 0 };

async function migrationSql() {
  const files = await readdir(new URL("supabase/migrations/", root));
  const file = files.find((name) => name.endsWith("_unified_wellness_capacity.sql"));
  assert.ok(file, "the wellness migration is versioned");
  return read(`supabase/migrations/${file}`);
}

async function paymentsPolicyConsolidationSql() {
  const files = await readdir(new URL("supabase/migrations/", root));
  const file = files.find((name) => name.endsWith("_consolidate_payments_read_policies.sql"));
  assert.ok(file, "the payments read-policy consolidation migration is versioned");
  return read(`supabase/migrations/${file}`);
}

function circuitProduct(overrides = {}) {
  return {
    id: PRODUCT_ID,
    code: "circuito_relax",
    name: "Circuito Relax",
    productType: "circuit_relax",
    description: "Acceso general wellness.",
    active: true,
    salesEnabled: true,
    durationMinutes: 180,
    currency: "ARS",
    pricingRules: { individual: 35_000, couple: 65_000 },
    policyRules: POLICY,
    instructions: "Llegar antes del inicio.",
    updatedAt: "2026-08-30T12:00:00Z",
    ...overrides,
  };
}

function dayProduct(overrides = {}) {
  return {
    id: DAY_PRODUCT_ID,
    code: "pase_relax_dia",
    name: "Pase Relax Día",
    productType: "day_pass_relax",
    description: "Acceso wellness de día.",
    active: true,
    salesEnabled: true,
    durationMinutes: 540,
    currency: "ARS",
    pricingRules: {
      mon_thu: { individual: 40_000, couple: 75_000 },
      friday: { individual: 45_000, couple: 85_000 },
      weekend_holiday: { individual: 50_000, couple: 95_000 },
      holiday_dates: ["2026-09-02"],
    },
    policyRules: POLICY,
    updatedAt: "2026-08-30T12:00:00Z",
    ...overrides,
  };
}

function slot(id, startAt, endAt, overrides = {}) {
  return {
    id,
    startAt,
    endAt,
    capacityLimit: 12,
    externalCapacityLimit: 8,
    guestBuffer: 4,
    bookedExternal: 3,
    availableExternal: 5,
    salesEnabled: true,
    status: "open",
    ...overrides,
  };
}

function daySlots(overrides = {}) {
  return [
    slot("slot-10", "2026-09-05T10:00:00-03:00", "2026-09-05T13:00:00-03:00", overrides),
    slot("slot-14", "2026-09-05T14:00:00-03:00", "2026-09-05T17:00:00-03:00", overrides),
    slot("slot-18", "2026-09-05T18:00:00-03:00", "2026-09-05T21:00:00-03:00", overrides),
  ];
}

function booking(overrides = {}) {
  return {
    id: BOOKING_ID,
    code: "WEL-00000001",
    financialReferenceId: FINANCIAL_ID,
    guestId: GUEST_ID,
    productId: PRODUCT_ID,
    startAt: "2026-09-05T10:00:00-03:00",
    endAt: "2026-09-05T13:00:00-03:00",
    partySize: 1,
    capacityUnits: 1,
    source: "admin",
    status: "confirmed",
    settlementType: "payment",
    priceSnapshot: { amount: 35_000, party: "individual" },
    policySnapshot: { rules: POLICY, lateArrivalExtendsEndAt: false },
    total: 35_000,
    amountPaid: 35_000,
    balanceDue: 0,
    currency: "ARS",
    createdAt: "2026-08-30T12:00:00Z",
    slotIds: ["slot-10"],
    ...overrides,
  };
}

function productInput(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    productType: product.productType,
    description: product.description,
    active: product.active,
    salesEnabled: product.salesEnabled,
    durationMinutes: product.durationMinutes,
    currency: product.currency,
    pricingRules: product.pricingRules,
    policyRules: product.policyRules,
    instructions: product.instructions,
  };
}

function slotInput(value) {
  return {
    id: undefined,
    startAt: value.startAt,
    endAt: value.endAt,
    capacityLimit: value.capacityLimit,
    externalCapacityLimit: value.externalCapacityLimit,
    guestBuffer: value.guestBuffer,
    salesEnabled: value.salesEnabled,
    status: value.status,
    notes: value.notes,
  };
}

function state(overrides = {}) {
  return {
    rooms: [],
    guests: [{ id: GUEST_ID, firstName: "Persona", lastName: "Sintética", phone: "+54 11 0000 0000", createdAt: "2026-08-01T12:00:00Z", isDemo: true }],
    reservations: [],
    payments: [],
    notes: [],
    issues: [],
    audit: [],
    availabilityBlocks: [],
    housekeepingTasks: [],
    wellnessProducts: [circuitProduct(), dayProduct()],
    wellnessSlots: [],
    wellnessBookings: [],
    wellnessEvents: [],
    ...overrides,
  };
}

test("1. accepts a valid Circuito Relax product", () => {
  const parsed = wellnessProductInputSchema.parse(productInput(circuitProduct()));
  assert.equal(parsed.durationMinutes, 180);
});

test("2. an inactive product is not sellable in the database operation", async () => {
  assert.match(await migrationSql(), /if not v_product\.active or not v_product\.sales_enabled then[\s\S]*WELLNESS_PRODUCT_NOT_SELLABLE/i);
});

test("3. accepts a valid configured slot", () => {
  const parsed = wellnessSlotInputSchema.parse(slotInput(daySlots()[0]));
  assert.equal(parsed.externalCapacityLimit, 8);
});

test("4. rejects external capacity plus guest buffer above total capacity", () => {
  const input = slotInput({ ...daySlots()[0], capacityLimit: 10, externalCapacityLimit: 9, guestBuffer: 2 });
  assert.throws(() => wellnessSlotInputSchema.parse(input));
});

test("5. calculates the confirmed individual Circuito price", () => {
  assert.equal(wellnessPrice(circuitProduct(), "2026-09-05T10:00:00-03:00", 1), 35_000);
});

test("6. calculates the confirmed couple Circuito price", () => {
  assert.equal(wellnessPrice(circuitProduct(), "2026-09-05T10:00:00-03:00", 2), 65_000);
});

test("7. Pase Relax Día consumes all three overlapping slots", () => {
  const selected = assertCapacityAvailable(daySlots(), "2026-09-05T10:00:00-03:00", bookingEndAt("day_pass_relax", "2026-09-05T10:00:00-03:00"), 1, "day_pass_relax");
  assert.deepEqual(selected.map((item) => item.id), ["slot-10", "slot-14", "slot-18"]);
});

test("8. one unconfigured slot blocks Pase Relax Día", () => {
  const slots = daySlots().map((item, index) => index === 1 ? { ...item, externalCapacityLimit: null, availableExternal: null } : item);
  assert.throws(() => assertCapacityAvailable(slots, "2026-09-05T10:00:00-03:00", "2026-09-05T19:00:00-03:00", 1, "day_pass_relax"), /WELLNESS_CAPACITY_NOT_CONFIGURED/);
});

test("9. rejects unsupported party size", () => {
  assert.throws(() => wellnessBookingInputSchema.parse({ guestId: GUEST_ID, productId: PRODUCT_ID, startAt: "2026-09-05T10:00:00-03:00", partySize: 3, source: "admin", paymentMethod: "cash" }));
});

test("10. blocks overcapacity", () => {
  assert.throws(() => assertCapacityAvailable(daySlots({ availableExternal: 1 }), "2026-09-05T10:00:00-03:00", "2026-09-05T19:00:00-03:00", 2, "day_pass_relax"), /WELLNESS_CAPACITY_EXCEEDED/);
});

test("11. database capacity confirmation locks every relevant slot", async () => {
  const migration = await migrationSql();
  assert.match(migration, /create function private\.lock_wellness_capacity[\s\S]*order by slot\.start_at, slot\.id[\s\S]*for update/i);
  assert.match(migration, /WELLNESS_CAPACITY_EXCEEDED/);
});

test("12. a cancellation releases capacity without deleting history", () => {
  assert.equal(bookingReleasesCapacity(booking({ status: "cancelled" })), true);
  assert.equal(bookingReleasesCapacity(booking({ status: "confirmed" })), false);
});

test("13. editing a booking revalidates all capacity", async () => {
  const migration = await migrationSql();
  assert.match(migration, /create function public\.update_wellness_booking[\s\S]*private\.lock_wellness_capacity\(\s*p_booking_id/i);
  assert.equal(wellnessBookingUpdateSchema.parse({ bookingId: BOOKING_ID, startAt: "2026-09-05T14:00:00-03:00", partySize: 2, notes: "" }).partySize, 2);
});

test("14. check-in is limited to a confirmed booking", async () => {
  assert.match(await migrationSql(), /if v_booking\.status <> 'confirmed'[\s\S]*WELLNESS_BOOKING_NOT_CHECKIN_READY/i);
});

test("15. a second check-in is rejected by the same status guard", async () => {
  const migration = await migrationSql();
  assert.match(migration, /p_action = 'check_in'[\s\S]*v_new_status := 'checked_in'/i);
  assert.doesNotMatch(migration, /v_booking\.status in \('confirmed',\s*'checked_in'\)/i);
});

test("16. completion requires prior check-in and records the real end", async () => {
  assert.match(await migrationSql(), /p_action = 'complete'[\s\S]*v_booking\.status <> 'checked_in'[\s\S]*actual_end_at = now\(\)/i);
});

test("17. no-show is only available after the scheduled start", async () => {
  assert.match(await migrationSql(), /p_action = 'no_show'[\s\S]*now\(\) < v_booking\.start_at[\s\S]*WELLNESS_BOOKING_NOT_NO_SHOW_READY/i);
});

test("18. confirmed bookings preserve a structured price snapshot", async () => {
  const migration = await migrationSql();
  assert.match(migration, /v_price_snapshot := private\.wellness_price_snapshot/);
  assert.match(migration, /price_snapshot, policy_snapshot/);
});

test("19. confirmed bookings preserve policy and fixed-end semantics", async () => {
  assert.match(await migrationSql(), /'rules', v_product\.policy_rules[\s\S]*'lateArrivalExtendsEndAt', false/i);
});

test("20. confirmation atomically records the full payment", async () => {
  const migration = await migrationSql();
  assert.match(migration, /insert into public\.payments[\s\S]*v_total[\s\S]*returning id into v_payment_id/i);
  assert.match(migration, /'amountPaid', v_total, 'balanceDue', 0/i);
});

test("21. cash identifies and filters wellness independently from stays", () => {
  const wellnessPayment = {
    id: "payment-wellness", targetType: "wellness", targetId: BOOKING_ID, targetCode: "WEL-00000001",
    financialReferenceId: FINANCIAL_ID, wellnessBookingId: BOOKING_ID, guestId: GUEST_ID,
    amount: 35_000, currency: "ARS", direction: "charge", status: "posted", method: "cash",
    createdAt: "2026-09-05T10:00:00-03:00", createdBy: "owner", isDemo: false,
  };
  const model = buildCashReadModel(state({ payments: [wellnessPayment] }), { targetType: "wellness", targetId: BOOKING_ID }, "2026-09-05");
  assert.equal(model.movements[0].targetCode, "WEL-00000001");
  assert.equal(buildCashReadModel(state({ payments: [wellnessPayment] }), { targetType: "stay" }, "2026-09-05").movements.length, 0);
});

test("22. wellness dates use America/Argentina/Buenos_Aires", () => {
  assert.equal(wellnessLocalDate("2026-09-05T02:30:00Z"), "2026-09-04");
});

test("23. RBAC adds read and manage permissions only through the owner role", async () => {
  const migration = await migrationSql();
  assert.match(migration, /'experiences\.read'/);
  assert.match(migration, /'experiences\.manage'/);
  assert.match(migration, /where role\.code = 'owner'/i);
});

test("24. anonymous callers cannot execute wellness writes", async () => {
  const migration = await migrationSql();
  for (const operation of ["save_wellness_product", "save_wellness_slot", "create_wellness_booking", "update_wellness_booking", "transition_wellness_booking"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${operation}\\([^;]+ from public, anon`, "i"));
  }
});

test("25. RLS protects every new operational table", async () => {
  const migration = await migrationSql();
  for (const table of ["wellness_products", "wellness_slots", "financial_references", "wellness_bookings", "wellness_booking_slots", "wellness_booking_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("26. booking transitions write auditable events and activity", async () => {
  const migration = await migrationSql();
  assert.match(migration, /private\.log_wellness_event/);
  assert.match(migration, /private\.log_activity/);
  assert.match(migration, /create trigger audit_wellness_bookings[\s\S]*private\.capture_sensitive_change/i);
  for (const event of ["RESERVATION_CREATED", "PAYMENT_REGISTERED", "RESERVATION_CONFIRMED", "CANCELLED", "CHECKED_IN", "COMPLETED", "NO_SHOW", "ADMIN_OVERRIDE"]) assert.match(migration, new RegExp(event));
});

test("27. an empty inventory reports pending capacity instead of inventing it", () => {
  const model = buildWellnessReadModel(state(), new Date("2026-09-05T15:00:00Z"));
  assert.equal(model.capacityConfigured, false);
  assert.equal(model.currentExternalCapacity, null);
  assert.equal(model.currentRemaining, null);
});

test("28. sales cannot be enabled on a slot without both capacity limits", () => {
  const input = slotInput({ ...daySlots()[0], capacityLimit: null, externalCapacityLimit: null, salesEnabled: true });
  assert.throws(() => wellnessSlotInputSchema.parse(input), /Configurá la capacidad/);
});

test("29. Pase Día applies the Monday to Thursday rate", () => {
  assert.equal(wellnessPrice(dayProduct(), "2026-08-31T10:00:00-03:00", 1), 40_000);
});

test("30. Pase Día applies the Friday rate", () => {
  assert.equal(wellnessPrice(dayProduct(), "2026-09-04T10:00:00-03:00", 2), 85_000);
});

test("31. Pase Día applies the weekend rate", () => {
  assert.equal(wellnessPrice(dayProduct(), "2026-09-05T10:00:00-03:00", 1), 50_000);
});

test("32. a configured holiday overrides the weekday tier", () => {
  assert.equal(wellnessPrice(dayProduct(), "2026-09-02T10:00:00-03:00", 2), 95_000);
});

test("33. Circuito ends exactly three hours after start", () => {
  assert.equal(bookingEndAt("circuit_relax", "2026-09-05T10:00:00-03:00"), "2026-09-05T16:00:00.000Z");
});

test("34. Pase Día ends at 19:00 local time", () => {
  assert.equal(bookingEndAt("day_pass_relax", "2026-09-05T10:00:00-03:00"), "2026-09-05T22:00:00.000Z");
});

test("35. adjacent slots do not overlap at an exclusive boundary", () => {
  assert.deepEqual(overlappingSlots(daySlots(), "2026-09-05T13:00:00-03:00", "2026-09-05T14:00:00-03:00"), []);
});

test("36. the dashboard read model keeps housed guests separate from external visitors", () => {
  const hostedReservation = { id: "stay", status: "accommodated", guestCount: 2 };
  const checkedIn = booking({ status: "checked_in", partySize: 1, capacityUnits: 1 });
  const slots = [slot("slot-now", "2026-09-05T10:00:00-03:00", "2026-09-05T13:00:00-03:00")];
  const model = buildWellnessReadModel(state({ reservations: [hostedReservation], wellnessSlots: slots, wellnessBookings: [checkedIn] }), new Date("2026-09-05T15:00:00Z"));
  assert.equal(model.housedGuests, 2);
  assert.equal(model.externalPresent, 1);
});

test("37. booking input accepts only confirmed wellness origins and full-payment methods", () => {
  const input = { guestId: GUEST_ID, productId: PRODUCT_ID, startAt: "2026-09-05T10:00:00-03:00", partySize: 1, source: "admin", paymentMethod: "transfer", notes: "" };
  assert.equal(wellnessBookingInputSchema.parse(input).source, "admin");
  assert.throws(() => wellnessBookingInputSchema.parse({ ...input, source: "booking" }));
  assert.throws(() => wellnessBookingInputSchema.parse({ ...input, paymentMethod: "crypto" }));
  assert.throws(() => wellnessBookingInputSchema.parse({ guestId: GUEST_ID, productId: PRODUCT_ID, startAt: input.startAt, partySize: 1, source: "admin" }));
});

test("38. Club Relax stays structurally prepared but sales-disabled", () => {
  const club = wellnessProductInputSchema.parse({ code: "club_relax", name: "Club Relax", productType: "club_relax", description: "", active: false, salesEnabled: false, durationMinutes: 180, currency: "ARS", pricingRules: {}, policyRules: {}, instructions: "" });
  assert.equal(club.salesEnabled, false);
  assert.throws(() => wellnessProductInputSchema.parse({ ...club, salesEnabled: true }));
});

test("39. cancellation requires an explicit reason", () => {
  assert.throws(() => wellnessTransitionSchema.parse({ bookingId: BOOKING_ID, action: "cancel", reason: "" }));
  assert.equal(wellnessTransitionSchema.parse({ bookingId: BOOKING_ID, action: "cancel", reason: "Cambio solicitado" }).action, "cancel");
});

test("40. the migration contains no wellness products, capacity, people, bookings or payment seeds", async () => {
  const migration = await migrationSql();
  const topLevelDdl = migration.replace(/as \$\$[\s\S]*?\$\$;/gi, "");
  assert.doesNotMatch(topLevelDdl, /insert\s+into\s+public\.(wellness_products|wellness_slots|financial_references|wellness_bookings|wellness_booking_slots|wellness_booking_events|guests|payments)\b/i);
});

test("41. enabling product sales requires an active product and structured policy", () => {
  assert.throws(() => wellnessProductInputSchema.parse(productInput(circuitProduct({ active: false }))));
  assert.throws(() => wellnessProductInputSchema.parse(productInput(circuitProduct({ policyRules: {} }))));
});

test("42. slot validation accepts only the three Buenos Aires operating windows", () => {
  const invalid = slotInput({ ...daySlots()[0], endAt: "2026-09-05T12:30:00-03:00" });
  assert.throws(() => wellnessSlotInputSchema.parse(invalid), /tres franjas operativas/i);
});

test("43. checked-in visitors remain present outside their scheduled window until completion", () => {
  const checkedIn = booking({ status: "checked_in", actualCheckInAt: "2026-09-05T09:50:00-03:00" });
  const model = buildWellnessReadModel(state({ wellnessBookings: [checkedIn] }), new Date("2026-09-05T16:30:00Z"));
  assert.equal(model.externalPresent, 1);
  assert.equal(model.externalReserved, 0);
});

test("44. the generic payment target preserves stay filtering", () => {
  const stayPayment = {
    id: "payment-stay", targetType: "stay", targetId: "stay-1", targetCode: "RES-1",
    reservationId: "stay-1", guestId: GUEST_ID, amount: 10_000, currency: "ARS",
    direction: "charge", status: "posted", method: "cash",
    createdAt: "2026-09-05T10:00:00-03:00", createdBy: "owner", isDemo: false,
  };
  assert.equal(buildCashReadModel(state({ payments: [stayPayment] }), { targetType: "stay", targetId: "stay-1" }, "2026-09-05").movements.length, 1);
  assert.equal(buildCashReadModel(state({ payments: [stayPayment] }), { targetType: "wellness" }, "2026-09-05").movements.length, 0);
});

test("45. API protects wellness creation with both operational and payment permissions", async () => {
  const route = await read("app/api/admin/operations/route.ts");
  assert.match(route, /createWellnessBooking:\s*\{ allOf: \["experiences\.manage", "payments\.manage"\] \}/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /status: 422/);
});

test("46. lowering capacity and moving occupied slots are rejected without cancelling bookings", async () => {
  const migration = await migrationSql();
  assert.match(migration, /CAPACITY_BELOW_EXISTING_BOOKINGS/);
  assert.match(migration, /SLOT_TIME_HAS_EXISTING_BOOKINGS/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.wellness_bookings/i);
});

test("47. cancellation preserves the payment ledger and snapshots", async () => {
  const migration = await migrationSql();
  const transition = migration.match(/create function public\.transition_wellness_booking[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(transition, /status = v_new_status[\s\S]*cancellation_reason/);
  assert.doesNotMatch(transition, /delete\s+from\s+public\.(payments|wellness_bookings)/i);
  assert.doesNotMatch(transition, /price_snapshot\s*=|policy_snapshot\s*=/i);
});

test("48. client preflight rejects a slot without total capacity", () => {
  const slots = daySlots({ capacityLimit: null });
  assert.throws(
    () => assertCapacityAvailable(slots, "2026-09-05T10:00:00-03:00", "2026-09-05T19:00:00-03:00", 1, "day_pass_relax"),
    /WELLNESS_CAPACITY_NOT_CONFIGURED/,
  );
});

test("49. blocked or sales-disabled slots are never sellable", () => {
  for (const overrides of [{ status: "blocked" }, { salesEnabled: false }]) {
    assert.throws(
      () => assertCapacityAvailable(daySlots(overrides), "2026-09-05T10:00:00-03:00", "2026-09-05T19:00:00-03:00", 1, "day_pass_relax"),
      /WELLNESS_CAPACITY_NOT_CONFIGURED/,
    );
  }
});

test("50. the exact remaining capacity boundary is accepted", () => {
  const selected = assertCapacityAvailable(
    daySlots({ availableExternal: 2 }),
    "2026-09-05T10:00:00-03:00",
    "2026-09-05T19:00:00-03:00",
    2,
    "day_pass_relax",
  );
  assert.equal(selected.length, 3);
});

test("51. one exhausted shared slot blocks the entire day pass", () => {
  const slots = daySlots().map((item, index) => index === 2 ? { ...item, availableExternal: 0 } : item);
  assert.throws(
    () => assertCapacityAvailable(slots, "2026-09-05T10:00:00-03:00", "2026-09-05T19:00:00-03:00", 1, "day_pass_relax"),
    /WELLNESS_CAPACITY_EXCEEDED/,
  );
});

test("52. cancelled bookings are excluded from current reserved visitors", () => {
  const current = booking({ status: "cancelled" });
  const model = buildWellnessReadModel(
    state({ wellnessBookings: [current] }),
    new Date("2026-09-05T15:00:00Z"),
  );
  assert.equal(model.externalReserved, 0);
});

test("53. housed guests do not reduce the external remaining capacity", () => {
  const currentSlot = slot("slot-now", "2026-09-05T10:00:00-03:00", "2026-09-05T13:00:00-03:00", {
    availableExternal: 5,
  });
  const hostedReservation = { id: "synthetic-stay", status: "accommodated", guestCount: 3 };
  const model = buildWellnessReadModel(
    state({ reservations: [hostedReservation], wellnessSlots: [currentSlot] }),
    new Date("2026-09-05T15:00:00Z"),
  );
  assert.equal(model.housedGuests, 3);
  assert.equal(model.currentRemaining, 5);
});

test("54. payments SELECT branches are consolidated without changing their predicates", async () => {
  const migration = await paymentsPolicyConsolidationSql();

  assert.match(migration, /drop policy if exists payments_read on public\.payments/i);
  assert.match(migration, /drop policy if exists wellness_payments_read on public\.payments/i);
  assert.equal(migration.match(/create policy\s+payments_read\s+on\s+public\.payments/gi)?.length, 1);
  assert.match(migration, /for select\s+to authenticated/i);
  assert.match(migration, /private\.has_permission\('payments\.read'\)\s+or\s+\(/i);
  assert.match(migration, /financial_reference_id is not null/i);
  assert.match(migration, /private\.has_permission\('experiences\.read'\)/i);
  assert.match(migration, /reference\.id = payments\.financial_reference_id/i);
  assert.match(migration, /reference\.reference_type = 'wellness_booking'/i);
  assert.doesNotMatch(migration, /for\s+(insert|update|delete|all)\b/i);
});
