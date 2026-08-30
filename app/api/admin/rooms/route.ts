import { NextResponse, type NextRequest } from "next/server";
import { createRoomManagementService } from "@/app/admin/data/room-management-core";
import { SupabaseRoomManagementRepository } from "@/app/admin/data/supabase-room-management-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { roomManagementErrorResponse } from "@/app/lib/room-management-api";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";

async function requestContext() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  const repository = new SupabaseRoomManagementRepository(await createSupabaseServerClient());
  return { staff, service: createRoomManagementService(repository) };
}

export async function GET() {
  try {
    const context = await requestContext();
    return NextResponse.json({ state: await context.service.list(context.staff) });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    const room = await context.service.createRoom(context.staff, await request.json());
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
