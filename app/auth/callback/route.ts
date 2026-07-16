import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/app/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  if (!code) return NextResponse.redirect(new URL("/acceso-interno?error=invalid_callback", request.url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/acceso-interno?error=invalid_session", request.url));

  return NextResponse.redirect(new URL(returnTo, request.url));
}
