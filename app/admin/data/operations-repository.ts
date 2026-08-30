import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  PaymentMethod,
  RoomStatus,
  ReservationUpdateInput,
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
  updateGuest(guestId: string, input: GuestInput): Promise<OperationsState>;
  createWalkIn(input: WalkInInput): Promise<OperationsState>;
  createReservation(input: ManualReservationInput): Promise<OperationsState>;
  updateReservation(input: ReservationUpdateInput): Promise<OperationsState>;
  cancelReservation(reservationId: string, reason: string): Promise<OperationsState>;
  checkIn(reservationId: string): Promise<OperationsState>;
  checkOut(reservationId: string): Promise<OperationsState>;
  registerPayment(input: {
    reservationId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    note?: string;
  }): Promise<OperationsState>;
  voidPayment(paymentId: string, reason: string): Promise<OperationsState>;
  addNote(input: NoteInput): Promise<OperationsState>;
  changeRoomStatus(roomId: string, status: RoomStatus, reason?: string): Promise<OperationsState>;
}
