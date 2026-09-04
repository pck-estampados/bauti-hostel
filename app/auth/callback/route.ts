import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/app/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const isRecovery = request.nextUrl.searchParams.get("flow") === "recovery";
  const returnTo = isRecovery
    ? "/actualizar-clave?recovery=1"
    : safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  if (!code) {
    const destination = isRecovery
      ? "/recuperar-acceso?error=invalid_or_expired"
      : "/acceso-interno?error=invalid_callback";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const destination = isRecovery
      ? "/recuperar-acceso?error=invalid_or_expired"
      : "/acceso-interno?error=invalid_session";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.redirect(new URL(returnTo, request.url));
}
