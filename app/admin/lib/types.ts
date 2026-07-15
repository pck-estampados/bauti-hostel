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

export type Room = {
  id: string;
  code: string;
  displayName: string;
  capacity: number;
  status: RoomStatus;
  statusNote?: string;
  isDemo: boolean;
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
  paid: number;
  balance: number;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  source: ReservationSource;
  notes?: string;
  actualCheckIn?: string;
  actualCheckOut?: string;
  createdAt: string;
  createdBy: string;
  isDemo: boolean;
};

export type Payment = {
  id: string;
  reservationId: string;
  guestId: string;
  amount: number;
  currency: "ARS";
  method: PaymentMethod;
  reference?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
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
};

export type WalkInInput = {
  firstName: string;
  lastName: string;
  phone: string;
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
  amountPaid: number;
  paymentMethod: PaymentMethod;
  source: Exclude<ReservationSource, "walk_in">;
  expectedArrival?: string;
};
