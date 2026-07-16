import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/app/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (process.env.APP_MODE !== "production") return NextResponse.next({ request });
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
