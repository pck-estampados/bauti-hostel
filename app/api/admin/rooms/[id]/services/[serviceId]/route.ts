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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  try {
    assertProductionEnvironment();
    await assertSameOrigin();
    const staff = await getStaffSession();
    requireRoomPermissions(staff, "rooms.inventory_manage");
    const repository = new SupabaseRoomManagementRepository(
      await createSupabaseServerClient(),
    );
    const service = createRoomManagementService(repository);
    const identifiers = await params;
    await service.removeRoomService(staff, identifiers.id, identifiers.serviceId);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
