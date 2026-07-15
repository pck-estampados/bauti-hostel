import type { OperationsState } from "./types";

export const HOSTEL_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const DEFAULT_REFERENCE_RATE_ARS = 50_000;
export const DEMO_OPERATOR = "Recepción de prueba";

export function hostelDate(offsetDays = 0): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSTEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatter.format(date);
}

function atLocalTime(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function createDemoOperationsState(): OperationsState {
  const today = hostelDate();
  const yesterday = hostelDate(-1);
  const twoDaysAgo = hostelDate(-2);
  const tomorrow = hostelDate(1);
  const afterTomorrow = hostelDate(2);

  return {
    rooms: [
      { id: "room-demo-a", code: "DEMO-A", displayName: "Habitación demo A", capacity: 2, status: "occupied", isDemo: true },
      { id: "room-demo-b", code: "DEMO-B", displayName: "Habitación demo B", capacity: 3, status: "ready", isDemo: true },
      { id: "room-demo-c", code: "DEMO-C", displayName: "Habitación demo C", capacity: 2, status: "occupied", isDemo: true },
      { id: "room-demo-d", code: "DEMO-D", displayName: "Habitación demo D", capacity: 4, status: "maintenance", statusNote: "Incidencia de prueba: revisar cerradura", isDemo: true },
    ],
    guests: [
      { id: "guest-demo-a", firstName: "Huésped", lastName: "de prueba A", phone: "+54 9 11 0000-0001", createdAt: atLocalTime(yesterday, "14:10"), isDemo: true },
      { id: "guest-demo-b", firstName: "Huésped", lastName: "de prueba B", phone: "+54 9 11 0000-0002", createdAt: atLocalTime(today, "08:20"), isDemo: true },
      { id: "guest-demo-c", firstName: "Huésped", lastName: "de prueba C", phone: "+54 9 11 0000-0003", createdAt: atLocalTime(twoDaysAgo, "17:40"), isDemo: true },
    ],
    reservations: [
      {
        id: "reservation-demo-a", code: "DEMO-RES-A", primaryGuestId: "guest-demo-a", roomId: "room-demo-a", guestCount: 2,
        checkIn: yesterday, checkOut: tomorrow, nightlyRate: DEFAULT_REFERENCE_RATE_ARS, total: 100_000, paid: 50_000, balance: 50_000,
        status: "accommodated", paymentStatus: "partial", source: "whatsapp", notes: "Dato de prueba: solicitó una habitación tranquila.",
        actualCheckIn: atLocalTime(yesterday, "15:06"), createdAt: atLocalTime(yesterday, "11:20"), createdBy: DEMO_OPERATOR, isDemo: true,
      },
      {
        id: "reservation-demo-b", code: "DEMO-RES-B", primaryGuestId: "guest-demo-b", roomId: "room-demo-b", guestCount: 2,
        checkIn: today, checkOut: afterTomorrow, expectedArrival: "18:30", nightlyRate: DEFAULT_REFERENCE_RATE_ARS, total: 100_000, paid: 30_000, balance: 70_000,
        status: "confirmed", paymentStatus: "partial", source: "instagram", notes: "Dato de prueba: avisó que llegará por la tarde.",
        createdAt: atLocalTime(today, "08:25"), createdBy: DEMO_OPERATOR, isDemo: true,
      },
      {
        id: "reservation-demo-c", code: "DEMO-RES-C", primaryGuestId: "guest-demo-c", roomId: "room-demo-c", guestCount: 1,
        checkIn: twoDaysAgo, checkOut: today, nightlyRate: DEFAULT_REFERENCE_RATE_ARS, total: 100_000, paid: 100_000, balance: 0,
        status: "accommodated", paymentStatus: "paid", source: "walk_in", actualCheckIn: atLocalTime(twoDaysAgo, "18:03"),
        createdAt: atLocalTime(twoDaysAgo, "18:00"), createdBy: DEMO_OPERATOR, isDemo: true,
      },
    ],
    payments: [
      { id: "payment-demo-a", reservationId: "reservation-demo-a", guestId: "guest-demo-a", amount: 50_000, currency: "ARS", method: "transfer", createdAt: atLocalTime(yesterday, "14:56"), createdBy: DEMO_OPERATOR, isDemo: true },
      { id: "payment-demo-b", reservationId: "reservation-demo-b", guestId: "guest-demo-b", amount: 30_000, currency: "ARS", method: "cash", createdAt: atLocalTime(today, "08:26"), createdBy: DEMO_OPERATOR, isDemo: true },
      { id: "payment-demo-c", reservationId: "reservation-demo-c", guestId: "guest-demo-c", amount: 100_000, currency: "ARS", method: "cash", createdAt: atLocalTime(twoDaysAgo, "18:02"), createdBy: DEMO_OPERATOR, isDemo: true },
    ],
    notes: [
      { id: "note-demo-a", entityType: "reservation", entityId: "reservation-demo-b", text: "Nota de prueba: confirmar horario de llegada durante la tarde.", author: DEMO_OPERATOR, createdAt: atLocalTime(today, "09:05"), isDemo: true },
      { id: "note-demo-b", entityType: "room", entityId: "room-demo-d", text: "Nota de prueba: la habitación permanece fuera de la operación hasta revisar la cerradura.", author: DEMO_OPERATOR, createdAt: atLocalTime(today, "09:18"), isDemo: true },
    ],
    issues: [
      { id: "issue-demo-a", roomId: "room-demo-d", area: "Habitación demo D", title: "Incidencia de prueba: revisar cerradura", priority: "high", status: "open", isDemo: true },
    ],
    audit: [],
  };
}
