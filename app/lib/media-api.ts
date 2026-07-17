import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MediaAssetNotFoundError,
  MediaSchemaNotReadyError,
} from "@/app/admin/data/supabase-media-repository";
import type { StaffSession } from "@/app/lib/auth/staff-session";
import { MediaOperationError } from "@/app/lib/media-service-core";
import { MediaValidationError } from "@/app/lib/media-validation";

export class MediaAuthorizationError extends Error {
  constructor() {
    super("No tenés permisos para administrar la galería.");
    this.name = "MediaAuthorizationError";
  }
}

export function requireMediaPermissions(staff: StaffSession, ...permissions: string[]) {
  if (permissions.some((permission) => !staff.permissions.includes(permission))) {
    throw new MediaAuthorizationError();
  }
}

export function mediaErrorResponse(error: unknown) {
  if (error instanceof MediaAuthorizationError || (
    error instanceof Error && error.message === "Solicitud no autorizada."
  )) {
    return NextResponse.json({ error: "Solicitud no autorizada." }, { status: 403 });
  }
  if (error instanceof MediaSchemaNotReadyError) {
    return NextResponse.json(
      { error: error.message, code: "MEDIA_SCHEMA_NOT_READY" },
      { status: 409 },
    );
  }
  if (
    error instanceof MediaValidationError ||
    error instanceof MediaAssetNotFoundError ||
    error instanceof z.ZodError
  ) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Revisá los datos ingresados."
      : error.message;
    return NextResponse.json(
      { error: message, code: "MEDIA_VALIDATION_FAILED" },
      { status: 422 },
    );
  }
  if (error instanceof MediaOperationError) {
    return NextResponse.json(
      { error: error.message, code: error.code, partial: error.partial },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { error: "No fue posible completar la operación de galería." },
    { status: 500 },
  );
}
