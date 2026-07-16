import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditEvent,
  Guest,
  InternalNote,
  MaintenanceIssue,
  OperationsState,
  Payment,
  Reservation,
  Room,
} from "../lib/types";
import type { OperationsRepository } from "./operations-repository";
import {
  guestInputSchema,
  noteInputSchema,
  paymentInputSchema,
  reservationInputSchema,
  roomStatusInputSchema,
  uuidSchema,
  walkInInputSchema,
} from "./validation";

type RoomRow = {
  id: string; room_type_id: string | null; code: string; display_name: string; capacity: number;
  status: Room["status"]; status_note: string | null;
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
  nightly_rate: number; agreed_total: number; status: Reservation["status"];
  source: Reservation["source"]; internal_summary: string | null;
  actual_check_in_at: string | null; actual_check_out_at: string | null;
  created_at: string; created_by: string;
  room_assignments: Array<{ room_id: string; status: "active" | "cancelled" }> | null;
};
type FinancialRow = { reservation_id: string; paid_total: number; balance: number };
type PaymentRow = {
  id: string; reservation_id: string; guest_id: string | null; amount: number;
  currency: "ARS"; method: Payment["method"]; reference: string | null;
  note: string | null; occurred_at: string; created_by: string;
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

function assertNoError(error: { message: string } | null, fallback: string): void {
  if (!error) return;

  const messages: Record<string, string> = {
    NOT_AUTHORIZED: "Tu usuario no tiene permiso para realizar esta operación.",
    RATE_LIMITED: "Se realizaron demasiadas operaciones. Esperá un minuto y volvé a intentar.",
    ROOM_NOT_AVAILABLE: "La habitación ya no está disponible para esas fechas.",
    ROOM_CAPACITY_EXCEEDED: "La cantidad de huéspedes supera la capacidad de la habitación.",
    PAYMENT_EXCEEDS_TOTAL: "El pago supera el total de la estadía.",
    PAYMENT_EXCEEDS_BALANCE: "El pago supera el saldo pendiente.",
    OUTSTANDING_BALANCE: "La reserva todavía tiene saldo pendiente.",
  };
  if (error.message.includes("ROOM_INVENTORY_INCOMPLETE")) {
    throw new Error("La habitación necesita tipo, tarifa y capacidad de camas válidos.");
  }
  const known = Object.entries(messages).find(([code]) => error.message.includes(code));
  throw new Error(known?.[1] ?? fallback);
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
    const [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult, roomRatesResult, bedCapacityResult] =
      await Promise.all([
        this.client.from("rooms").select("id, room_type_id, code, display_name, capacity, status, status_note").eq("active", true).order("code"),
        this.client.from("guests").select("id, first_name, last_name, phone, document_number, email, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservations").select("id, code, primary_guest_id, guest_count, check_in, check_out, expected_arrival, nightly_rate, agreed_total, status, source, internal_summary, actual_check_in_at, actual_check_out_at, created_at, created_by, room_assignments(room_id,status)").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservation_financials").select("reservation_id, paid_total, balance"),
        this.client.from("payments").select("id, reservation_id, guest_id, amount, currency, method, reference, note, occurred_at, created_by").eq("status", "posted").order("occurred_at", { ascending: false }),
        this.client.from("internal_notes").select("id, entity_type, entity_id, body, created_by, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("maintenance_issues").select("id, room_id, area, title, priority, status").order("created_at", { ascending: false }),
        this.client.from("activity_logs").select("id, action, entity_type, entity_id, actor_id, created_at, summary").order("created_at", { ascending: false }).limit(200),
        this.client.from("room_types").select("id,base_rate").eq("active", true),
        this.client.from("beds").select("room_id,capacity,quantity,active").eq("active", true),
      ]);

    for (const result of [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult]) {
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
        paid,
        balance: Number(financial?.balance ?? Math.max(total - paid, 0)),
        status: row.status,
        paymentStatus: paid <= 0 ? "pending" : paid >= total ? "paid" : "partial",
        source: row.source,
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
        status: row.status, statusNote: row.status_note ?? undefined, isDemo: false,
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
        amount: Number(row.amount), currency: row.currency, method: row.method,
        reference: row.reference ?? undefined, note: row.note ?? undefined,
        createdAt: row.occurred_at, createdBy: row.created_by, isDemo: false,
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
    };
  }

  async addGuest(input: Parameters<OperationsRepository["addGuest"]>[0]) {
    const payload = guestInputSchema.parse(input);
    const { error } = await this.client.rpc("create_guest", { p_payload: payload });
    assertNoError(error, "No fue posible guardar el huésped.");
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
    const { error } = await this.client.rpc("create_reservation", { p_payload: payload });
    assertNoError(error, "No fue posible crear la reserva.");
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
