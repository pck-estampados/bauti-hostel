import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";
import { AdminPageHeader, EmptyState } from "../components/ui";
import { CleaningConsole, type CleaningRoom } from "./cleaning-console";

export default async function CleaningPage() {
  const staff = await requireStaffSession("/admin/limpieza");
  if (!staff.permissions.includes("housekeeping.read")) return <p role="status">Tu rol no tiene acceso a limpieza.</p>;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_housekeeping_room_state");
  return <>
    <AdminPageHeader eyebrow="Operación esencial" title="Limpieza" description="Estado de habitaciones e instrucciones de limpieza. Sin datos personales ni financieros." />
    {error ? <p role="alert">No se pudo cargar la vista de limpieza. Volvé a intentarlo.</p>
      : !data?.length ? <EmptyState title="Sin habitaciones configuradas" description="Gerencia debe completar el inventario antes de operar." />
        : <CleaningConsole rooms={data as CleaningRoom[]} canManage={staff.permissions.includes("housekeeping.manage")} />}
  </>;
}
