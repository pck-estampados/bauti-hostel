import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { lodgingRequestSchema, lodgingRpcArgs } from "@/app/lib/lodging";
import { assertLodgingOrigin, assertLodgingResult, lodgingApiFailure, lodgingPublicClient } from "@/app/lib/lodging-server";

const cookieName = "albor_lodging_session";
export async function POST(request: Request) {
  try {
    assertLodgingOrigin(request);
    const input = lodgingRequestSchema.parse(await request.json());
    if (!input.category) throw new Error("Category required");
    const jar = await cookies();
    const existing = jar.get(cookieName)?.value;
    const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString("hex");
    const { data, error } = await lodgingPublicClient().rpc("create_lodging_hold", { ...lodgingRpcArgs(input), p_visitor_token: token, p_source: "web" });
    assertLodgingResult(error);
    jar.set(cookieName, token, { httpOnly: true, secure: request.headers.get("origin")?.startsWith("https:") === true, sameSite: "strict", path: "/api/lodging/holds", maxAge: 7200 });
    return Response.json(data, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return lodgingApiFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    assertLodgingOrigin(request);
    const input = z.object({ id: z.uuid() }).strict().parse(await request.json());
    const token = (await cookies()).get(cookieName)?.value;
    const { data, error } = await lodgingPublicClient().rpc("cancel_lodging_hold", { p_id: input.id, p_visitor_token: token ?? null });
    assertLodgingResult(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return lodgingApiFailure(error); }
}
