import { DEMO_OPERATOR, hostelDate } from "./demo-data";
import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  PaymentMethod,
  Reservation,
  RoomStatus,
  WalkInInput,
} from "./types";

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
  if (paid <= 0) return "pending" as const;
  if (paid >= total) return "paid" as const;
  return "partial" as const;
}

export function validateStay(input: { checkIn: string; checkOut: string; guestCount: number; nightlyRate: number }) {
  if (!input.checkIn || !input.checkOut) throw new Error("Completá las fechas de ingreso y salida.");
  if (nightsBetween(input.checkIn, input.checkOut) < 1) throw new Error("La salida debe ser posterior al ingreso.");
  if (input.guestCount < 1) throw new Error("Debe registrarse al menos una persona.");
  if (input.nightlyRate < 0) throw new Error("La tarifa no puede ser negativa.");
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createWalkIn(state: OperationsState, input: WalkInInput, actor = DEMO_OPERATOR): OperationsState {
  validateStay(input);
  const room = state.rooms.find((item) => item.id === input.roomId);
  if (!room || !isRoomOperationallyAvailable(room.status)) throw new Error("La habitación seleccionada ya no está disponible.");
  if (input.guestCount > room.capacity) throw new Error("La cantidad de huéspedes supera la capacidad configurada.");
  if (input.amountPaid < 0) throw new Error("El monto pagado no puede ser negativo.");

  const guestId = id("guest");
  const reservationId = id("reservation");
  const createdAt = nowIso();
  const total = nightsBetween(input.checkIn, input.checkOut) * input.nightlyRate;
  const paid = Math.min(input.amountPaid, total);
  const guest = {
    id: guestId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(),
    document: input.document?.trim() || undefined, createdAt, isDemo: true,
  };
  const reservation: Reservation = {
    id: reservationId, code: `WALK-${Date.now().toString().slice(-6)}`, primaryGuestId: guestId, roomId: room.id,
    guestCount: input.guestCount, checkIn: input.checkIn, checkOut: input.checkOut, nightlyRate: input.nightlyRate,
    total, paid, balance: Math.max(total - paid, 0), status: "accommodated", paymentStatus: paymentStatus(total, paid),
    source: "walk_in", notes: input.notes?.trim() || undefined, actualCheckIn: createdAt, createdAt, createdBy: actor, isDemo: true,
  };

  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === room.id ? { ...item, status: "occupied", statusNote: undefined } : item),
    guests: [guest, ...state.guests],
    reservations: [reservation, ...state.reservations],
    payments: paid > 0 ? [{ id: id("payment"), reservationId, guestId, amount: paid, currency: "ARS", method: input.paymentMethod, createdAt, createdBy: actor, isDemo: true }, ...state.payments] : state.payments,
    notes: input.notes?.trim() ? [{ id: id("note"), entityType: "reservation", entityId: reservationId, text: input.notes.trim(), author: actor, createdAt, isDemo: true }, ...state.notes] : state.notes,
    audit: [{ id: id("audit"), action: "walk_in.created_and_checked_in", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Ingreso directo registrado en ${room.displayName}.`, isDemo: true }, ...state.audit],
  };
}

export function createManualReservation(state: OperationsState, input: ManualReservationInput, actor = DEMO_OPERATOR): OperationsState {
  validateStay(input);
  const room = state.rooms.find((item) => item.id === input.roomId);
  if (!room || !isRoomOperationallyAvailable(room.status)) throw new Error("La habitación seleccionada no está operativamente disponible.");
  if (input.guestCount > room.capacity) throw new Error("La cantidad de huéspedes supera la capacidad configurada.");
  const total = nightsBetween(input.checkIn, input.checkOut) * input.nightlyRate;
  const paid = Math.min(Math.max(input.amountPaid, 0), total);
  const createdAt = nowIso();
  const guestId = id("guest");
  const reservationId = id("reservation");

  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === room.id ? { ...item, status: "reserved" } : item),
    guests: [{ id: guestId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(), document: input.document?.trim() || undefined, createdAt, isDemo: true }, ...state.guests],
    reservations: [{
      id: reservationId, code: `RES-${Date.now().toString().slice(-6)}`, primaryGuestId: guestId, roomId: room.id,
      guestCount: input.guestCount, checkIn: input.checkIn, checkOut: input.checkOut, expectedArrival: input.expectedArrival,
      nightlyRate: input.nightlyRate, total, paid, balance: Math.max(total - paid, 0), status: "confirmed",
      paymentStatus: paymentStatus(total, paid), source: input.source, notes: input.notes?.trim() || undefined,
      createdAt, createdBy: actor, isDemo: true,
    }, ...state.reservations],
    payments: paid > 0 ? [{ id: id("payment"), reservationId, guestId, amount: paid, currency: "ARS", method: input.paymentMethod, createdAt, createdBy: actor, isDemo: true }, ...state.payments] : state.payments,
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

export function performCheckIn(state: OperationsState, reservationId: string, actor = DEMO_OPERATOR): OperationsState {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation || !reservation.roomId) throw new Error("Seleccioná una reserva con habitación asignada.");
  if (!["confirmed", "partially_paid", "paid"].includes(reservation.status)) throw new Error("La reserva no está habilitada para check-in.");
  const room = state.rooms.find((item) => item.id === reservation.roomId);
  if (!room || !["reserved", "ready", "clean", "available"].includes(room.status)) throw new Error("La habitación no está lista para recibir huéspedes.");
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
  if (reservation.status !== "accommodated") throw new Error("La estadía no está en estado alojado.");
  const createdAt = nowIso();
  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === reservation.roomId ? { ...item, status: "pending_cleaning", statusNote: "Check-out realizado; requiere limpieza." } : item),
    reservations: state.reservations.map((item) => item.id === reservationId ? { ...item, status: "checked_out", actualCheckOut: createdAt } : item),
    audit: [{ id: id("audit"), action: "check_out.completed", entityType: "reservation", entityId: reservationId, actor, createdAt, summary: `Check-out realizado para ${reservation.code}; habitación enviada a limpieza.`, isDemo: true }, ...state.audit],
  };
}

export function registerPayment(state: OperationsState, input: { reservationId: string; amount: number; method: PaymentMethod; reference?: string; note?: string }, actor = DEMO_OPERATOR): OperationsState {
  const reservation = state.reservations.find((item) => item.id === input.reservationId);
  if (!reservation) throw new Error("Seleccioná una reserva.");
  if (input.amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  if (input.amount > reservation.balance) throw new Error("El importe supera el saldo pendiente.");
  const createdAt = nowIso();
  const paid = reservation.paid + input.amount;
  const balance = Math.max(reservation.total - paid, 0);
  return {
    ...state,
    reservations: state.reservations.map((item) => item.id === reservation.id ? { ...item, paid, balance, paymentStatus: paymentStatus(item.total, paid) } : item),
    payments: [{ id: id("payment"), reservationId: reservation.id, guestId: reservation.primaryGuestId, amount: input.amount, currency: "ARS", method: input.method, reference: input.reference?.trim() || undefined, note: input.note?.trim() || undefined, createdAt, createdBy: actor, isDemo: true }, ...state.payments],
    audit: [{ id: id("audit"), action: "payment.registered", entityType: "reservation", entityId: reservation.id, actor, createdAt, summary: `Pago manual registrado para ${reservation.code}.`, isDemo: true }, ...state.audit],
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
  const createdAt = nowIso();
  return {
    ...state,
    rooms: state.rooms.map((item) => item.id === roomId ? { ...item, status, statusNote: undefined } : item),
    audit: [{ id: id("audit"), action: "room.status_changed", entityType: "room", entityId: roomId, actor, createdAt, summary: `${room.displayName} pasó a ${status}.`, isDemo: true }, ...state.audit],
  };
}

export function dashboardSnapshot(state: OperationsState) {
  const today = hostelDate();
  const active = state.reservations.filter((item) => item.status === "accommodated");
  const arrivals = state.reservations.filter((item) => item.checkIn === today && ["confirmed", "partially_paid", "paid"].includes(item.status));
  const departures = active.filter((item) => item.checkOut === today);
  const pendingBalances = state.reservations.filter((item) => item.balance > 0 && !["cancelled", "rejected"].includes(item.status));
  return {
    today,
    active,
    arrivals,
    departures,
    pendingBalances,
    currentGuests: active.reduce((sum, item) => sum + item.guestCount, 0),
    occupiedRooms: state.rooms.filter((item) => item.status === "occupied").length,
    freeRooms: state.rooms.filter((item) => isRoomOperationallyAvailable(item.status)).length,
    blockedRooms: state.rooms.filter((item) => ["blocked", "out_of_service"].includes(item.status)).length,
    cleaningRooms: state.rooms.filter((item) => ["pending_cleaning", "cleaning"].includes(item.status)).length,
    readyRooms: state.rooms.filter((item) => ["clean", "ready"].includes(item.status)).length,
    maintenanceRooms: state.rooms.filter((item) => item.status === "maintenance").length,
    openIssues: state.issues.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    pendingBalanceTotal: pendingBalances.reduce((sum, item) => sum + item.balance, 0),
  };
}
