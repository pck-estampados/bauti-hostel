import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRoomManagementService } from "@/app/admin/data/room-management-core";
import { SupabaseRoomManagementRepository } from "@/app/admin/data/supabase-room-management-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { roomManagementErrorResponse } from "@/app/lib/room-management-api";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";

const statusRequestSchema = z.object({ status: z.string() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertProductionEnvironment();
    await assertSameOrigin();
    const staff = await getStaffSession();
    const repository = new SupabaseRoomManagementRepository(await createSupabaseServerClient());
    const service = createRoomManagementService(repository);
    const payload = statusRequestSchema.parse(await request.json());
    const room = await service.updateRoomStatus(staff, (await params).id, payload.status);
    return NextResponse.json({ room });
  } catch (error) {
    return roomManagementErrorResponse(error);
  }
}
