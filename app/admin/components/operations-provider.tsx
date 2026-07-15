"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createDemoOperationsState, DEMO_OPERATOR } from "../lib/demo-data";
import {
  addGuest,
  addInternalNote,
  createManualReservation,
  createWalkIn,
  performCheckIn,
  performCheckOut,
  registerPayment,
  setRoomStatus,
} from "../lib/operations";
import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  PaymentMethod,
  RoomStatus,
  WalkInInput,
} from "../lib/types";

type GuestInput = { firstName: string; lastName: string; phone: string; document?: string; email?: string };
type NoteInput = Omit<InternalNote, "id" | "author" | "createdAt" | "isDemo">;

type OperationsContextValue = {
  state: OperationsState;
  actor: string;
  resetDemo: () => void;
  addGuest: (input: GuestInput) => void;
  addWalkIn: (input: WalkInInput) => void;
  addReservation: (input: ManualReservationInput) => void;
  checkIn: (reservationId: string) => void;
  checkOut: (reservationId: string) => void;
  addPayment: (input: { reservationId: string; amount: number; method: PaymentMethod; reference?: string; note?: string }) => void;
  addNote: (input: NoteInput) => void;
  changeRoomStatus: (roomId: string, status: RoomStatus) => void;
};

const OperationsContext = createContext<OperationsContextValue | null>(null);

export function OperationsProvider({ children, actor = DEMO_OPERATOR }: { children: ReactNode; actor?: string }) {
  const [state, setState] = useState<OperationsState>(() => createDemoOperationsState());

  const value = useMemo<OperationsContextValue>(() => ({
    state,
    actor,
    resetDemo: () => setState(createDemoOperationsState()),
    addGuest: (input) => setState(addGuest(state, input, actor)),
    addWalkIn: (input) => setState(createWalkIn(state, input, actor)),
    addReservation: (input) => setState(createManualReservation(state, input, actor)),
    checkIn: (reservationId) => setState(performCheckIn(state, reservationId, actor)),
    checkOut: (reservationId) => setState(performCheckOut(state, reservationId, actor)),
    addPayment: (input) => setState(registerPayment(state, input, actor)),
    addNote: (input) => setState(addInternalNote(state, input, actor)),
    changeRoomStatus: (roomId, status) => setState(setRoomStatus(state, roomId, status, actor)),
  }), [actor, state]);

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const value = useContext(OperationsContext);
  if (!value) throw new Error("useOperations debe utilizarse dentro de OperationsProvider.");
  return value;
}
