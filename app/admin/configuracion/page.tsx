import { ConfigurationConsole } from "./configuration-console";
import { emptyConfigurationSnapshot } from "../data/configuration-types";
import { SupabaseConfigurationRepository } from "../data/supabase-configuration-repository";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { getAppMode } from "@/app/lib/config/env";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export default async function ConfigurationPage() {
  const mode = getAppMode();
  const fallbackPrice = Number(process.env.NEXT_PUBLIC_BASE_PRICE_ARS);

  if (mode === "demo") {
    return (
      <ConfigurationConsole
        currentUser={{ id: "demo", displayName: "Recepción de prueba", roles: ["demo"], permissions: [] }}
        fallbackBasePrice={Number.isFinite(fallbackPrice) ? fallbackPrice : null}
        initialSnapshot={emptyConfigurationSnapshot()}
        mode="demo"
      />
    );
  }

  const currentUser = await requireStaffSession("/admin/configuracion");
  const repository = new SupabaseConfigurationRepository(await createSupabaseServerClient());
  const initialSnapshot = await repository.loadSnapshot();

  return (
    <ConfigurationConsole
      currentUser={currentUser}
      fallbackBasePrice={Number.isFinite(fallbackPrice) ? fallbackPrice : null}
      initialSnapshot={initialSnapshot}
      mode="production"
    />
  );
}
