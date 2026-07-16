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
  id: string; code: string; display_name: string; capacity: number;
  status: Room["status"]; status_note: string | null;
};
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
  const known = Object.entries(messages).find(([code]) => error.message.includes(code));
  throw new Error(known?.[1] ?? fallback);
}

export class SupabaseOperationsRepository implements OperationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(): Promise<OperationsState> {
    const [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult] =
      await Promise.all([
        this.client.from("rooms").select("id, code, display_name, capacity, status, status_note").eq("active", true).order("code"),
        this.client.from("guests").select("id, first_name, last_name, phone, document_number, email, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservations").select("id, code, primary_guest_id, guest_count, check_in, check_out, expected_arrival, nightly_rate, agreed_total, status, source, internal_summary, actual_check_in_at, actual_check_out_at, created_at, created_by, room_assignments(room_id,status)").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("reservation_financials").select("reservation_id, paid_total, balance"),
        this.client.from("payments").select("id, reservation_id, guest_id, amount, currency, method, reference, note, occurred_at, created_by").eq("status", "posted").order("occurred_at", { ascending: false }),
        this.client.from("internal_notes").select("id, entity_type, entity_id, body, created_by, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
        this.client.from("maintenance_issues").select("id, room_id, area, title, priority, status").order("created_at", { ascending: false }),
        this.client.from("activity_logs").select("id, action, entity_type, entity_id, actor_id, created_at, summary").order("created_at", { ascending: false }).limit(200),
      ]);

    for (const result of [roomsResult, guestsResult, reservationsResult, financialsResult, paymentsResult, notesResult, issuesResult, activityResult]) {
      assertNoError(result.error, "No fue posible cargar la operación del hostel.");
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

    return {
      rooms: ((roomsResult.data ?? []) as RoomRow[]).map((row) => ({
        id: row.id, code: row.code, displayName: row.display_name, capacity: row.capacity,
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
    const { error } = await this.client.rpc("create_walk_in", { p_payload: payload });
    assertNoError(error, "No fue posible completar el walk-in.");
    return this.loadSnapshot();
  }

  async createReservation(input: Parameters<OperationsRepository["createReservation"]>[0]) {
    const payload = reservationInputSchema.parse(input);
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
