import { z } from "zod";
import { holdInputSchema, holdSettingsSchema, lodgingRateSchema, lodgingRequestSchema, lodgingRpcArgs, specialDateSchema } from "@/app/lib/lodging";
import { assertLodgingOrigin, assertLodgingResult, lodgingAdminSnapshot, lodgingApiFailure, lodgingStaff } from "@/app/lib/lodging-server";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has("checkIn")) return Response.json(await lodgingAdminSnapshot(), { headers: { "Cache-Control": "no-store" } });
    const client = await lodgingStaff("availability.read");
    const input = lodgingRequestSchema.parse(Object.fromEntries(params));
    const result = await client.rpc("get_lodging_admin_availability", lodgingRpcArgs(input));
    assertLodgingResult(result.error);
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return lodgingApiFailure(error); }
}
export async function POST(request: Request) {
  try {
    assertLodgingOrigin(request);
    const envelope = z.object({ action: z.enum(["rate", "specialDate", "settings", "categorySales", "hold", "cancelHold", "block"]), id: z.uuid().nullable().optional(), input: z.unknown() }).strict().parse(await request.json());
    const permission = ["hold", "cancelHold"].includes(envelope.action) ? "availability.manage" : envelope.action === "block" ? "rooms.inventory_manage" : "rates.manage";
    const client = await lodgingStaff(permission);
    let result;
    switch (envelope.action) {
      case "rate": result = await client.rpc("save_lodging_rate", { p_id: envelope.id ?? null, p_payload: lodgingRateSchema.parse(envelope.input) }); break;
      case "specialDate": {
        const value = specialDateSchema.parse(envelope.input);
        result = await client.rpc("save_lodging_special_date", { p_date: value.date, p_kind: value.kind, p_name: value.name, p_active: value.active }); break;
      }
      case "settings": {
        const value = holdSettingsSchema.parse(envelope.input);
        result = await client.rpc("save_lodging_hold_settings", { p_web_minutes: value.webMinutes, p_admin_minutes: value.adminMinutes }); break;
      }
      case "categorySales": {
        const value = z.object({ categoryId: z.uuid(), enabled: z.boolean() }).strict().parse(envelope.input);
        result = await client.rpc("set_lodging_category_sales", { p_category: value.categoryId, p_enabled: value.enabled }); break;
      }
      case "hold": {
        const value = holdInputSchema.parse(envelope.input);
        if (!value.request.category) throw new Error("Category required");
        result = await client.rpc("create_lodging_hold", { ...lodgingRpcArgs(value.request), p_source: value.source, p_minutes: value.minutes ?? null }); break;
      }
      case "cancelHold": result = await client.rpc("cancel_lodging_hold", { p_id: z.uuid().parse(envelope.id) }); break;
      case "block": {
        const value = z.object({ roomId: z.uuid(), checkIn: z.iso.date(), checkOut: z.iso.date(), reason: z.string().trim().min(2).max(500) }).strict().parse(envelope.input);
        result = await client.rpc("save_lodging_block", { p_room: value.roomId, p_check_in: value.checkIn, p_check_out: value.checkOut, p_reason: value.reason }); break;
      }
    }
    assertLodgingResult(result.error);
    return Response.json({ result: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return lodgingApiFailure(error); }
}
