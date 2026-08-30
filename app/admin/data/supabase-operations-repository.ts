import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AvailabilityBlock,
  AuditEvent,
  Guest,
  HousekeepingTask,
  InternalNote,
  MaintenanceIssue,
  OperationsState,
  Payment,
  Reservation,
  Room,
} from "../lib/types";
import type { OperationsRepository } from "./operations-repository";
import { OperationsError } from "./operations-error";
import {
  cancelReservationInputSchema,
  guestInputSchema,
  guestUpdateInputSchema,
  noteInputSchema,
  paymentInputSchema,
  reservationInputSchema,
  reservationUpdateInputSchema,
  roomStatusInputSchema,
  uuidSchema,
  walkInInputSchema,
} from "./validation";

type RoomRow = {
  id: string; room_type_id: string | null; code: string; display_name: string; capacity: number;
  status: Room["status"]; status_note: string | null; active: boolean;
};
type RoomRateRow = { id: string; base_rate: number | null };
type BedCapacityRow = { room_id: string; capacity: number; quantity?: number; active: boolean };
type GuestRow = {
  id: string; first_name: string; last_name: string; phone: string;
  document_number: string | null; email: string | null; created_at: string;
};
type ReservationRow = {
  id: string; code: string; primary_guest_id: string; guest_count: number;
  check_in: string; check_out: string; expected_arrival: string | null;
  nightly_rate: number; agreed_total: number; currency: "ARS"; status: Reservation["status"];
  source: Reservation["source"]; external_reference: string | null; internal_summary: string | null;
  actual_check_in_at: string | null; actual_check_out_at: string | null;
  created_at: string; created_by: string;
  room_assignments: Array<{ room_id: string; status: "active" | "cancelled" }> | null;
};
type FinancialRow = { reservation_id: string; paid_total: number; balance: number };
type PaymentRow = {
  id: string; reservation_id: string; guest_id: string | null; amount: number;
  currency: "ARS"; direction: Payment["direction"]; status: Payment["status"];
  method: Payment["method"]; reference: string | null; note: string | null;
  occurred_at: string; created_by: string; voided_at: string | null;
  voided_by: string | null; void_reason: string | null;
  created_by_profile: Array<{ display_name: string | null }> | null;
};
type NoteRow = {
  id: string; entity_type: InternalNote["entityType"]; entity_id: string | null;
  body: string; created_by: string; created_at: string;
};
type IssueRow = {
  id: string; room_id: string | null; area: string; title: string;
  priority: MaintenanceIssue["priority"]; status: MaintenanceIssue["status"];
};
type ActivityRow = {
  id: number; action: string; entity_type: string; entity_id: string | null;
  actor_id: string | null; created_at: string; summary: string;
};
type AvailabilityBlockRow = {
  id: string; room_id: string; check_in: string; check_out: string; status: AvailabilityBlock["status"];
};
type HousekeepingTaskRow = {
  id: string; room_id: string; reservation_id: string | null;
  status: HousekeepingTask["status"]; priority: HousekeepingTask["priority"];
  assigned_to: string | null; due_at: string | null; started_at: string | null;
  completed_at: string | null; notes: string | null; created_at: string;
};

function assertNoError(error: { code?: string; message: string } | null, fallback: string): void {
  if (!error) return;

  const messages: Record<string, string> = {
    NOT_AUTHORIZED: "Tu usuario no tiene permiso para realizar esta operación.",
    RATE_LIMITED: "Se realizaron demasiadas operaciones. Esperá un minuto y volvé a intentar.",
    ROOM_NOT_AVAILABLE: "La habitación ya no está disponible para esas fechas.",
    ROOM_CAPACITY_EXCEEDED: "La cantidad de huéspedes supera la capacidad de la habitación.",
    PAYMENT_EXCEEDS_TOTAL: "El pago supera el total de la estadía.",
    PAYMENT_EXCEEDS_BALANCE: "El pago supera el saldo pendiente.",
    INVALID_PAYMENT: "Revisá el importe y el método de pago.",
    RESERVATION_NOT_PAYABLE: "La reserva no admite nuevos pagos.",
    INVALID_VOID_REASON: "Indicá un motivo de anulación válido.",
    PAYMENT_ALREADY_VOIDED: "El pago ya está anulado.",
    OUTSTANDING_BALANCE: "La reserva todavía tiene saldo pendiente.",
    GUEST_ALREADY_EXISTS: "Ya existe un huésped con ese documento.",
    EXTERNAL_REFERENCE_ALREADY_EXISTS: "Ya existe una reserva con esa referencia externa.",
    RESERVATION_NOT_EDITABLE: "El estado actual de la reserva no permite editarla.",
    RESERVATION_NOT_CANCELLABLE: "La estadía ya iniciada o finalizada no puede cancelarse.",
    INVALID_CANCELLATION_REASON: "Indicá un motivo de cancelación válido.",
    RESERVATION_NOT_CHECKIN_READY: "La reserva no está habilitada para check-in.",
    CHECKIN_NOT_TODAY: "La fecha de ingreso todavía no corresponde o la estadía ya venció.",
    ROOM_NOT_CHECKIN_READY: "La habitación no está lista para recibir huéspedes.",
    ROOM_ASSIGNMENT_MISMATCH: "La asignación de habitación no coincide con la reserva.",
    RESERVATION_NOT_CHECKOUT_READY: "La estadía no está habilitada para check-out.",
    ROOM_NOT_OCCUPIED: "La habitación no figura como ocupada por esta estadía.",
    INVALID_ROOM_STATUS_TRANSITION: "Ese cambio de estado no respeta el flujo operativo de la habitación.",
    OCCUPIED_ROOM_STATUS_LOCKED: "Una habitación ocupada sólo puede liberarse mediante check-out.",
    INVALID_GUEST: "Revisá los datos básicos del huésped.",
  };
  if (error.message.includes("ROOM_INVENTORY_INCOMPLETE")) {
    throw new OperationsError("La habitación necesita tipo, tarifa y capacidad de camas válidos.", 422, "ROOM_INVENTORY_INCOMPLETE");
  }
  const notFoundMessages: Record<string, string> = {
    GUEST_NOT_FOUND: "No se encontró el huésped.",
    RESERVATION_NOT_FOUND: "No se encontró la reserva.",
    ROOM_NOT_FOUND: "No se encontró la habitación.",
    ROOM_ASSIGNMENT_REQUIRED: "La reserva no tiene una habitación asignada.",
    PAYMENT_NOT_FOUND: "No se encontró el pago.",
  };
  const notFound = Object.entries(notFoundMessages).find(([code]) => error.message.includes(code));
  if (notFound) throw new OperationsError(notFound[1], 404, notFound[0]);
  const known = Object.entries(messages).find(([code]) => error.message.includes(code));
  const code = known?.[0] ?? error.code ?? "OPERATIONS_ERROR";
  const status = error.message.includes("NOT_AUTHORIZED") || error.code === "42501"
    ? 403
    : error.message.includes("ROOM_NOT_AVAILABLE") || error.code === "23P01" || error.code === "23505"
      || error.message.includes("RESERVATION_NOT_CHECKIN_READY")
      || error.message.includes("CHECKIN_NOT_TODAY")
      || error.message.includes("ROOM_NOT_CHECKIN_READY")
      || error.message.includes("ROOM_ASSIGNMENT_MISMATCH")
      || error.message.includes("RESERVATION_NOT_CHECKOUT_READY")
      || error.message.includes("ROOM_NOT_OCCUPIED")
      || error.message.includes("INVALID_ROOM_STATUS_TRANSITION")
      || error.message.includes("OCCUPIED_ROOM_STATUS_LOCKED")
      || error.message.includes("PAYMENT_ALREADY_VOIDED")
      || error.message.includes("RESERVATION_NOT_PAYABLE")
      ? 409
      : error.code === "22023" || error.code === "23514"
        ? 422
        : 500;
  throw new OperationsError(known?.[1] ?? fallback, status, code);
}

function isInventoryMigrationPending(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return ["42703", "PGRST204"].includes(error.code ?? "") || /base_rate|quantity/i.test(error.message);
}

export class SupabaseOperationsRepository implements OperationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async assertRoomInventoryReady(roomId: string): Promise<void> {
    const roomResult = await this.client
      .from("rooms")
      .select("room_type_id,capacity,active")
      .eq("id", roomId)
      .single();
    assertNoError(roomResult.error, "No fue posible validar la habitación seleccionada.");

    const room = roomResult.data as { room_type_id: string | null; capacity: number; active: boolean } | null;
    if (!room?.active || !room.room_type_id) {
      throw new Error("La habitación seleccionada no tiene un tipo activo y una capacidad válida.");
    }

    const [roomTypeResult, bedsResult] = await Promise.all([
      this.client.from("room_types").select("base_rate,active").eq("id", room.room_type_id).single(),
      this.client.from("beds").select("capacity,quantity").eq("room_id", roomId).eq("active", true),
    ]);
    if (isInventoryMigrationPending(roomTypeResult.error) || isInventoryMigrationPending(bedsResult.error)) {
      throw new Error("El inventario todavía no está listo. Completá la configuración antes de crear reservas.");
    }
    assertNoError(roomTypeResult.error, "No fue posible validar el tipo de habitación.");
    assertNoError(bedsResult.error, "No fue posible validar las camas de la habitación.");

    const roomType = roomTypeResult.data as { base_rate: number | null; active: boolean } | null;
    const bedCapacity = ((bedsResult.data ?? []) as Array<{ capacity: number; quantity: number }>).reduce(
      (total, bed) => total + (Number(bed.capacity) * Number(bed.quantity)),
      0,
    );
    if (!roomType?.active || Number(roomType.base_rate ?? 0) <= 0 || bedCapacity < room.capacity) {
      throw new Error("La habitación seleccionada necesita tipo, tarifa y capacidad de camas válidos.");
    }
  }

  async loadSnapshot(): Promise<OperationsState> {
    const [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult, roomRatesResult, bedCapacityResult, blocksResult, housekeepingResult] =
      await Promise.all([
        this.client.from("rooms").select("id, room_type_id, code, display_name, capacity, status, status_note, active").order("code"),
        this.client.from("guests").select("id, first_name, last_name, phone, document_number, email, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservations").select("id, code, primary_guest_id, guest_count, check_in, check_out, expected_arrival, nightly_rate, agreed_total, currency, status, source, external_reference, internal_summary, actual_check_in_at, actual_check_out_at, created_at, created_by, room_assignments(room_id,status)").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservation_financials").select("reservation_id, paid_total, balance"),
        this.client.from("payments").select("id, reservation_id, guest_id, direction, status, amount, currency, method, reference, note, occurred_at, created_by, voided_at, voided_by, void_reason, created_by_profile:profiles!payments_created_by_fkey(display_name)").order("occurred_at", { ascending: false }),
        this.client.from("internal_notes").select("id, entity_type, entity_id, body, created_by, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("maintenance_issues").select("id, room_id, area, title, priority, status").order("created_at", { ascending: false }),
        this.client.from("activity_logs").select("id, action, entity_type, entity_id, actor_id, created_at, summary").order("created_at", { ascending: false }).limit(200),
        this.client.from("room_types").select("id,base_rate").eq("active", true),
        this.client.from("beds").select("room_id,capacity,quantity,active").eq("active", true),
        this.client.from("availability_blocks").select("id,room_id,check_in,check_out,status").eq("status", "active"),
        this.client.from("housekeeping_tasks").select("id,room_id,reservation_id,status,priority,assigned_to,due_at,started_at,completed_at,notes,created_at").not("status", "in", "(completed,cancelled)").order("created_at", { ascending: false }),
      ]);

    for (const result of [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult, blocksResult, housekeepingResult]) {
      assertNoError(result.error, "No fue posible cargar la operación del hostel.");
    }
    if (roomRatesResult.error && !isInventoryMigrationPending(roomRatesResult.error)) {
      assertNoError(roomRatesResult.error, "No fue posible cargar las tarifas del inventario.");
    }
    let bedCapacityRows = (bedCapacityResult.data ?? []) as BedCapacityRow[];
    if (bedCapacityResult.error) {
      if (!isInventoryMigrationPending(bedCapacityResult.error)) {
        assertNoError(bedCapacityResult.error, "No fue posible validar las capacidades del inventario.");
      }
      const fallbackBeds = await this.client.from("beds").select("room_id,capacity,active").eq("active", true);
      assertNoError(fallbackBeds.error, "No fue posible validar las capacidades del inventario.");
      bedCapacityRows = (fallbackBeds.data ?? []) as BedCapacityRow[];
    }

    const financials = new Map(
      ((financialsResult.data ?? []) as FinancialRow[]).map((row) => [row.reservation_id, row]),
    );
    const reservations = ((reservationsResult.data ?? []) as ReservationRow[]).map<Reservation>((row) => {
      const financial = financials.get(row.id);
      const activeAssignment = row.room_assignments?.find((item) => item.status === "active");
      const paid = Number(financial?.paid_total ?? 0);
      const total = Number(row.agreed_total);
      return {
        id: row.id,
        code: row.code,
        primaryGuestId: row.primary_guest_id,
        roomId: activeAssignment?.room_id,
        guestCount: row.guest_count,
        checkIn: row.check_in,
        checkOut: row.check_out,
        expectedArrival: row.expected_arrival ?? undefined,
        nightlyRate: Number(row.nightly_rate),
        total,
        currency: row.currency,
        paid,
        balance: Number(financial?.balance ?? Math.max(total - paid, 0)),
        status: row.status,
        paymentStatus: paid <= 0 ? "pending" : paid >= total ? "paid" : "partial",
        source: row.source,
        externalReference: row.external_reference ?? undefined,
        notes: row.internal_summary ?? undefined,
        actualCheckIn: row.actual_check_in_at ?? undefined,
        actualCheckOut: row.actual_check_out_at ?? undefined,
        createdAt: row.created_at,
        createdBy: row.created_by,
        isDemo: false,
      };
    });
    const reservationGuest = new Map(reservations.map((item) => [item.id, item.primaryGuestId]));
    const roomRates = new Map(((roomRatesResult.data ?? []) as RoomRateRow[]).map((row) => [row.id, Number(row.base_rate ?? 0)]));
    const bedCapacityByRoom = new Map<string, number>();
    for (const bed of bedCapacityRows) {
      bedCapacityByRoom.set(bed.room_id, (bedCapacityByRoom.get(bed.room_id) ?? 0) + (Number(bed.quantity ?? 1) * Number(bed.capacity)));
    }

    return {
      rooms: ((roomsResult.data ?? []) as RoomRow[]).map((row) => ({
        id: row.id, code: row.code, displayName: row.display_name, capacity: row.capacity,
        baseRate: row.room_type_id ? roomRates.get(row.room_type_id) || undefined : undefined,
        inventoryValid: Boolean(row.room_type_id && (roomRates.get(row.room_type_id) ?? 0) > 0 && (bedCapacityByRoom.get(row.id) ?? 0) >= row.capacity),
        status: row.status, statusNote: row.status_note ?? undefined, active: row.active, isDemo: false,
      })),
      guests: ((guestsResult.data ?? []) as GuestRow[]).map<Guest>((row) => ({
        id: row.id, firstName: row.first_name, lastName: row.last_name, phone: row.phone,
        document: row.document_number ?? undefined, email: row.email ?? undefined,
        createdAt: row.created_at, isDemo: false,
      })),
      reservations,
      payments: ((paymentsResult.data ?? []) as PaymentRow[]).map<Payment>((row) => ({
        id: row.id, reservationId: row.reservation_id,
        guestId: row.guest_id ?? reservationGuest.get(row.reservation_id) ?? "",
        amount: Number(row.amount), currency: row.currency, direction: row.direction,
        status: row.status, method: row.method,
        reference: row.reference ?? undefined, note: row.note ?? undefined,
        createdAt: row.occurred_at, createdBy: row.created_by,
        createdByName: row.created_by_profile?.[0]?.display_name ?? undefined,
        voidedAt: row.voided_at ?? undefined, voidedBy: row.voided_by ?? undefined,
        voidReason: row.void_reason ?? undefined, isDemo: false,
      })),
      notes: ((notesResult.data ?? []) as NoteRow[]).map<InternalNote>((row) => ({
        id: row.id, entityType: row.entity_type, entityId: row.entity_id ?? undefined,
        text: row.body, author: row.created_by, createdAt: row.created_at, isDemo: false,
      })),
      issues: ((issuesResult.data ?? []) as IssueRow[]).map<MaintenanceIssue>((row) => ({
        id: row.id, roomId: row.room_id ?? undefined, area: row.area, title: row.title,
        priority: row.priority, status: row.status, isDemo: false,
      })),
      audit: ((activityResult.data ?? []) as ActivityRow[]).map<AuditEvent>((row) => ({
        id: String(row.id), action: row.action, entityType: row.entity_type,
        entityId: row.entity_id ?? "", actor: row.actor_id ?? "Sistema",
        createdAt: row.created_at, summary: row.summary, isDemo: false,
      })),
      availabilityBlocks: ((blocksResult.data ?? []) as AvailabilityBlockRow[]).map((row) => ({
        id: row.id,
        roomId: row.room_id,
        checkIn: row.check_in,
        checkOut: row.check_out,
        status: row.status,
      })),
      housekeepingTasks: ((housekeepingResult.data ?? []) as HousekeepingTaskRow[]).map((row) => ({
        id: row.id,
        roomId: row.room_id,
        reservationId: row.reservation_id ?? undefined,
        status: row.status,
        priority: row.priority,
        assignedTo: row.assigned_to ?? undefined,
        dueAt: row.due_at ?? undefined,
        startedAt: row.started_at ?? undefined,
        completedAt: row.completed_at ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
      })),
    };
  }

  async addGuest(input: Parameters<OperationsRepository["addGuest"]>[0]) {
    const payload = guestInputSchema.parse(input);
    const { error } = await this.client.rpc("create_guest", { p_payload: payload });
    assertNoError(error, "No fue posible guardar el huésped.");
    return this.loadSnapshot();
  }

  async updateGuest(guestId: string, input: Parameters<OperationsRepository["updateGuest"]>[1]) {
    const payload = guestUpdateInputSchema.parse({ guestId, ...input });
    const { error } = await this.client.rpc("update_guest", {
      p_guest_id: payload.guestId,
      p_payload: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        document: payload.document,
        email: payload.email,
      },
    });
    assertNoError(error, "No fue posible actualizar el huésped.");
    return this.loadSnapshot();
  }

  async createWalkIn(input: Parameters<OperationsRepository["createWalkIn"]>[0]) {
    const payload = walkInInputSchema.parse(input);
    await this.assertRoomInventoryReady(payload.roomId);
    const { error } = await this.client.rpc("create_walk_in", { p_payload: payload });
    assertNoError(error, "No fue posible completar el walk-in.");
    return this.loadSnapshot();
  }

  async createReservation(input: Parameters<OperationsRepository["createReservation"]>[0]) {
    const payload = reservationInputSchema.parse(input);
    await this.assertRoomInventoryReady(payload.roomId);
    const { error } = await this.client.rpc("create_reservation_v2", { p_payload: payload });
    assertNoError(error, "No fue posible crear la reserva.");
    return this.loadSnapshot();
  }

  async updateReservation(input: Parameters<OperationsRepository["updateReservation"]>[0]) {
    const payload = reservationUpdateInputSchema.parse(input);
    await this.assertRoomInventoryReady(payload.roomId);
    const { error } = await this.client.rpc("update_reservation", {
      p_reservation_id: payload.reservationId,
      p_payload: {
        guestId: payload.guestId,
        roomId: payload.roomId,
        guestCount: payload.guestCount,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        nightlyRate: payload.nightlyRate,
        source: payload.source,
        expectedArrival: payload.expectedArrival,
        externalReference: payload.externalReference,
        notes: payload.notes,
      },
    });
    assertNoError(error, "No fue posible actualizar la reserva.");
    return this.loadSnapshot();
  }

  async cancelReservation(reservationId: string, reason: string) {
    const payload = cancelReservationInputSchema.parse({ reservationId, reason });
    const { error } = await this.client.rpc("cancel_reservation", {
      p_reservation_id: payload.reservationId,
      p_reason: payload.reason,
    });
    assertNoError(error, "No fue posible cancelar la reserva.");
    return this.loadSnapshot();
  }

  async checkIn(reservationId: string) {
    const id = uuidSchema.parse(reservationId);
    const { error } = await this.client.rpc("perform_check_in", { p_reservation_id: id });
    assertNoError(error, "No fue posible realizar el check-in.");
    return this.loadSnapshot();
  }

  async checkOut(reservationId: string) {
    const id = uuidSchema.parse(reservationId);
    const { error } = await this.client.rpc("perform_check_out", { p_reservation_id: id });
    assertNoError(error, "No fue posible realizar el check-out.");
    return this.loadSnapshot();
  }

  async registerPayment(input: Parameters<OperationsRepository["registerPayment"]>[0]) {
    const payload = paymentInputSchema.parse(input);
    const { error } = await this.client.rpc("register_payment", { p_payload: payload });
    assertNoError(error, "No fue posible registrar el pago.");
    return this.loadSnapshot();
  }

  async voidPayment(paymentId: string, reason: string) {
    const id = uuidSchema.parse(paymentId);
    const validatedReason = reason.trim();
    if (validatedReason.length < 2 || validatedReason.length > 500) {
      throw new OperationsError("Indicá un motivo de anulación válido.", 422, "INVALID_VOID_REASON");
    }
    const { error } = await this.client.rpc("void_payment", {
      p_payment_id: id,
      p_reason: validatedReason,
    });
    assertNoError(error, "No fue posible anular el pago.");
    return this.loadSnapshot();
  }

  async addNote(input: Parameters<OperationsRepository["addNote"]>[0]) {
    const payload = noteInputSchema.parse(input);
    const { error } = await this.client.rpc("create_internal_note", { p_payload: payload });
    assertNoError(error, "No fue posible guardar la nota.");
    return this.loadSnapshot();
  }

  async changeRoomStatus(roomId: string, status: Parameters<OperationsRepository["changeRoomStatus"]>[1], reason?: string) {
    const payload = roomStatusInputSchema.parse({ roomId, status, reason });
    const { error } = await this.client.rpc("set_room_operational_status", {
      p_room_id: payload.roomId, p_status: payload.status, p_reason: payload.reason || null,
    });
    assertNoError(error, "No fue posible actualizar la habitación.");
    return this.loadSnapshot();
  }
}
