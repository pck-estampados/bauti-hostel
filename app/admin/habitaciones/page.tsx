import { RoomManagementConsole } from "./room-management-console";
import { SupabaseRoomManagementRepository } from "@/app/admin/data/supabase-room-management-repository";
import { emptyRoomManagementSnapshot } from "@/app/admin/data/room-management-types";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { getAppMode } from "@/app/lib/config/env";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export default async function RoomsPage() {
  const mode = getAppMode();
  if (mode === "demo") {
    return (
      <RoomManagementConsole
        canManageRoomTypes={false}
        canManageRooms={false}
        canRead={false}
        initialError="La gestión real de habitaciones sólo está disponible en producción."
        initialSnapshot={emptyRoomManagementSnapshot()}
        mode="demo"
      />
    );
  }

  const staff = await requireStaffSession("/admin/habitaciones");
  const canRead = staff.permissions.includes("rooms.read");
  const canManageRoomTypes = staff.permissions.includes("rooms.inventory_manage");
  const canManageRooms = canManageRoomTypes && staff.permissions.includes("rooms.manage");
  let initialSnapshot = emptyRoomManagementSnapshot();
  let initialError = "";

  if (canRead) {
    try {
      initialSnapshot = await new SupabaseRoomManagementRepository(
        await createSupabaseServerClient(),
      ).loadSnapshot();
    } catch {
      initialError = "No fue posible cargar el inventario real. Volvé a intentar en unos minutos.";
    }
  }

  return (
    <RoomManagementConsole
      canManageRoomTypes={canManageRoomTypes}
      canManageRooms={canManageRooms}
      canRead={canRead}
      initialError={initialError}
      initialSnapshot={initialSnapshot}
      mode="production"
    />
  );
}
