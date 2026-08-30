import type { OperationsState, Reservation, Room } from "../lib/types";

export type StayWindow = {
  checkIn: string;
  checkOut: string;
};

export type AvailabilityQuery = StayWindow & {
  guestCount: number;
  excludeReservationId?: string;
};

export const blockingReservationStatuses = new Set<Reservation["status"]>([
  "inquiry",
  "pending",
  "pending_deposit",
  "confirmed",
  "partially_paid",
  "paid",
  "checked_in",
  "accommodated",
]);

const reservableRoomStatuses = new Set<Room["status"]>(["available", "clean", "ready"]);

export function stayWindowsOverlap(first: StayWindow, second: StayWindow): boolean {
  return first.checkIn < second.checkOut && second.checkIn < first.checkOut;
}

export function isValidStayWindow(window: StayWindow): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(window.checkIn)
    && /^\d{4}-\d{2}-\d{2}$/.test(window.checkOut)
    && window.checkOut > window.checkIn;
}

export function availableRoomsForStay(
  state: OperationsState,
  query: AvailabilityQuery,
): Room[] {
  if (!isValidStayWindow(query) || !Number.isInteger(query.guestCount) || query.guestCount < 1) {
    return [];
  }

  return state.rooms.filter((room) => {
    if ((!room.isDemo && !room.inventoryValid)
      || !reservableRoomStatuses.has(room.status)
      || room.capacity < query.guestCount) {
      return false;
    }

    const hasReservationConflict = state.reservations.some((reservation) => (
      reservation.id !== query.excludeReservationId
      && reservation.roomId === room.id
      && blockingReservationStatuses.has(reservation.status)
      && stayWindowsOverlap(query, reservation)
    ));
    if (hasReservationConflict) return false;

    return !state.availabilityBlocks.some((block) => (
      block.roomId === room.id
      && block.status === "active"
      && stayWindowsOverlap(query, block)
    ));
  });
}

export function findPotentialGuestMatches(
  state: OperationsState,
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase("es-AR");
  const digits = query.replace(/\D/g, "");
  if (!needle) return state.guests;

  return state.guests.filter((guest) => {
    const name = `${guest.firstName} ${guest.lastName}`.toLocaleLowerCase("es-AR");
    const phone = guest.phone.replace(/\D/g, "");
    return name.includes(needle)
      || guest.email?.toLocaleLowerCase("es-AR").includes(needle)
      || Boolean(digits && phone.includes(digits));
  });
}
