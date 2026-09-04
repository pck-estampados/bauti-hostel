import { z } from "zod";

const date = z.iso.date();
export const lodgingRequestSchema = z.object({
  checkIn: date, checkOut: date,
  adults: z.coerce.number().int().min(1).max(30), children: z.coerce.number().int().min(0).max(29),
  category: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/).optional(),
}).strict().superRefine((value, ctx) => {
  const nights = (Date.parse(value.checkOut) - Date.parse(value.checkIn)) / 86_400_000;
  if (nights < 1 || nights > 60) ctx.addIssue({ code: "custom", message: "Elegí una estadía de 1 a 60 noches.", path: ["checkOut"] });
  if (value.adults + value.children > 30) ctx.addIssue({ code: "custom", message: "La ocupación total no puede superar 30 personas.", path: ["adults"] });
});
export const lodgingRateSchema = z.object({
  categoryId: z.uuid(), name: z.string().trim().min(2).max(100),
  kind: z.enum(["day", "promotion", "override"]), dayKind: z.enum(["normal", "holiday", "special", "any"]),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((days) => new Set(days).size === days.length),
  validFrom: date, validUntil: z.union([date, z.literal("")]),
  amount: z.coerce.number().positive().max(9_999_999_999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, "Usá hasta dos decimales."),
  minimumStay: z.coerce.number().int().min(1).max(60), conditions: z.string().trim().max(500),
  active: z.boolean(), salesEnabled: z.boolean(),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (v.validUntil && v.validUntil < v.validFrom) fail("La vigencia final no puede ser anterior al inicio.");
  if (v.kind === "promotion" && (!v.validUntil || v.conditions.length < 2)) fail("La promoción necesita fecha final y condiciones explícitas.");
  if (v.kind === "override" && v.validFrom !== v.validUntil) fail("El override debe corresponder a una sola fecha.");
  if (v.kind === "day" && v.dayKind === "any") fail("La regla diaria necesita un tipo de día concreto.");
  if (v.salesEnabled && !v.active) fail("Una regla inactiva no puede habilitar ventas.");
});
export const specialDateSchema = z.object({ date, kind: z.enum(["HOLIDAY", "SPECIAL", "NORMAL_OVERRIDE"]), name: z.string().trim().min(2).max(100), active: z.boolean() }).strict();
export const holdSettingsSchema = z.object({ webMinutes: z.coerce.number().int().min(1).max(120), adminMinutes: z.coerce.number().int().min(1).max(120) }).strict();
export const sourceSchema = z.enum(["web", "whatsapp", "phone", "walk_in", "instagram", "referral", "admin", "other"]);
export const holdInputSchema = z.object({ request: lodgingRequestSchema, source: sourceSchema.default("web"), minutes: z.number().int().min(1).max(120).optional() }).strict();
export type LodgingRequest = z.infer<typeof lodgingRequestSchema>;
export type LodgingRateInput = z.infer<typeof lodgingRateSchema>;
export type HoldSettings = z.infer<typeof holdSettingsSchema>;
export type LodgingCategory = { id: string; code: string; name: string; capacity: number; active: boolean; salesEnabled: boolean };
export type LodgingRate = {
  id: string; category_id: string; name: string; kind: LodgingRateInput["kind"]; day_kind: LodgingRateInput["dayKind"];
  weekdays: number[]; valid_from: string; valid_until: string | null; amount: number; currency: "ARS";
  minimum_stay: number; conditions: string; active: boolean; sales_enabled: boolean; version: number;
};
export type NightlyQuote = { date: string; category: string; rate_source: "day" | "promotion" | "override" | "NO_RATE"; base_amount: number | null; adjustment: string | null; final_amount: number | null; currency: "ARS"; rule_id: string | null; rule_version: number | null };
export type LodgingQuote = { version: number; quoted_at: string; category: string; check_in: string; check_out: string; adults: number; children: number; currency: "ARS"; complete: boolean; total: number | null; minimum_stay: number; nights: NightlyQuote[]; reasons: string[] };
export type LodgingAvailability = { category: string; public_name: string; capacity: number; available: boolean; eligible_room_count: number; quote: LodgingQuote; reasons: string[] };
export type LodgingHold = { id: string; status: string; expiresAt: string; quote: LodgingQuote };
export type LodgingSnapshot = { categories: LodgingCategory[]; rates: LodgingRate[]; specialDates: Array<{ date: string; name: string; kind: z.infer<typeof specialDateSchema>["kind"]; active: boolean }>; holdSettings: HoldSettings; schemaReady: boolean };
export type AdminLodgingAvailability = { categories: LodgingAvailability[]; rooms: Array<{ id: string; code: string; name: string; category: string; state: string }>; holds: Array<{ id: string; category: string; checkIn: string; checkOut: string; source: string; status: string; expiresAt: string }> };
export const emptyLodgingSnapshot = (): LodgingSnapshot => ({ categories: [], rates: [], specialDates: [], holdSettings: { webMinutes: 15, adminMinutes: 120 }, schemaReady: false });
export const LODGING_REASONS: Record<string, string> = {
  NO_RATE: "Tarifa pendiente de configuración para una o más noches.", NO_ROOMS: "Sin habitaciones disponibles para ese rango.",
  MINIMUM_STAY: "La estadía no cumple el mínimo configurado.", CAPACITY_EXCEEDED: "La ocupación supera la capacidad.",
  CATEGORY_DISABLED: "Categoría sin venta habilitada.", INACTIVE: "Habitación inactiva", INVENTORY_INCOMPLETE: "Camas o capacidad incompletas",
  NOT_SELLABLE: "Estado operativo no vendible", RESERVED: "Reservada", BLOCKED: "Bloqueada", HELD: "Hold vigente", AVAILABLE: "Disponible",
};
export const lodgingMoney = (amount: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(amount);
export function lodgingRpcArgs(input: LodgingRequest) {
  return { p_check_in: input.checkIn, p_check_out: input.checkOut, p_adults: input.adults, p_children: input.children, p_category: input.category ?? null };
}
export function lodgingRequestOrigin(request: Pick<Request, "headers" | "url">): URL | null {
  try {
    const origin = request.headers.get("origin");
    if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return null;
    const parsed = new URL(origin);
    // Next may normalize request.url to its internal listening hostname. Host is
    // the browser-facing authority; never trust an arbitrary forwarded host here.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (parsed.origin !== origin || parsed.host !== host) return null;
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) return null;
    return parsed;
  } catch { return null; }
}
export function lodgingError(code?: string, message?: string): { status: number; message: string } {
  if (code === "42501") return { status: 403, message: "No tenés permiso o el hold no está disponible para esta sesión." };
  if (message === "RATE_LIMITED") return { status: 429, message: "Alcanzaste el límite temporal de consultas. Intentá nuevamente en un minuto." };
  if (code === "23P01" || code === "40001" || code === "40P01") return { status: 409, message: "La disponibilidad cambió. Volvé a consultar antes de continuar." };
  if (message === "AMBIGUOUS_RATE") return { status: 422, message: "La regla se superpone con otra activa del mismo nivel. Ajustá las fechas o deshabilitá la anterior." };
  if (message === "ACTIVE_HOLD_EXISTS") return { status: 409, message: "Esta sesión ya tiene un hold vigente. Cancelalo o esperá su vencimiento." };
  if (message === "NOT_QUOTABLE") return { status: 422, message: "La categoría, capacidad o tarifa no permite cotizar esta estadía." };
  if (code?.startsWith("22") || code?.startsWith("23")) return { status: 422, message: "Revisá fechas, capacidad, vigencia y condiciones. No se guardaron cambios." };
  return { status: 503, message: "No podemos consultar el alojamiento en este momento. Intentá nuevamente más tarde." };
}
