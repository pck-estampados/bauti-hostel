import type { OperationsState } from "../lib/types.ts";
import type { WellnessBooking, WellnessProduct, WellnessProductType, WellnessSlot } from "./wellness-types.ts";

export const WELLNESS_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const WELLNESS_SLOT_WINDOWS = [
  { start: "10:00", end: "13:00" },
  { start: "14:00", end: "17:00" },
  { start: "18:00", end: "21:00" },
] as const;

export function wellnessLocalDate(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WELLNESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function wellnessLocalTime(value: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: WELLNESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function expectedSlotCount(productType: WellnessProductType): number {
  if (productType === "circuit_relax") return 1;
  if (productType === "day_pass_relax") return 3;
  return 0;
}

export function overlappingSlots(slots: WellnessSlot[], startAt: string, endAt: string): WellnessSlot[] {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  return slots.filter((slot) => Date.parse(slot.startAt) < end && Date.parse(slot.endAt) > start);
}

export function assertCapacityAvailable(
  slots: WellnessSlot[],
  startAt: string,
  endAt: string,
  capacityUnits: number,
  productType: WellnessProductType,
): WellnessSlot[] {
  if (!Number.isInteger(capacityUnits) || capacityUnits < 1) throw new Error("INVALID_PARTY_SIZE");
  const selected = overlappingSlots(slots, startAt, endAt);
  if (selected.length !== expectedSlotCount(productType)) throw new Error("WELLNESS_REQUIRED_SLOTS_MISSING");
  for (const slot of selected) {
    if (
      !slot.salesEnabled
      || slot.status !== "open"
      || slot.capacityLimit === null
      || slot.externalCapacityLimit === null
    ) {
      throw new Error("WELLNESS_CAPACITY_NOT_CONFIGURED");
    }
    if ((slot.availableExternal ?? 0) < capacityUnits) throw new Error("WELLNESS_CAPACITY_EXCEEDED");
  }
  return selected;
}

export function wellnessPrice(product: WellnessProduct, startAt: string, partySize: number): number {
  const party = partySize === 1 ? "individual" : partySize === 2 ? "couple" : null;
  if (!party) throw new Error("INVALID_PARTY_SIZE");
  if (product.productType === "circuit_relax") return Number(product.pricingRules[party] ?? 0);
  if (product.productType !== "day_pass_relax") throw new Error("CLUB_RELAX_NOT_AVAILABLE");
  const date = wellnessLocalDate(startAt);
  const day = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  const holiday = product.pricingRules.holiday_dates?.includes(date);
  const tier = holiday || day === 0 || day === 6 ? "weekend_holiday" : day === 5 ? "friday" : "mon_thu";
  return Number(product.pricingRules[tier]?.[party] ?? 0);
}

export function buildWellnessReadModel(state: OperationsState, now = new Date()) {
  const today = wellnessLocalDate(now);
  const nowTime = now.getTime();
  const todayBookings = state.wellnessBookings.filter((booking) => wellnessLocalDate(booking.startAt) === today);
  const scheduledBookings = todayBookings.filter((booking) => !["cancelled", "pending_payment"].includes(booking.status));
  const currentBookings = scheduledBookings.filter((booking) => (
    ["confirmed", "checked_in"].includes(booking.status)
    && Date.parse(booking.startAt) <= nowTime
    && Date.parse(booking.endAt) > nowTime
  ));
  const presentBookings = state.wellnessBookings.filter((booking) => booking.status === "checked_in");
  const todaySlots = state.wellnessSlots
    .filter((slot) => wellnessLocalDate(slot.startAt) === today)
    .toSorted((left, right) => left.startAt.localeCompare(right.startAt));
  const currentSlot = todaySlots.find((slot) => Date.parse(slot.startAt) <= nowTime && Date.parse(slot.endAt) > nowTime);
  const upcomingSlot = state.wellnessSlots
    .filter((slot) => Date.parse(slot.startAt) > nowTime)
    .toSorted((left, right) => left.startAt.localeCompare(right.startAt))[0];
  const productById = new Map(state.wellnessProducts.map((product) => [product.id, product]));
  const housedGuests = state.reservations
    .filter((reservation) => reservation.status === "accommodated")
    .reduce((total, reservation) => total + reservation.guestCount, 0);

  return {
    today,
    todaySlots,
    todayBookings,
    circuitCount: scheduledBookings.filter((booking) => productById.get(booking.productId)?.productType === "circuit_relax").length,
    dayPassCount: scheduledBookings.filter((booking) => productById.get(booking.productId)?.productType === "day_pass_relax").length,
    externalReserved: currentBookings.reduce((total, booking) => total + booking.capacityUnits, 0),
    externalPresent: presentBookings.reduce((total, booking) => total + booking.partySize, 0),
    housedGuests,
    currentSlot,
    upcomingSlot,
    capacityConfigured: state.wellnessSlots.some((slot) => (
      slot.capacityLimit !== null && slot.externalCapacityLimit !== null
    )),
    currentExternalCapacity: currentSlot?.externalCapacityLimit ?? null,
    currentRemaining: currentSlot?.availableExternal ?? null,
  };
}

export function bookingEndAt(productType: WellnessProductType, startAt: string): string {
  const start = Date.parse(startAt);
  const hours = productType === "circuit_relax" ? 3 : productType === "day_pass_relax" ? 9 : 0;
  if (!hours) throw new Error("CLUB_RELAX_NOT_AVAILABLE");
  return new Date(start + hours * 60 * 60 * 1000).toISOString();
}

export function bookingReleasesCapacity(booking: Pick<WellnessBooking, "status">): boolean {
  return booking.status === "cancelled" || booking.status === "pending_payment";
}
