import { NextResponse, type NextRequest } from "next/server";
import {
  SupabaseMediaRepository,
  SupabaseMediaStorage,
} from "@/app/admin/data/supabase-media-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import {
  mediaErrorResponse,
  requireMediaPermissions,
} from "@/app/lib/media-api";
import { createMediaService } from "@/app/lib/media-service-core";
import { mediaUploadRequestSchema } from "@/app/lib/media-validation";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";

async function requestContext() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  if (!staff) return null;
  const client = await createSupabaseServerClient();
  const repository = new SupabaseMediaRepository(client);
  return {
    staff,
    repository,
    service: createMediaService({
      repository,
      storage: new SupabaseMediaStorage(client),
    }),
  };
}

export async function GET() {
  try {
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    requireMediaPermissions(context.staff, "media.read");
    return NextResponse.json({ state: await context.repository.loadSnapshot() });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    requireMediaPermissions(context.staff, "media.read", "media.manage");

    const payload = mediaUploadRequestSchema.parse(await request.json());
    const upload = await context.service.prepareUpload(payload.file, payload.metadata);
    return NextResponse.json({ upload }, { status: 201 });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
