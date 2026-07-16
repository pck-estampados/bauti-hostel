import { z } from "zod";

const trimmed = (maximum: number) => z.string().trim().max(maximum);
const required = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingresá un horario válido.");
const uuid = z.string().uuid();

export const generalSettingsSchema = z.object({
  name: required(2, 120),
  phone: trimmed(40),
  whatsapp: trimmed(40),
  email: z.union([z.literal(""), z.string().trim().email().max(160)]),
  address: trimmed(180),
  city: trimmed(100),
  province: trimmed(100),
  website: z.union([z.literal(""), z.string().trim().url().max(240)]),
});

export const scheduleSettingsSchema = z.object({
  checkInFrom: time,
  checkInUntil: time,
  checkOutUntil: time,
  quietHoursFrom: time,
  quietHoursUntil: time,
});

export const priceSettingsSchema = z.object({
  amount: z.coerce.number().int().positive().max(100_000_000),
  currency: z.literal("ARS"),
});

export const policySettingsSchema = z.object({
  cancellation: trimmed(2_000),
  minors: trimmed(2_000),
  pets: trimmed(2_000),
  smoking: trimmed(2_000),
  quietHours: trimmed(2_000),
});

export const roomTypeInputSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/),
  name: required(2, 100),
  description: trimmed(500),
  defaultCapacity: z.coerce.number().int().min(1).max(30),
  active: z.boolean(),
});

export const roomInputSchema = z.object({
  id: uuid.optional(),
  roomTypeId: uuid.nullable(),
  code: required(1, 30),
  displayName: required(1, 100),
  capacity: z.coerce.number().int().min(1).max(30),
  active: z.boolean(),
});

export const bedInputSchema = z.object({
  id: uuid.optional(),
  roomId: uuid,
  code: required(1, 40),
  bedType: z.enum(["single", "double", "bunk_single", "crib", "other"]),
  capacity: z.coerce.number().int().min(1).max(4),
  active: z.boolean(),
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
  z.object({ operation: z.literal("createRoom"), payload: roomInputSchema.omit({ id: true }) }),
  z.object({ operation: z.literal("updateRoom"), payload: roomInputSchema.required({ id: true }) }),
  z.object({ operation: z.literal("createBed"), payload: bedInputSchema.omit({ id: true }) }),
  z.object({ operation: z.literal("updateBed"), payload: bedInputSchema.required({ id: true }) }),
  z.object({ operation: z.literal("saveUser"), payload: profileInputSchema }),
]);

export type ConfigurationOperation = z.infer<typeof configurationOperationSchema>;
