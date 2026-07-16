import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  PaymentMethod,
  RoomStatus,
  WalkInInput,
} from "../lib/types";

export type GuestInput = {
  firstName: string;
  lastName: string;
  phone: string;
  document?: string;
  email?: string;
};

export type NoteInput = Omit<InternalNote, "id" | "author" | "createdAt" | "isDemo">;

export interface OperationsRepository {
  loadSnapshot(): Promise<OperationsState>;
  addGuest(input: GuestInput): Promise<OperationsState>;
  createWalkIn(input: WalkInInput): Promise<OperationsState>;
  createReservation(input: ManualReservationInput): Promise<OperationsState>;
  checkIn(reservationId: string): Promise<OperationsState>;
  checkOut(reservationId: string): Promise<OperationsState>;
  registerPayment(input: {
    reservationId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    note?: string;
  }): Promise<OperationsState>;
  addNote(input: NoteInput): Promise<OperationsState>;
  changeRoomStatus(roomId: string, status: RoomStatus, reason?: string): Promise<OperationsState>;
}
