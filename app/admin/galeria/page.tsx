import { MediaConsole } from "./media-console";
import { SupabaseMediaRepository } from "@/app/admin/data/supabase-media-repository";
import { requireStaffSession } from "@/app/lib/auth/staff-session";
import { getAppMode } from "@/app/lib/config/env";
import type { MediaSnapshot } from "@/app/lib/media-types";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const EMPTY_SNAPSHOT: MediaSnapshot = { schemaReady: false, assets: [], rooms: [] };

export default async function AdminGalleryPage() {
  if (getAppMode() === "demo") {
    return (
      <MediaConsole
        initialSnapshot={EMPTY_SNAPSHOT}
        canRead={false}
        canManage={false}
        mode="demo"
      />
    );
  }

  const staff = await requireStaffSession("/admin/galeria");
  const repository = new SupabaseMediaRepository(await createSupabaseServerClient());
  const initialSnapshot = await repository.loadSnapshot();

  return (
    <MediaConsole
      initialSnapshot={initialSnapshot}
      canRead={staff.permissions.includes("media.read")}
      canManage={staff.permissions.includes("media.manage")}
      mode="production"
    />
  );
}
