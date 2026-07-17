import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  SupabaseMediaRepository,
  SupabaseMediaStorage,
} from "@/app/admin/data/supabase-media-repository";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { mediaErrorResponse, requireMediaPermissions } from "@/app/lib/media-api";
import { createMediaService } from "@/app/lib/media-service-core";
import { mediaUpdateSchema } from "@/app/lib/media-validation";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const idSchema = z.uuid();

async function requestContext() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  if (!staff) return null;
  const client = await createSupabaseServerClient();
  const repository = new SupabaseMediaRepository(client);
  return {
    staff,
    service: createMediaService({ repository, storage: new SupabaseMediaStorage(client) }),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    requireMediaPermissions(context.staff, "media.read", "media.manage");
    const id = idSchema.parse((await params).id);
    const patch = mediaUpdateSchema.parse(await request.json());
    return NextResponse.json({ asset: await context.service.update(id, patch) });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const context = await requestContext();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    requireMediaPermissions(context.staff, "media.read", "media.manage");
    const id = idSchema.parse((await params).id);
    await context.service.remove(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
