"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createDemoOperationsState, DEMO_OPERATOR } from "../lib/demo-data";
import {
  addGuest,
  addInternalNote,
  cancelReservation,
  createManualReservation,
  createWalkIn,
  performCheckIn,
  performCheckOut,
  registerPayment,
  setRoomStatus,
  updateGuest,
  updateReservation,
  voidPayment,
} from "../lib/operations";
import type {
  InternalNote,
  ManualReservationInput,
  OperationsState,
  PaymentMethod,
  RoomStatus,
  ReservationUpdateInput,
  WalkInInput,
} from "../lib/types";

type GuestInput = { firstName: string; lastName: string; phone: string; document?: string; email?: string };
type NoteInput = Omit<InternalNote, "id" | "author" | "createdAt" | "isDemo">;
type AppMode = "demo" | "production";

type OperationsContextValue = {
  state: OperationsState;
  actor: string;
  mode: AppMode;
  permissions: string[];
  resetDemo: () => void;
  addGuest: (input: GuestInput) => Promise<void>;
  updateGuest: (guestId: string, input: GuestInput) => Promise<void>;
  addWalkIn: (input: WalkInInput) => Promise<void>;
  addReservation: (input: ManualReservationInput) => Promise<void>;
  updateReservation: (input: ReservationUpdateInput) => Promise<void>;
  cancelReservation: (reservationId: string, reason: string) => Promise<void>;
  checkIn: (reservationId: string) => Promise<void>;
  checkOut: (reservationId: string) => Promise<void>;
  addPayment: (input: { reservationId: string; amount: number; method: PaymentMethod; reference?: string; note?: string }) => Promise<void>;
  voidPayment: (paymentId: string, reason: string) => Promise<void>;
  addNote: (input: NoteInput) => Promise<void>;
  changeRoomStatus: (roomId: string, status: RoomStatus, reason?: string) => Promise<void>;
};

const OperationsContext = createContext<OperationsContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  actor?: string;
  mode?: AppMode;
  initialState?: OperationsState;
  permissions?: string[];
};

export function OperationsProvider({
  children,
  actor = DEMO_OPERATOR,
  mode = "demo",
  initialState,
  permissions = [],
}: ProviderProps) {
  const [state, setState] = useState<OperationsState>(() => initialState ?? createDemoOperationsState());

  async function remote(operation: string, payload: unknown) {
    const response = await fetch("/api/admin/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ operation, payload }),
    });
    const result = await response.json() as { state?: OperationsState; error?: string };
    if (!response.ok || !result.state) throw new Error(result.error ?? "No fue posible completar la operación.");
    setState(result.state);
  }

  async function execute(
    operation: string,
    payload: unknown,
    update: (previous: OperationsState) => OperationsState,
  ) {
    if (mode === "production") return remote(operation, payload);
    setState(update);
  }

  const value = useMemo<OperationsContextValue>(() => ({
    state,
    actor,
    mode,
    permissions,
    resetDemo: () => { if (mode === "demo") setState(createDemoOperationsState()); },
    addGuest: (input) => execute("addGuest", input, (previous) => addGuest(previous, input, actor)),
    updateGuest: (guestId, input) => execute("updateGuest", { guestId, ...input }, (previous) => updateGuest(previous, guestId, input, actor)),
    addWalkIn: (input) => execute("createWalkIn", input, (previous) => createWalkIn(previous, input, actor)),
    addReservation: (input) => execute("createReservation", input, (previous) => createManualReservation(previous, input, actor)),
    updateReservation: (input) => execute("updateReservation", input, (previous) => updateReservation(previous, input, actor)),
    cancelReservation: (reservationId, reason) => execute("cancelReservation", { reservationId, reason }, (previous) => cancelReservation(previous, reservationId, reason, actor)),
    checkIn: (reservationId) => execute("checkIn", { reservationId }, (previous) => performCheckIn(previous, reservationId, actor)),
    checkOut: (reservationId) => execute("checkOut", { reservationId }, (previous) => performCheckOut(previous, reservationId, actor)),
    addPayment: (input) => execute("registerPayment", input, (previous) => registerPayment(previous, input, actor)),
    voidPayment: (paymentId, reason) => execute("voidPayment", { paymentId, reason }, (previous) => voidPayment(previous, paymentId, reason, actor)),
    addNote: (input) => execute("addNote", input, (previous) => addInternalNote(previous, input, actor)),
    changeRoomStatus: (roomId, status, reason) => execute("changeRoomStatus", { roomId, status, reason }, (previous) => setRoomStatus(previous, roomId, status, actor)),
  // State updates use React's functional form; state itself is exposed in the context value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [actor, mode, permissions, state]);

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const value = useContext(OperationsContext);
  if (!value) throw new Error("useOperations debe utilizarse dentro de OperationsProvider.");
  return value;
}
