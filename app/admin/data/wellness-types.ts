export type WellnessProductType = "circuit_relax" | "day_pass_relax" | "club_relax";
export type WellnessBookingStatus =
  | "pending_payment"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";
export type WellnessSource =
  | "web"
  | "whatsapp"
  | "phone"
  | "walk_in"
  | "instagram"
  | "referral"
  | "admin"
  | "other";
export type WellnessSlotStatus = "open" | "blocked";

export type WellnessTierPrices = { individual: number; couple: number };
export type WellnessPricingRules = {
  individual?: number;
  couple?: number;
  mon_thu?: WellnessTierPrices;
  friday?: WellnessTierPrices;
  weekend_holiday?: WellnessTierPrices;
  holiday_dates?: string[];
};

export type WellnessPolicyRules = {
  rebookingHours?: number;
  lateCancellationCreditPercent?: number;
  noShowCreditPercent?: number;
  notes?: string;
};

export type WellnessProduct = {
  id: string;
  code: string;
  name: string;
  productType: WellnessProductType;
  description?: string;
  active: boolean;
  salesEnabled: boolean;
  durationMinutes: number;
  currency: "ARS";
  pricingRules: WellnessPricingRules;
  policyRules: WellnessPolicyRules;
  instructions?: string;
  updatedAt: string;
};

export type WellnessSlot = {
  id: string;
  startAt: string;
  endAt: string;
  capacityLimit: number | null;
  externalCapacityLimit: number | null;
  guestBuffer: number;
  bookedExternal: number;
  availableExternal: number | null;
  salesEnabled: boolean;
  status: WellnessSlotStatus;
  notes?: string;
};

export type WellnessBooking = {
  id: string;
  code: string;
  financialReferenceId: string;
  guestId: string;
  productId: string;
  startAt: string;
  endAt: string;
  partySize: number;
  capacityUnits: number;
  source: WellnessSource;
  status: WellnessBookingStatus;
  settlementType: "payment" | "membership_credit";
  priceSnapshot: Record<string, unknown>;
  policySnapshot: Record<string, unknown>;
  total: number;
  amountPaid: number;
  balanceDue: number;
  currency: "ARS";
  notes?: string;
  actualCheckInAt?: string;
  actualEndAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  slotIds: string[];
};

export type WellnessEvent = {
  id: string;
  bookingId: string;
  eventType:
    | "RESERVATION_CREATED"
    | "PAYMENT_REGISTERED"
    | "RESERVATION_CONFIRMED"
    | "CANCELLED"
    | "CHECKED_IN"
    | "COMPLETED"
    | "NO_SHOW"
    | "ADMIN_OVERRIDE";
  actorId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WellnessProductInput = Omit<WellnessProduct, "id" | "updatedAt"> & { id?: string };
export type WellnessSlotInput = Omit<WellnessSlot, "id" | "bookedExternal" | "availableExternal"> & { id?: string };
export type WellnessBookingInput = {
  guestId: string;
  productId: string;
  startAt: string;
  partySize: number;
  source: WellnessSource;
  paymentMethod: "cash" | "transfer" | "mercado_pago" | "card" | "other";
  paymentReference?: string;
  paymentNote?: string;
  notes?: string;
};
