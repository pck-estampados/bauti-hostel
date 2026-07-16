import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/app/lib/config/env";

export async function refreshSupabaseSession(request: NextRequest) {
  const { url, publishableKey } = getPublicSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(responseHeaders)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // Validates the JWT and refreshes it when needed. Do not replace with
  // getSession(), which only reads untrusted cookie storage.
  await supabase.auth.getClaims();
  return response;
}
