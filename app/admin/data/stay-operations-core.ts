import type {
  Guest,
  OperationsState,
  Reservation,
  Room,
  RoomStatus,
} from "../lib/types.ts";

export const STAY_OPERATION_TIME_ZONE = "America/Argentina/Buenos_Aires";

const checkInReadyStatuses = new Set<Reservation["status"]>([
  "confirmed",
  "partially_paid",
  "paid",
]);
const operationallyAvailableStatuses = new Set<RoomStatus>(["available", "clean", "ready"]);
const attentionStatuses = new Set<RoomStatus>([
  "pending_cleaning",
  "cleaning",
  "maintenance",
  "blocked",
  "out_of_service",
]);

export const roomStatusTransitions: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  available: ["ready", "maintenance", "blocked", "out_of_service"],
  reserved: ["available", "ready", "maintenance", "blocked", "out_of_service"],
  occupied: [],
  pending_cleaning: ["cleaning", "maintenance", "blocked", "out_of_service"],
  cleaning: ["clean", "maintenance", "blocked", "out_of_service"],
  clean: ["ready", "available", "maintenance", "blocked", "out_of_service"],
  ready: ["available", "maintenance", "blocked", "out_of_service"],
  maintenance: ["pending_cleaning", "blocked", "out_of_service"],
  blocked: ["pending_cleaning", "maintenance", "out_of_service"],
  out_of_service: ["pending_cleaning", "maintenance", "blocked"],
};

export function allowedRoomStatusTransitions(status: RoomStatus): readonly RoomStatus[] {
  return roomStatusTransitions[status];
}

export function isValidRoomStatusTransition(from: RoomStatus, to: RoomStatus): boolean {
  return from === to || roomStatusTransitions[from].includes(to);
}

export function hostelLocalDate(now = new Date(), offsetDays = 0): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STAY_OPERATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = formatter.format(now);
  const shifted = new Date(`${localDate}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

export type RoomOccupancy = {
  room: Room;
  reservation?: Reservation;
  guest?: Guest;
};

export type StayOperationsReadModel = {
  today: string;
  arrivalsToday: Reservation[];
  departuresToday: Reservation[];
  currentlyStaying: Reservation[];
  overdueCheckouts: Reservation[];
  pendingCheckIns: Reservation[];
  roomsRequiringAttention: Room[];
  roomOccupancy: RoomOccupancy[];
  totalRooms: number;
  activeRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  pendingCleaningRooms: number;
  outOfServiceRooms: number;
  currentGuests: number;
  lodgingCapacity: number;
};

export function buildStayOperationsReadModel(
  state: OperationsState,
  today = hostelLocalDate(),
): StayOperationsReadModel {
  const currentlyStaying = state.reservations.filter(
    (reservation) => reservation.status === "accommodated",
  );
  const activeRooms = state.rooms.filter((room) => room.active);
  const arrivalsToday = state.reservations.filter(
    (reservation) => reservation.checkIn === today && checkInReadyStatuses.has(reservation.status),
  );
  const pendingCheckIns = state.reservations.filter(
    (reservation) => checkInReadyStatuses.has(reservation.status)
      && reservation.checkIn <= today
      && reservation.checkOut > today,
  );
  const departuresToday = currentlyStaying.filter((reservation) => reservation.checkOut === today);
  const overdueCheckouts = currentlyStaying.filter((reservation) => reservation.checkOut < today);
  const activeStayByRoom = new Map(
    currentlyStaying.flatMap((reservation) => reservation.roomId ? [[reservation.roomId, reservation] as const] : []),
  );
  const guestsById = new Map(state.guests.map((guest) => [guest.id, guest]));

  return {
    today,
    arrivalsToday,
    departuresToday,
    currentlyStaying,
    overdueCheckouts,
    pendingCheckIns,
    roomsRequiringAttention: activeRooms.filter((room) => attentionStatuses.has(room.status)),
    roomOccupancy: state.rooms.map((room) => {
      const reservation = activeStayByRoom.get(room.id);
      return {
        room,
        reservation,
        guest: reservation ? guestsById.get(reservation.primaryGuestId) : undefined,
      };
    }),
    totalRooms: state.rooms.length,
    activeRooms: activeRooms.length,
    occupiedRooms: activeRooms.filter((room) => room.status === "occupied").length,
    availableRooms: activeRooms.filter((room) => operationallyAvailableStatuses.has(room.status)).length,
    pendingCleaningRooms: activeRooms.filter(
      (room) => room.status === "pending_cleaning" || room.status === "cleaning",
    ).length,
    outOfServiceRooms: activeRooms.filter(
      (room) => room.status === "maintenance" || room.status === "blocked" || room.status === "out_of_service",
    ).length,
    currentGuests: currentlyStaying.reduce((total, reservation) => total + reservation.guestCount, 0),
    lodgingCapacity: activeRooms.reduce((total, room) => total + room.capacity, 0),
  };
}
