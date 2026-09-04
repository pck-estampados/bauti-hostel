import { z } from "zod";
import { generalSettingsSchema, scheduleSettingsSchema, policySettingsSchema } from "../../lib/core-settings.ts";
export { generalSettingsSchema, scheduleSettingsSchema, policySettingsSchema };

const trimmed = (maximum: number) => z.string().trim().max(maximum);
const required = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const uuid = z.string().uuid();

export const priceSettingsSchema = z.object({
  amount: z.coerce.number().int().positive().max(100_000_000),
  currency: z.literal("ARS"),
});

export const roomTypeInputSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/),
  internalName: required(2, 100),
  publicName: required(2, 120),
  description: trimmed(500),
  defaultCapacity: z.coerce.number().int().min(1).max(30),
  baseRate: z.coerce.number().positive().max(100_000_000),
  active: z.boolean(),
});

const roomStatusSchema = z.enum([
  "available", "reserved", "occupied", "pending_cleaning", "cleaning",
  "clean", "ready", "maintenance", "blocked", "out_of_service",
]);

export const roomInputSchema = z.object({
  id: uuid.optional(),
  roomTypeId: uuid.nullable(),
  code: required(1, 30),
  displayName: required(1, 100),
  capacity: z.coerce.number().int().min(1).max(30),
  status: roomStatusSchema,
  sector: trimmed(100),
  internalNotes: trimmed(2_000),
  active: z.boolean(),
});

export const bedInputSchema = z.object({
  id: uuid.optional(),
  roomId: uuid,
  code: required(1, 40),
  bedType: z.enum(["single", "double", "bunk_single", "crib", "other"]),
  quantity: z.coerce.number().int().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(4),
  active: z.boolean(),
});

export const roomServiceInputSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,49}$/),
  name: required(2, 100),
  description: trimmed(500),
  active: z.boolean(),
});

export const roomServiceAssignmentSchema = z.object({
  roomId: uuid,
  serviceIds: z.array(uuid).max(50),
});

export const profileInputSchema = z.object({
  userId: uuid,
  displayName: required(1, 120),
  phone: trimmed(40),
  status: z.enum(["pending", "active", "disabled"]),
  roleIds: z.array(uuid).min(1, "Cada usuario interno debe conservar al menos un rol.").max(10),
});

export const configurationOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("updateGeneral"), payload: generalSettingsSchema }),
  z.object({ operation: z.literal("updateSchedules"), payload: scheduleSettingsSchema }),
  z.object({ operation: z.literal("updatePrice"), payload: priceSettingsSchema }),
  z.object({ operation: z.literal("updatePolicies"), payload: policySettingsSchema }),
  z.object({ operation: z.literal("createRoomType"), payload: roomTypeInputSchema.omit({ id: true }) }),
  z.object({ operation: z.literal("updateRoomType"), payload: roomTypeInputSchema.required({ id: true }) }),
  z.object({ operation: z.literal("createRoom"), payload: roomInputSchema.omit({ id: true }).extend({ status: z.literal("out_of_service") }) }),
  z.object({ operation: z.literal("updateRoom"), payload: roomInputSchema.required({ id: true }) }),
  z.object({ operation: z.literal("createBed"), payload: bedInputSchema.omit({ id: true }) }),
  z.object({ operation: z.literal("updateBed"), payload: bedInputSchema.required({ id: true }) }),
  z.object({ operation: z.literal("createRoomService"), payload: roomServiceInputSchema }),
  z.object({ operation: z.literal("saveRoomServices"), payload: roomServiceAssignmentSchema }),
  z.object({ operation: z.literal("saveUser"), payload: profileInputSchema }),
]);

export type ConfigurationOperation = z.infer<typeof configurationOperationSchema>;
