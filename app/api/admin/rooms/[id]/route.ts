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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    const room = await context.service.updateRoom(
      context.staff,
      (await params).id,
      await request.json(),
    );
    return NextResponse.json({ room });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    const room = await context.service.deactivateRoom(context.staff, (await params).id);
    return NextResponse.json({ room, deactivated: true });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
