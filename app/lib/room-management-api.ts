import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { RoomManagementError } from "@/app/admin/data/room-management-core";

export function roomManagementErrorResponse(error: unknown) {
  if (error instanceof RoomManagementError) {
    const statuses = {
      ROOM_UNAUTHENTICATED: 401,
      ROOM_FORBIDDEN: 403,
      ROOM_NOT_FOUND: 404,
      ROOM_TYPE_NOT_FOUND: 404,
      ROOM_TYPE_INACTIVE: 422,
      BED_NOT_FOUND: 404,
      ROOM_SERVICE_NOT_FOUND: 404,
      ROOM_SERVICE_INACTIVE: 422,
      ROOM_SERVICE_ASSIGNMENT_NOT_FOUND: 404,
      ROOM_INVALID_STATE: 422,
      ROOM_CONFLICT: 409,
      ROOM_OPERATION_FAILED: 500,
    } as const;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: statuses[error.code] },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Revisá los datos ingresados."
      : "El cuerpo de la solicitud no es válido.";
    return NextResponse.json(
      { error: message, code: "ROOM_VALIDATION_FAILED" },
      { status: 422 },
    );
  }
  if (error instanceof Error && error.message === "Solicitud no autorizada.") {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { error: "No fue posible completar la operación de habitaciones." },
    { status: 500 },
  );
}
