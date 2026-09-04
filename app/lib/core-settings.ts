import { z } from "zod";

// Handoff V1.27: confirmed values only. Unknown contacts and end times stay empty.
export const CORE_GENERAL = {
  name: "Casa Albor", descriptor: "Casa boutique · Estadías & Experiencias",
  address: "Uruguayana 235", city: "Ezeiza", province: "Buenos Aires", country: "Argentina",
  phone: "", whatsapp: "", email: "", website: "",
};
export const CORE_SCHEDULES = {
  checkInFrom: "15:00", checkInUntil: "", checkOutUntil: "11:00",
  courtesyCheckoutUntil: "12:00", courtesyRequiresApproval: true as const,
  breakfastFrom: "08:00", breakfastUntil: "10:00",
  quietHoursFrom: "23:00", quietHoursUntil: "08:00",
};
export const CORE_POLICIES = {
  cancellation: "", minors: "Los menores deben alojarse acompañados por una persona adulta responsable.",
  pets: "No se admiten mascotas de huéspedes ni visitantes." as const,
  guestPetsAllowed: false as const, residentPetsDisclosure: "",
  smoking: "No está permitido fumar en interiores.",
  quietHours: "Durante el horario de descanso deben evitarse ruidos que molesten a otros huéspedes.",
};
const text = (max: number) => z.string().trim().max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingresá un horario válido.");
export const generalSettingsSchema = z.object({
  name: text(120).min(2).refine((v) => !/hostel bauti|bauti hostel/i.test(v), "Utilizá la marca vigente."),
  descriptor: text(240).min(2).refine((v) => !/hotel boutique/i.test(v), "La denominación oficial es Casa boutique."),
  phone: text(40), whatsapp: text(40), email: z.union([z.literal(""), text(160).email()]),
  address: text(180), city: text(100), province: text(100), country: text(100),
  website: z.union([z.literal(""), text(240).url().refine((v) => new URL(v).protocol === "https:", "Usá una URL HTTPS.")]),
});
export const scheduleSettingsSchema = z.object({
  checkInFrom: time, checkInUntil: z.union([z.literal(""), time]), checkOutUntil: time,
  courtesyCheckoutUntil: time, courtesyRequiresApproval: z.literal(true),
  breakfastFrom: time, breakfastUntil: time, quietHoursFrom: time, quietHoursUntil: time,
}).refine((v) => v.courtesyCheckoutUntil >= v.checkOutUntil, "La cortesía no puede finalizar antes del checkout.")
  .refine((v) => v.breakfastFrom < v.breakfastUntil, "Revisá el intervalo de desayuno.")
  .refine((v) => !v.checkInUntil || v.checkInUntil >= v.checkInFrom, "Revisá el intervalo de check-in.");
export const policySettingsSchema = z.object({
  cancellation: text(2000), minors: text(2000), pets: z.literal(CORE_POLICIES.pets),
  guestPetsAllowed: z.literal(false), residentPetsDisclosure: text(2000),
  smoking: text(2000), quietHours: text(2000),
});

export function checkInLabel(schedule: { checkInFrom: string; checkInUntil: string }) {
  return schedule.checkInUntil ? `${schedule.checkInFrom} a ${schedule.checkInUntil}` : `desde las ${schedule.checkInFrom}`;
}
export const ROLE_LABELS: Record<string, string> = {
  owner: "Gerencia / Super admin", admin: "Gerencia", housekeeping: "Limpieza",
  bar: "Barra (preparado)", reception: "Recepción (futuro)", maintenance: "Mantenimiento (fuera del MVP)",
};
