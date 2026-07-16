import { NextResponse } from "next/server";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";

export async function GET() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "El perfil no está activo o no tiene un rol interno." }, { status: 403 });
  }

  return NextResponse.json({
    user: {
      displayName: staff.displayName,
      roles: staff.roles,
      permissions: staff.permissions,
    },
  });
}
