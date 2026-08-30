import type { Metadata } from "next";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment, getAppMode } from "@/app/lib/config/env";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";
import { AdminShell } from "./components/admin-shell";
import { OperationsProvider } from "./components/operations-provider";
import { SupabaseOperationsRepository } from "./data/supabase-operations-repository";
import { createDemoOperationsState } from "./lib/demo-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const mode = getAppMode();

  if (mode === "demo") {
    const displayName = "Recepción de prueba";
    return (
      <OperationsProvider actor={displayName} mode="demo" initialState={createDemoOperationsState()} permissions={["reservations.read", "reservations.manage", "rooms.manage", "housekeeping.manage", "guests.manage", "payments.manage", "notes.manage"]}>
        <AdminShell mode="demo" userName={displayName} userRoles={["demo"]}>{children}</AdminShell>
      </OperationsProvider>
    );
  }

  assertProductionEnvironment();
  const user = await requireStaffSession("/admin");
  const repository = new SupabaseOperationsRepository(await createSupabaseServerClient());
  const initialState = await repository.loadSnapshot();

  return (
    <OperationsProvider actor={user.displayName} mode="production" initialState={initialState} permissions={user.permissions}>
      <AdminShell mode="production" userName={user.displayName} userRoles={user.roles}>{children}</AdminShell>
    </OperationsProvider>
  );
}
