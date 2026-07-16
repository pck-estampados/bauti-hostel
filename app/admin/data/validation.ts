import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá una fecha válida.");
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().or(z.literal(""));

const guestFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(40),
  document: optionalText(80),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
};

export const uuidSchema = z.string().uuid();
export const guestInputSchema = z.object(guestFields).strict();

const stayFields = {
  guestCount: z.number().int().min(1).max(30),
  roomId: uuidSchema,
  checkIn: isoDate,
  checkOut: isoDate,
  nightlyRate: z.number().finite().min(0).max(100_000_000),
  amountPaid: z.number().finite().min(0).max(100_000_000),
  paymentMethod: z.enum(["cash", "transfer", "mercado_pago", "card", "other"]),
  notes: optionalText(4000),
};

function datesAreOrdered(value: { checkIn: string; checkOut: string }) {
  return Date.parse(`${value.checkOut}T12:00:00Z`) > Date.parse(`${value.checkIn}T12:00:00Z`);
}

export const walkInInputSchema = z
  .object({ ...guestFields, ...stayFields })
  .strict()
  .refine(datesAreOrdered, { message: "La salida debe ser posterior al ingreso.", path: ["checkOut"] });

export const reservationInputSchema = z
  .object({
    ...guestFields,
    ...stayFields,
    source: z.enum(["phone", "whatsapp", "instagram", "web", "booking", "airbnb", "referral", "other"]),
    expectedArrival: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  })
  .strict()
  .refine(datesAreOrdered, { message: "La salida debe ser posterior al ingreso.", path: ["checkOut"] });

export const paymentInputSchema = z.object({
  reservationId: uuidSchema,
  amount: z.number().finite().positive().max(100_000_000),
  method: z.enum(["cash", "transfer", "mercado_pago", "card", "other"]),
  reference: optionalText(200),
  note: optionalText(1000),
}).strict();

export const noteInputSchema = z.object({
  entityType: z.enum(["general", "guest", "reservation", "room", "payment", "issue"]),
  entityId: uuidSchema.optional(),
  text: z.string().trim().min(1).max(4000),
}).strict();

export const roomStatusInputSchema = z.object({
  roomId: uuidSchema,
  status: z.enum([
    "available", "reserved", "occupied", "pending_cleaning", "cleaning",
    "clean", "ready", "maintenance", "blocked", "out_of_service",
  ]),
  reason: optionalText(500),
}).strict();

export type ValidatedWalkInInput = z.infer<typeof walkInInputSchema>;
export type ValidatedReservationInput = z.infer<typeof reservationInputSchema>;
export type ValidatedPaymentInput = z.infer<typeof paymentInputSchema>;
