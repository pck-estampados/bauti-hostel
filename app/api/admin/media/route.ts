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
import {
  MediaValidationError,
  mediaUploadMetadataSchema,
  type MediaUploadFile,
} from "@/app/lib/media-validation";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

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

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function uploadFile(value: FormDataEntryValue | null): MediaUploadFile {
  if (!(value instanceof File) || !value.name) {
    throw new MediaValidationError("Seleccioná una imagen para cargar.");
  }
  return value;
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

    const form = await request.formData();
    const file = uploadFile(form.get("file"));
    const metadata = mediaUploadMetadataSchema.parse({
      altText: formString(form, "altText") ?? "",
      caption: formString(form, "caption") ?? null,
      category: formString(form, "category"),
      sortOrder: formString(form, "sortOrder") ?? "0",
      isPublished: formString(form, "isPublished") ?? "false",
      active: formString(form, "active") ?? "false",
      roomId: formString(form, "roomId") ?? null,
    });

    const asset = await context.service.upload(file, metadata);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
