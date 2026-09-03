import { z } from "zod";
import { uuidSchema } from "./validation.ts";
import { wellnessLocalDate, wellnessLocalTime } from "./wellness-capacity-core.ts";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().or(z.literal(""));
const money = z.number().finite().positive().max(100_000_000);
const tierPrices = z.object({ individual: money, couple: money }).strict();
const policyRules = z.object({
  rebookingHours: z.number().int().min(0).max(720).optional(),
  lateCancellationCreditPercent: z.number().int().min(0).max(100).optional(),
  noShowCreditPercent: z.number().int().min(0).max(100).optional(),
  notes: optionalText(1000),
}).strict();
const productCommon = {
  id: uuidSchema.optional(),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/),
  name: z.string().trim().min(2).max(120),
  description: optionalText(2000),
  active: z.boolean(),
  salesEnabled: z.boolean(),
  currency: z.literal("ARS"),
  policyRules,
  instructions: optionalText(4000),
};

export const wellnessProductInputSchema = z.discriminatedUnion("productType", [
  z.object({
    ...productCommon,
    productType: z.literal("circuit_relax"),
    durationMinutes: z.literal(180),
    pricingRules: tierPrices,
  }).strict(),
  z.object({
    ...productCommon,
    productType: z.literal("day_pass_relax"),
    durationMinutes: z.literal(540),
    pricingRules: z.object({
      mon_thu: tierPrices,
      friday: tierPrices,
      weekend_holiday: tierPrices,
      holiday_dates: z.array(z.string().date()).max(100),
    }).strict(),
  }).strict(),
  z.object({
    ...productCommon,
    productType: z.literal("club_relax"),
    durationMinutes: z.number().int().min(1).max(1440),
    salesEnabled: z.literal(false),
    pricingRules: z.object({}).strict(),
  }).strict(),
]).superRefine((value, context) => {
  if (value.salesEnabled && !value.active) {
    context.addIssue({ code: "custom", message: "Activá el producto antes de habilitar ventas.", path: ["salesEnabled"] });
  }
  if (value.salesEnabled && (
    value.policyRules.rebookingHours === undefined
    || value.policyRules.lateCancellationCreditPercent === undefined
    || value.policyRules.noShowCreditPercent === undefined
  )) {
    context.addIssue({ code: "custom", message: "Completá la política antes de habilitar ventas.", path: ["policyRules"] });
  }
});

export const wellnessSlotInputSchema = z.object({
  id: uuidSchema.optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  capacityLimit: z.number().int().positive().max(500).nullable(),
  externalCapacityLimit: z.number().int().positive().max(500).nullable(),
  guestBuffer: z.number().int().min(0).max(500),
  salesEnabled: z.boolean(),
  status: z.enum(["open", "blocked"]),
  notes: optionalText(1000),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.endAt) <= Date.parse(value.startAt)) {
    context.addIssue({ code: "custom", message: "La franja debe finalizar después de comenzar.", path: ["endAt"] });
  }
  if (value.salesEnabled && (value.capacityLimit === null || value.externalCapacityLimit === null)) {
    context.addIssue({ code: "custom", message: "Configurá la capacidad antes de habilitar ventas.", path: ["salesEnabled"] });
  }
  if (value.capacityLimit !== null && value.externalCapacityLimit !== null
      && value.externalCapacityLimit + value.guestBuffer > value.capacityLimit) {
    context.addIssue({ code: "custom", message: "La capacidad externa más el resguardo supera el aforo total.", path: ["externalCapacityLimit"] });
  }
  const localWindow = `${wellnessLocalTime(value.startAt)}-${wellnessLocalTime(value.endAt)}`;
  if (wellnessLocalDate(value.startAt) !== wellnessLocalDate(value.endAt)
      || !["10:00-13:00", "14:00-17:00", "18:00-21:00"].includes(localWindow)) {
    context.addIssue({ code: "custom", message: "Usá una de las tres franjas operativas de Casa Albor.", path: ["startAt"] });
  }
});

export const wellnessBookingInputSchema = z.object({
  guestId: uuidSchema,
  productId: uuidSchema,
  startAt: z.string().datetime({ offset: true }),
  partySize: z.number().int().min(1).max(2),
  source: z.enum(["web", "whatsapp", "phone", "walk_in", "instagram", "referral", "admin", "other"]),
  paymentMethod: z.enum(["cash", "transfer", "mercado_pago", "card", "other"]),
  paymentReference: optionalText(200),
  paymentNote: optionalText(1000),
  notes: optionalText(4000),
}).strict();

export const wellnessBookingUpdateSchema = z.object({
  bookingId: uuidSchema,
  startAt: z.string().datetime({ offset: true }),
  partySize: z.number().int().min(1).max(2),
  notes: optionalText(4000),
}).strict();

export const wellnessTransitionSchema = z.object({
  bookingId: uuidSchema,
  action: z.enum(["check_in", "complete", "no_show", "cancel"]),
  reason: optionalText(500),
}).strict().superRefine((value, context) => {
  if (value.action === "cancel" && (value.reason?.trim().length ?? 0) < 2) {
    context.addIssue({ code: "custom", message: "Indicá el motivo de cancelación.", path: ["reason"] });
  }
});
