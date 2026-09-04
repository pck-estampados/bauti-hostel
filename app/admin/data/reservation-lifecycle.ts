import type { ReservationStatus } from "../lib/types";

export type ReservationLifecycle = Exclude<ReservationStatus, "paid" | "partially_paid">;

// Compatibility only: do not derive operational state from balance. T3 will
// migrate writers after historical lifecycle records have been reviewed.
export function reservationLifecycle(input: {
  status: ReservationStatus; actualCheckIn?: string; actualCheckOut?: string;
}): ReservationLifecycle {
  if (input.status !== "paid" && input.status !== "partially_paid") return input.status;
  if (input.actualCheckOut) return "checked_out";
  if (input.actualCheckIn) return "checked_in";
  return "confirmed";
}
