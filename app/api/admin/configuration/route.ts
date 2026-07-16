import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SupabaseConfigurationRepository } from "@/app/admin/data/supabase-configuration-repository";
import { configurationOperationSchema } from "@/app/admin/data/configuration-validation";
import { getStaffSession, type StaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

class AuthorizationError extends Error {}

function requirePermissions(staff: StaffSession, ...permissions: string[]) {
  const missing = permissions.filter((permission) => !staff.permissions.includes(permission));
  if (missing.length) throw new AuthorizationError("No tenés permisos para realizar esta operación.");
}

async function requestContext() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  if (!staff) return null;
  return {
    staff,
    repository: new SupabaseConfigurationRepository(await createSupabaseServerClient()),
  };
}

export async function GET() {
  try {
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    requirePermissions(context.staff, "settings.read");
    return NextResponse.json({ state: await context.repository.loadSnapshot() });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 400;
    const message = error instanceof Error ? error.message : "No fue posible cargar la configuración.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

    const operation = configurationOperationSchema.parse(await request.json());
    const { staff, repository } = context;

    switch (operation.operation) {
      case "updateGeneral":
        requirePermissions(staff, "settings.manage");
        await repository.saveGeneral(operation.payload, staff.id);
        break;
      case "updateSchedules":
        requirePermissions(staff, "settings.manage");
        await repository.saveSchedules(operation.payload, staff.id);
        break;
      case "updatePrice":
        requirePermissions(staff, "settings.manage");
        await repository.savePrice(operation.payload, staff.id);
        break;
      case "updatePolicies":
        requirePermissions(staff, "settings.manage");
        await repository.savePolicies(operation.payload, staff.id);
        break;
      case "createRoomType":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.createRoomType(operation.payload);
        break;
      case "updateRoomType":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.updateRoomType(operation.payload);
        break;
      case "createRoom":
        requirePermissions(staff, "rooms.inventory_manage", "rooms.manage");
        await repository.createRoom(operation.payload);
        break;
      case "updateRoom":
        requirePermissions(staff, "rooms.inventory_manage", "rooms.manage");
        await repository.updateRoom(operation.payload);
        break;
      case "createBed":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.createBed(operation.payload);
        break;
      case "updateBed":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.updateBed(operation.payload);
        break;
      case "createRoomService":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.createRoomService(operation.payload);
        break;
      case "saveRoomServices":
        requirePermissions(staff, "rooms.inventory_manage");
        await repository.saveRoomServices(operation.payload);
        break;
      case "saveUser":
        requirePermissions(staff, "staff.manage", "rbac.manage");
        await repository.saveUser(operation.payload, { id: staff.id, roles: staff.roles });
        break;
    }

    return NextResponse.json({ state: await repository.loadSnapshot() });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 400;
    const message = error instanceof z.ZodError
      ? "Revisá los datos ingresados."
      : error instanceof Error
        ? error.message
        : "No fue posible completar la operación.";
    return NextResponse.json({ error: message }, { status });
  }
}
