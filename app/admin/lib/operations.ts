import { DEMO_OPERATOR, hostelDate } from "./demo-data.ts";
import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  Payment,
  PaymentMethod,
  Reservation,
  ReservationUpdateInput,
  RoomStatus,
  WalkInInput,
} from "./types.ts";
import { availableRoomsForStay } from "../data/reservation-management-core.ts";
import { buildStayOperationsReadModel, isValidRoomStatusTransition } from "../data/stay-operations-core.ts";
import { financialStatus, reservationFinancials } from "../data/payment-management-core.ts";

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T12:00:00Z`);
  const end = Date.parse(`${checkOut}T12:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function formatGuestName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function isRoomOperationallyAvailable(status: RoomStatus): boolean {
  return status === "available" || status === "clean" || status === "ready";
}

export function paymentStatus(total: number, paid: number) {
  return financialStatus(total, paid);
}

export function validateStay(input: { checkIn: string; checkOut: string; guestCount: number; nightlyRate: number }) {
  if (!input.checkIn || !input.checkOut) throw new Error("Completá las fechas de ingreso y salida.");
  if (nightsBetween(input.checkIn, input.checkOut) < 1) throw new Error("La salida debe ser posterior al ingreso.");
  if (input.guestCount < 1) throw new Error("Debe registrarse al menos una persona.");
  if (input.nightlyRate <= 0) throw new Error("La tarifa debe ser mayor a cero.");
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createWalkIn(state: OperationsState, input: WalkInInput, actor = DEMO_OPERATOR, today = hostelDate()): OperationsState {
  validateStay(input);
  if (input.checkIn !== today) throw new Error("El ingreso walk-in debe registrarse con fecha de hoy.");
  const room = availableRoomsForStay(state, input).find((item) => item.id === input.roomId);
  if (!room) throw new Error("La habitación seleccionada ya no está disponible.");
  if (input.amountPaid < 0) throw new Error("El monto pagado no puede ser negativo.");

  const selectedGuest = input.guestId ? state.guests.find((guest) => guest.id === input.guestId) : undefined;
  if (input.guestId && !selectedGuest) throw new Error("No se encontró el huésped seleccionado.");
  if (!selectedGuest && (!input.firstName.trim() || !input.lastName.trim() || input.phone.trim().length < 6)) {
    throw new Error("Revisá los datos básicos del huésped.");
  }
  const guestId = selectedGuest?.id ?? id("guest");
  const reservationId = id("reservation");
  const createdAt = nowIso();
  const total = nightsBetween(input.checkIn, input.checkOut) * input.nightlyRate;
  if (input.amountPaid > total) throw new Error("El pago supera el total de la estadía.");
  const paid = input.amountPaid;
  const guest = selectedGuest ?? {
    id: guestId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(),
    document: input.document?.trim() || undefined, email: input.email?.trim() || undefined, createdAt, isDemo: true,
  };
  const reservation: Reservation = {
    id: reservationId, code: `WALK-${Date.now().toString().slice(-6)}`, primaryGuestId: guestId, roomId: room.id,
    guestCount: input.guestCount, checkIn: input.checkIn, checkOut: input.checkOut, nightlyRate: input.nightlyRate,
    total, currency: "ARS", paid, balance: Math.max(total - paid, 0), status: "accommodated", paymentStatus: paymentStatus(total, paid),
    source: "walk_in", notes: input.notes?.trim() || undefined, actualCheckIn: createdAt, createdAt, createdBy: actor, isDemo: true,
  };

  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === room.id ? { ...item, status: "occupied", statusNote: undefined } : item),
    guests: selectedGuest ? state.guests : [guest, ...state.guests],
    reservations: [reservation, ...state.reservations],
    payments: paid > 0 ? [{ id: id("payment"), reservationId, guestId, amount: paid, currency: "ARS", direction: "charge", status: "posted", method: input.paymentMethod, createdAt, createdBy: actor, createdByName: actor, isDemo: true }, ...state.payments] : state.payments,
    notes: input.notes?.trim() ? [{ id: id("note"), entityType: "reservation", entityId: reservationId, text: input.notes.trim(), author: actor, createdAt, isDemo: true }, ...state.notes] : state.notes,
    audit: [{ id: id("audit"), action: "walk_in.created_and_checked_in", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Ingreso directo registrado en ${room.displayName}.`, isDemo: true }, ...state.audit],
  };
}

export function createManualReservation(state: OperationsState, input: ManualReservationInput, actor = DEMO_OPERATOR): OperationsState {
  validateStay(input);
  const room = availableRoomsForStay(state, input).find((item) => item.id === input.roomId);
  if (!room) throw new Error("La habitación seleccionada no está disponible para esas fechas y capacidad.");
  const total = nightsBetween(input.checkIn, input.checkOut) * input.nightlyRate;
  const paid = Math.min(Math.max(input.amountPaid, 0), total);
  const createdAt = nowIso();
  const selectedGuest = input.guestId ? state.guests.find((guest) => guest.id === input.guestId) : undefined;
  if (input.guestId && !selectedGuest) throw new Error("No se encontró el huésped seleccionado.");
  const guestId = selectedGuest?.id ?? id("guest");
  const reservationId = id("reservation");

  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === room.id ? { ...item, status: "reserved" } : item),
    guests: selectedGuest ? state.guests : [{ id: guestId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(), document: input.document?.trim() || undefined, email: input.email?.trim() || undefined, createdAt, isDemo: true }, ...state.guests],
    reservations: [{
      id: reservationId, code: `RES-${Date.now().toString().slice(-6)}`, primaryGuestId: guestId, roomId: room.id,
      guestCount: input.guestCount, checkIn: input.checkIn, checkOut: input.checkOut, expectedArrival: input.expectedArrival,
      nightlyRate: input.nightlyRate, total, currency: "ARS", paid, balance: Math.max(total - paid, 0), status: "confirmed",
      paymentStatus: paymentStatus(total, paid), source: input.source, externalReference: input.externalReference?.trim() || undefined, notes: input.notes?.trim() || undefined,
      createdAt, createdBy: actor, isDemo: true,
    }, ...state.reservations],
    payments: paid > 0 ? [{ id: id("payment"), reservationId, guestId, amount: paid, currency: "ARS", direction: "charge", status: "posted", method: input.paymentMethod, createdAt, createdBy: actor, createdByName: actor, isDemo: true }, ...state.payments] : state.payments,
    audit: [{ id: id("audit"), action: "reservation.created", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Reserva manual creada para ${room.displayName}.`, isDemo: true }, ...state.audit],
  };
}

export function addGuest(state: OperationsState, input: { firstName: string; lastName: string; phone: string; document?: string; email?: string }, actor = DEMO_OPERATOR): OperationsState {
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error("Completá nombre y apellido.");
  if (!input.phone.trim()) throw new Error("Completá un teléfono de contacto.");
  const createdAt = nowIso();
  const guestId = id("guest");
  return {
    ...state,
    guests: [{ id: guestId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(), document: input.document?.trim() || undefined, email: input.email?.trim() || undefined, createdAt, isDemo: true }, ...state.guests],
    audit: [{ id: id("audit"), action: "guest.created", entityType: "guest", entityId: guestId, actor, createdAt, summary: `Huésped de prueba registrado: ${formatGuestName(input.firstName, input.lastName)}.`, isDemo: true }, ...state.audit],
  };
}

export function updateGuest(
  state: OperationsState,
  guestId: string,
  input: { firstName: string; lastName: string; phone: string; document?: string; email?: string },
  actor = DEMO_OPERATOR,
): OperationsState {
  const guest = state.guests.find((item) => item.id === guestId);
  if (!guest) throw new Error("No se encontró el huésped.");
  if (!input.firstName.trim() || !input.lastName.trim() || input.phone.trim().length < 6) {
    throw new Error("Revisá los datos básicos del huésped.");
  }
  const createdAt = nowIso();
  return {
    ...state,
    guests: state.guests.map((item) => item.id === guestId ? {
      ...item,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      document: input.document?.trim() || undefined,
      email: input.email?.trim().toLocaleLowerCase("es-AR") || undefined,
    } : item),
    audit: [{ id: id("audit"), action: "guest.updated", entityType: "guest", entityId: guestId, actor, createdAt, summary: "Datos básicos de huésped actualizados.", isDemo: true }, ...state.audit],
  };
}

export function updateReservation(
  state: OperationsState,
  input: ReservationUpdateInput,
  actor = DEMO_OPERATOR,
): OperationsState {
  validateStay(input);
  const reservation = state.reservations.find((item) => item.id === input.reservationId);
  if (!reservation) throw new Error("No se encontró la reserva.");
  if (!["inquiry", "pending", "pending_deposit", "confirmed", "partially_paid", "paid"].includes(reservation.status)) {
    throw new Error("El estado actual de la reserva no permite editarla.");
  }
  if (!state.guests.some((guest) => guest.id === input.guestId)) throw new Error("No se encontró el huésped.");
  const room = availableRoomsForStay(state, {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    excludeReservationId: reservation.id,
  }).find((item) => item.id === input.roomId);
  if (!room) throw new Error("La habitación ya no está disponible para esas fechas.");
  const total = nightsBetween(input.checkIn, input.checkOut) * input.nightlyRate;
  if (reservation.paid > total) throw new Error("El nuevo total no puede ser menor que el monto ya pagado.");
  const createdAt = nowIso();
  return {
    ...state,
    reservations: state.reservations.map((item) => item.id === reservation.id ? {
      ...item,
      primaryGuestId: input.guestId,
      roomId: input.roomId,
      guestCount: input.guestCount,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nightlyRate: input.nightlyRate,
      total,
      balance: Math.max(total - item.paid, 0),
      paymentStatus: paymentStatus(total, item.paid),
      source: input.source,
      expectedArrival: input.expectedArrival || undefined,
      externalReference: input.externalReference?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    } : item),
    audit: [{ id: id("audit"), action: "reservation.updated", entityType: "reservation", entityId: reservation.id, actor, createdAt, summary: "Reserva actualizada.", isDemo: true }, ...state.audit],
  };
}

export function cancelReservation(
  state: OperationsState,
  reservationId: string,
  reason: string,
  actor = DEMO_OPERATOR,
): OperationsState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation) throw new Error("No se encontró la reserva.");
  if (["checked_in", "accommodated", "checked_out", "completed"].includes(reservation.status)) {
    throw new Error("La estadía ya iniciada o finalizada no puede cancelarse.");
  }
  if (reason.trim().length < 2) throw new Error("Indicá un motivo de cancelación.");
  const createdAt = nowIso();
  return {
    ...state,
    reservations: state.reservations.map((item) => item.id === reservationId ? {
      ...item,
      status: "cancelled",
      roomId: undefined,
    } : item),
    audit: [{ id: id("audit"), action: "reservation.cancelled", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: "Reserva cancelada.", isDemo: true }, ...state.audit],
  };
}

export function performCheckIn(state: OperationsState, reservationId: string, actor = DEMO_OPERATOR, today = hostelDate()): OperationsState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation || !reservation.roomId) throw new Error("Seleccioná una reserva con habitación asignada.");
  if (!["confirmed", "partially_paid", "paid"].includes(reservation.status)) throw new Error("La reserva no está habilitada para check-in.");
  if (reservation.actualCheckIn || reservation.checkIn > today || reservation.checkOut <= today) throw new Error("La fecha de ingreso no corresponde.");
  const room = state.rooms.find((item) => item.id === reservation.roomId);
  if (!room?.active || !["reserved", "ready", "clean", "available"].includes(room.status)) throw new Error("La habitación no está lista para recibir huéspedes.");
  if (reservation.guestCount > room.capacity) throw new Error("La cantidad de huéspedes supera la capacidad de la habitación.");
  const createdAt = nowIso();
  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === reservation.roomId ? { ...item, status: "occupied", statusNote: undefined } : item),
    reservations: state.reservations.map((item) => item.id === reservationId ? { ...item, status: "accommodated", actualCheckIn: createdAt } : item),
    audit: [{ id: id("audit"), action: "check_in.completed", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Check-in realizado para ${reservation.code}.`, isDemo: true }, ...state.audit],
  };
}

export function performCheckOut(state: OperationsState, reservationId: string, actor = DEMO_OPERATOR): OperationsState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation || !reservation.roomId) throw new Error("Seleccioná una estadía alojada.");
  if (reservation.status !== "accommodated" || !reservation.actualCheckIn) throw new Error("La estadía no está en estado alojado.");
  if (reservation.balance > 0) throw new Error("La reserva todavía tiene saldo pendiente.");
  const room = state.rooms.find((item) => item.id === reservation.roomId);
  if (!room || room.status !== "occupied") throw new Error("La habitación no figura como ocupada.");
  const createdAt = nowIso();
  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === reservation.roomId ? { ...item, status: "pending_cleaning", statusNote: "Check-out realizado; requiere limpieza." } : item),
    reservations: state.reservations.map((item) => item.id === reservationId ? { ...item, status: "checked_out", actualCheckOut: createdAt } : item),
    housekeepingTasks: [{ id: id("housekeeping"), roomId: reservation.roomId, reservationId, status: "pending", priority: "medium", notes: "Limpieza posterior a check-out.", createdAt }, ...state.housekeepingTasks],
    audit: [{ id: id("audit"), action: "check_out.completed", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Check-out realizado para ${reservation.code}; habitación enviada a limpieza.`, isDemo: true }, ...state.audit],
  };
}

export function registerPayment(state: OperationsState, input: { reservationId: string; amount: number; method: PaymentMethod; reference?: string; note?: string }, actor = DEMO_OPERATOR): OperationsState {
  const reservation = state.reservations.find((item) => item.id === input.reservationId);
  if (!reservation) throw new Error("Seleccioná una reserva.");
  if (input.amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  if (input.amount > reservation.balance) throw new Error("El importe supera el saldo pendiente.");
  const createdAt = nowIso();
  const payment: Payment = {
    id: id("payment"),
    reservationId: reservation.id,
    guestId: reservation.primaryGuestId,
    amount: input.amount,
    currency: reservation.currency,
    direction: "charge",
    status: "posted",
    method: input.method,
    reference: input.reference?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt,
    createdBy: actor,
    createdByName: actor,
    isDemo: true,
  };
  const payments = [payment, ...state.payments];
  const financials = reservationFinancials(reservation.total, payments, reservation.id);
  return {
    ...state,
    reservations: state.reservations.map((item) => item.id === reservation.id ? { ...item, ...financials } : item),
    payments,
    audit: [{ id: id("audit"), action: "payment.registered", entityType: "reservation", entityId: reservation.id, actor, createdAt, summary: `Pago manual registrado para ${reservation.code}.`, isDemo: true }, ...state.audit],
  };
}

export function voidPayment(
  state: OperationsState,
  paymentId: string,
  reason: string,
  actor = DEMO_OPERATOR,
): OperationsState {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) throw new Error("No se encontró el pago.");
  if (payment.status === "voided") throw new Error("El pago ya está anulado.");
  if (reason.trim().length < 2 || reason.trim().length > 500) throw new Error("Indicá un motivo de anulación válido.");
  const reservation = state.reservations.find((item) => item.id === payment.reservationId);
  if (!reservation) throw new Error("No se encontró la reserva asociada.");
  const createdAt = nowIso();
  const payments = state.payments.map((item) => item.id === paymentId ? {
    ...item,
    status: "voided" as const,
    voidedAt: createdAt,
    voidedBy: actor,
    voidReason: reason.trim(),
  } : item);
  const financials = reservationFinancials(reservation.total, payments, reservation.id);
  return {
    ...state,
    payments,
    reservations: state.reservations.map((item) => item.id === reservation.id ? { ...item, ...financials } : item),
    audit: [{ id: id("audit"), action: "payment.voided", entityType: "payment", entityId: payment.id, actor, createdAt, summary: `Pago anulado para ${reservation.code}.`, isDemo: true }, ...state.audit],
  };
}

export function addInternalNote(state: OperationsState, input: Omit<InternalNote, "id" | "author" | "createdAt" | "isDemo">, actor = DEMO_OPERATOR): OperationsState {
  if (!input.text.trim()) throw new Error("Escribí una nota antes de guardarla.");
  const createdAt = nowIso();
  return {
    ...state,
    notes: [{ ...input, id: id("note"), text: input.text.trim(), author: actor, createdAt, isDemo: true }, ...state.notes],
    audit: [{ id: id("audit"), action: "note.created", entityType: input.entityType, entityId: input.entityId ?? "general", actor, createdAt, summary: "Nota interna de prueba agregada.", isDemo: true }, ...state.audit],
  };
}

export function setRoomStatus(state: OperationsState, roomId: string, status: RoomStatus, actor = DEMO_OPERATOR): OperationsState {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) throw new Error("No se encontró la habitación.");
  if (!isValidRoomStatusTransition(room.status, status)) throw new Error("Ese cambio no respeta el flujo operativo de la habitación.");
  const createdAt = nowIso();
  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === roomId ? { ...item, status, statusNote: undefined } : item),
    housekeepingTasks: state.housekeepingTasks.map((task) => task.roomId !== roomId || ["completed", "cancelled"].includes(task.status) ? task : {
      ...task,
      status: status === "cleaning" ? "in_progress" : status === "clean" ? "review" : status === "ready" ? "completed" : task.status,
      startedAt: ["cleaning", "clean", "ready"].includes(status) ? task.startedAt ?? createdAt : task.startedAt,
      completedAt: status === "ready" ? createdAt : task.completedAt,
    }),
    audit: [{ id: id("audit"), action: "room.status_changed", entityType: "room", entityId: roomId, actor, createdAt, summary: `${room.displayName} pasó a ${status}.`, isDemo: true }, ...state.audit],
  };
}

export function dashboardSnapshot(state: OperationsState) {
  const operations = buildStayOperationsReadModel(state, hostelDate());
  const pendingBalances = state.reservations.filter((item) => item.balance > 0 && !["cancelled", "rejected"].includes(item.status));
  return {
    today: operations.today,
    active: operations.currentlyStaying,
    arrivals: operations.arrivalsToday,
    departures: operations.departuresToday,
    pendingBalances,
    currentGuests: operations.currentGuests,
    occupiedRooms: operations.occupiedRooms,
    freeRooms: operations.availableRooms,
    blockedRooms: operations.outOfServiceRooms,
    cleaningRooms: operations.pendingCleaningRooms,
    readyRooms: state.rooms.filter((item) => ["clean", "ready"].includes(item.status)).length,
    maintenanceRooms: state.rooms.filter((item) => item.status === "maintenance").length,
    openIssues: state.issues.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    pendingBalanceTotal: pendingBalances.reduce((sum, item) => sum + item.balance, 0),
    pendingReservations: state.reservations.filter((item) => ["inquiry", "pending", "pending_deposit"].includes(item.status)).length,
  };
}
