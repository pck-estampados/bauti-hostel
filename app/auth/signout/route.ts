import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export async function POST(request: NextRequest) {
  await assertSameOrigin();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/acceso-interno", request.url), { status: 303 });
}
