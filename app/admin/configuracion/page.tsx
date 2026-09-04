import { ConfigurationConsole } from "./configuration-console";
import { emptyConfigurationSnapshot } from "../data/configuration-types";
import { SupabaseConfigurationRepository } from "../data/supabase-configuration-repository";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { getAppMode } from "@/app/lib/config/env";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export default async function ConfigurationPage() {
  const mode = getAppMode();

  if (mode === "demo") {
    return (
      <ConfigurationConsole
        currentUser={{ id: "demo", displayName: "Recepción de prueba", roles: ["demo"], permissions: [] }}
        initialSnapshot={emptyConfigurationSnapshot()}
        mode="demo"
      />
    );
  }

  const currentUser = await requireStaffSession("/admin/configuracion");
  if (!currentUser.permissions.includes("settings.read")) {
    return <p role="status">Tu rol no tiene acceso a la configuración.</p>;
  }
  const repository = new SupabaseConfigurationRepository(await createSupabaseServerClient());
  const initialSnapshot = await repository.loadSnapshot();

  return (
    <ConfigurationConsole
      currentUser={currentUser}
      initialSnapshot={initialSnapshot}
      mode="production"
    />
  );
}
