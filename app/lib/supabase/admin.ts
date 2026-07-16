import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "@/app/lib/config/env";

export function createSupabaseAdminClient() {
  const { url, secretKey } = getServerSupabaseConfig();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
