import { NextResponse, type NextRequest } from "next/server";
import { createRoomManagementService } from "@/app/admin/data/room-management-core";
import { SupabaseRoomManagementRepository } from "@/app/admin/data/supabase-room-management-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { roomManagementErrorResponse } from "@/app/lib/room-management-api";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertProductionEnvironment();
    await assertSameOrigin();
    const staff = await getStaffSession();
    const repository = new SupabaseRoomManagementRepository(await createSupabaseServerClient());
    const service = createRoomManagementService(repository);
    const roomType = await service.createRoomType(staff, await request.json());
    return NextResponse.json({ roomType }, { status: 201 });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
