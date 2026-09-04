import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getAppMode, getPublicSupabaseConfig } from "./config/env";
import { getStaffSession } from "./auth/staff-session";
import { createSupabaseServerClient } from "./supabase/server";
import { emptyLodgingSnapshot, lodgingError, lodgingRequestOrigin, lodgingRequestSchema, lodgingRpcArgs, type LodgingAvailability, type LodgingRequest, type LodgingSnapshot } from "./lodging";

export function lodgingPublicClient() {
  if (getAppMode() !== "production") throw new Error("LODGING_UNCONFIGURED");
  const config = getPublicSupabaseConfig();
  return createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(8000) }) } });
}
export async function publicLodgingAvailability(input: LodgingRequest): Promise<{ categories: LodgingAvailability[]; ready: boolean }> {
  try {
    const request = lodgingRequestSchema.parse(input);
    const { data, error } = await lodgingPublicClient().rpc("get_lodging_availability", lodgingRpcArgs(request));
    if (error) return { categories: [], ready: false };
    return { categories: data ?? [], ready: true };
  } catch { return { categories: [], ready: false }; }
}
export async function lodgingStaff(permission: string) {
  if (getAppMode() !== "production") throw Object.assign(new Error("Disponible sólo con Supabase configurado."), { status: 409 });
  const staff = await getStaffSession();
  if (!staff) throw Object.assign(new Error("Necesitás iniciar sesión."), { status: 401 });
  if (!staff.permissions.includes(permission)) throw Object.assign(new Error("Tu rol no tiene permiso para esta operación."), { status: 403 });
  return createSupabaseServerClient();
}
export async function lodgingAdminSnapshot(): Promise<LodgingSnapshot> {
  const client = await lodgingStaff("rates.read");
  const { data, error } = await client.rpc("get_lodging_admin_snapshot");
  if (error) return emptyLodgingSnapshot();
  return { ...data, schemaReady: true } as LodgingSnapshot;
}
export function assertLodgingResult(error: { code?: string; message?: string } | null) {
  if (error) { const safe = lodgingError(error.code, error.message); throw Object.assign(new Error(safe.message), { status: safe.status }); }
}
export function lodgingApiFailure(error: unknown) {
  const safe = error instanceof Error && "status" in error && typeof error.status === "number";
  return Response.json({ error: safe ? error.message : "No se pudo completar la operación. Revisá los datos e intentá nuevamente." }, { status: safe ? error.status as number : 422, headers: { "Cache-Control": "no-store" } });
}
export function assertLodgingOrigin(request: Request) {
  // All mutations require an explicit same-origin browser request; no wildcard CORS.
  if (!lodgingRequestOrigin(request)) {
    throw Object.assign(new Error("Origen no permitido."), { status: 403 });
  }
}
