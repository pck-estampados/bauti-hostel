import { z } from "zod";

const required = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
const optional = (maximum: number) => z.string().trim().max(maximum);

export const managedRoomIdSchema = z.uuid("La habitación indicada no es válida.");
export const managedRoomTypeIdSchema = z.uuid("El tipo de habitación indicado no es válido.");
export const managedBedIdSchema = z.uuid("La cama indicada no es válida.");
export const managedRoomServiceIdSchema = z.uuid("El servicio indicado no es válido.");
export const managedRoomStatusSchema = z.enum([
  "available",
  "reserved",
  "occupied",
  "pending_cleaning",
  "cleaning",
  "clean",
  "ready",
  "maintenance",
  "blocked",
  "out_of_service",
]);

export const managedRoomCreateSchema = z.object({
  roomTypeId: managedRoomTypeIdSchema,
  code: required(1, 30),
  displayName: required(1, 100),
  capacity: z.coerce.number().int().min(1).max(30),
  sector: optional(100),
  internalNotes: optional(2_000),
  active: z.boolean(),
});

export const managedRoomUpdateSchema = managedRoomCreateSchema;

export const managedBedInputSchema = z.object({
  code: required(1, 40),
  bedType: z.enum(["single", "double", "bunk_single", "crib", "other"]),
  quantity: z.coerce.number().int().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(4),
  active: z.boolean(),
});

export const managedBedCreateSchema = managedBedInputSchema;
export const managedBedUpdateSchema = managedBedInputSchema;

export const managedRoomServiceAssignmentSchema = z.object({
  serviceId: managedRoomServiceIdSchema,
});

export const managedRoomTypeCreateSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/, "Usá minúsculas, números, guion o guion bajo."),
  internalName: required(2, 100),
  publicName: required(2, 120),
  description: optional(500),
  defaultCapacity: z.coerce.number().int().min(1).max(30),
  baseRate: z.coerce.number().positive().max(100_000_000).nullable(),
  active: z.boolean(),
});

export const managedRoomTypeUpdateSchema = managedRoomTypeCreateSchema;

export type ManagedRoomCreateInput = z.infer<typeof managedRoomCreateSchema>;
export type ManagedRoomUpdateInput = z.infer<typeof managedRoomUpdateSchema>;
export type ManagedBedCreateInput = z.infer<typeof managedBedCreateSchema>;
export type ManagedBedUpdateInput = z.infer<typeof managedBedUpdateSchema>;
export type ManagedRoomTypeCreateInput = z.infer<typeof managedRoomTypeCreateSchema>;
export type ManagedRoomTypeUpdateInput = z.infer<typeof managedRoomTypeUpdateSchema>;
