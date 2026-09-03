import type {
  WellnessBooking,
  WellnessEvent,
  WellnessProduct,
  WellnessSlot,
} from "../data/wellness-types.ts";

export type RoomStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "pending_cleaning"
  | "cleaning"
  | "clean"
  | "ready"
  | "maintenance"
  | "blocked"
  | "out_of_service";

export type ReservationStatus =
  | "inquiry"
  | "pending"
  | "pending_deposit"
  | "confirmed"
  | "partially_paid"
  | "paid"
  | "checked_in"
  | "accommodated"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rejected";

export type PaymentStatus = "pending" | "partial" | "paid" | "refunded" | "rejected";
export type PaymentMethod = "cash" | "transfer" | "mercado_pago" | "card" | "other";
export type PaymentDirection = "charge" | "refund";
export type PaymentRecordStatus = "posted" | "voided";
export type ReservationSource =
  | "phone"
  | "whatsapp"
  | "instagram"
  | "walk_in"
  | "web"
  | "booking"
  | "airbnb"
  | "referral"
  | "other";

export type InternalRole =
  | "superadmin"
  | "owner"
  | "admin"
  | "reception"
  | "housekeeping"
  | "maintenance"
  | "customer";

export type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  document?: string;
  email?: string;
  createdAt: string;
  isDemo: boolean;
};

export type AvailabilityBlock = {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: "active" | "cancelled";
};

export type Room = {
  id: string;
  code: string;
  displayName: string;
  capacity: number;
  baseRate?: number;
  inventoryValid?: boolean;
  status: RoomStatus;
  statusNote?: string;
  active: boolean;
  isDemo: boolean;
};

export type HousekeepingTask = {
  id: string;
  roomId: string;
  reservationId?: string;
  status: "pending" | "assigned" | "in_progress" | "review" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
};

export type Reservation = {
  id: string;
  code: string;
  primaryGuestId: string;
  roomId?: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  expectedArrival?: string;
  nightlyRate: number;
  total: number;
  currency: "ARS";
  paid: number;
  balance: number;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  source: ReservationSource;
  externalReference?: string;
  notes?: string;
  actualCheckIn?: string;
  actualCheckOut?: string;
  createdAt: string;
  createdBy: string;
  isDemo: boolean;
};

export type Payment = {
  id: string;
  targetType: "stay" | "wellness";
  targetId: string;
  targetCode: string;
  reservationId?: string;
  financialReferenceId?: string;
  wellnessBookingId?: string;
  guestId?: string;
  amount: number;
  currency: "ARS";
  direction: PaymentDirection;
  status: PaymentRecordStatus;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  isDemo: boolean;
};

export type InternalNote = {
  id: string;
  entityType: "general" | "guest" | "reservation" | "room" | "payment" | "issue";
  entityId?: string;
  text: string;
  author: string;
  createdAt: string;
  isDemo: boolean;
};

export type MaintenanceIssue = {
  id: string;
  roomId?: string;
  area: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "pending" | "review" | "in_progress" | "resolved" | "closed";
  isDemo: boolean;
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  createdAt: string;
  summary: string;
  isDemo: boolean;
};

export type OperationsState = {
  rooms: Room[];
  guests: Guest[];
  reservations: Reservation[];
  payments: Payment[];
  notes: InternalNote[];
  issues: MaintenanceIssue[];
  audit: AuditEvent[];
  availabilityBlocks: AvailabilityBlock[];
  housekeepingTasks: HousekeepingTask[];
  wellnessProducts: WellnessProduct[];
  wellnessSlots: WellnessSlot[];
  wellnessBookings: WellnessBooking[];
  wellnessEvents: WellnessEvent[];
};

export type WalkInInput = {
  guestId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  document?: string;
  guestCount: number;
  roomId: string;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  notes?: string;
};

export type ManualReservationInput = Omit<WalkInInput, "amountPaid" | "paymentMethod"> & {
  guestId?: string;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  source: Exclude<ReservationSource, "walk_in">;
  expectedArrival?: string;
  externalReference?: string;
};

export type ReservationUpdateInput = {
  reservationId: string;
  guestId: string;
  roomId: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  source: Exclude<ReservationSource, "walk_in">;
  expectedArrival?: string;
  externalReference?: string;
  notes?: string;
};
