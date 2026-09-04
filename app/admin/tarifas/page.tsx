import { AdminPageHeader } from "../components/ui";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { getAppMode } from "@/app/lib/config/env";
import { emptyLodgingSnapshot } from "@/app/lib/lodging";
import { lodgingAdminSnapshot } from "@/app/lib/lodging-server";
import { RatesConsole } from "./rates-console";

export default async function RatesPage() {
  if (getAppMode() === "demo") return <RatesConsole initial={emptyLodgingSnapshot()} canManage={false} />;
  const staff = await requireStaffSession("/admin/tarifas");
  if (!staff.permissions.includes("rates.read")) return <><AdminPageHeader eyebrow="Gerencia" title="Tarifas" description="Reglas de alojamiento." /><p role="status">Tu rol no tiene acceso a las tarifas.</p></>;
  return <RatesConsole initial={await lodgingAdminSnapshot()} canManage={staff.permissions.includes("rates.manage")} />;
}
