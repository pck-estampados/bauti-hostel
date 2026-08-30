import { NextResponse, type NextRequest } from "next/server";
import {
  createRoomManagementService,
  requireRoomPermissions,
} from "@/app/admin/data/room-management-core";
import { SupabaseRoomManagementRepository } from "@/app/admin/data/supabase-room-management-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { roomManagementErrorResponse } from "@/app/lib/room-management-api";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";

async function requestContext() {
  assertProductionEnvironment();
  await assertSameOrigin();
  const staff = await getStaffSession();
  requireRoomPermissions(staff, "rooms.inventory_manage");
  const repository = new SupabaseRoomManagementRepository(await createSupabaseServerClient());
  return { staff, service: createRoomManagementService(repository) };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bedId: string }> },
) {
  try {
    const context = await requestContext();
    const identifiers = await params;
    const bed = await context.service.updateBed(
      context.staff,
      identifiers.id,
      identifiers.bedId,
      await request.json(),
    );
    return NextResponse.json({ bed });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; bedId: string }> },
) {
  try {
    const context = await requestContext();
    const identifiers = await params;
    const bed = await context.service.deactivateBed(
      context.staff,
      identifiers.id,
      identifiers.bedId,
    );
    return NextResponse.json({ bed, deactivated: true });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
