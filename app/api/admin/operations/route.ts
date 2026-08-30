import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SupabaseOperationsRepository } from "@/app/admin/data/supabase-operations-repository";
import {
  cancelReservationInputSchema,
  guestInputSchema,
  guestUpdateInputSchema,
  noteInputSchema,
  paymentInputSchema,
  reservationInputSchema,
  reservationUpdateInputSchema,
  roomStatusInputSchema,
  uuidSchema,
  walkInInputSchema,
} from "@/app/admin/data/validation";
import { OperationsError } from "@/app/admin/data/operations-error";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const operationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("addGuest"), payload: guestInputSchema }),
  z.object({ operation: z.literal("updateGuest"), payload: guestUpdateInputSchema }),
  z.object({ operation: z.literal("createWalkIn"), payload: walkInInputSchema }),
  z.object({ operation: z.literal("createReservation"), payload: reservationInputSchema }),
  z.object({ operation: z.literal("updateReservation"), payload: reservationUpdateInputSchema }),
  z.object({ operation: z.literal("cancelReservation"), payload: cancelReservationInputSchema }),
  z.object({ operation: z.literal("checkIn"), payload: z.object({ reservationId: uuidSchema }) }),
  z.object({ operation: z.literal("checkOut"), payload: z.object({ reservationId: uuidSchema }) }),
  z.object({ operation: z.literal("registerPayment"), payload: paymentInputSchema }),
  z.object({ operation: z.literal("addNote"), payload: noteInputSchema }),
  z.object({ operation: z.literal("changeRoomStatus"), payload: roomStatusInputSchema }),
]);

async function repositoryForRequest() {
  assertProductionEnvironment();
  const staff = await getStaffSession();
  if (!staff) return null;
  return {
    staff,
    repository: new SupabaseOperationsRepository(await createSupabaseServerClient()),
  };
}

export async function GET() {
  const context = await repositoryForRequest();
  if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (!context.staff.permissions.includes("reservations.read")) {
    return NextResponse.json({ error: "No tenés permiso para consultar la operación." }, { status: 403 });
  }
  return NextResponse.json({ state: await context.repository.loadSnapshot() });
}

const operationPermissions: Record<z.infer<typeof operationSchema>["operation"], string> = {
  addGuest: "guests.manage",
  updateGuest: "guests.manage",
  createWalkIn: "reservations.manage",
  createReservation: "reservations.manage",
  updateReservation: "reservations.manage",
  cancelReservation: "reservations.manage",
  checkIn: "reservations.manage",
  checkOut: "reservations.manage",
  registerPayment: "payments.manage",
  addNote: "notes.manage",
  changeRoomStatus: "rooms.manage",
};

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const context = await repositoryForRequest();
    if (!context) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

    const operation = operationSchema.parse(await request.json());
    const requiredPermission = operationPermissions[operation.operation];
    if (!context.staff.permissions.includes(requiredPermission)) {
      return NextResponse.json({ error: "No tenés permiso para realizar esta operación." }, { status: 403 });
    }
    const repository = context.repository;
    let state;
    switch (operation.operation) {
      case "addGuest": state = await repository.addGuest(operation.payload); break;
      case "updateGuest": {
        const { guestId, ...guest } = operation.payload;
        state = await repository.updateGuest(guestId, guest);
        break;
      }
      case "createWalkIn": state = await repository.createWalkIn(operation.payload); break;
      case "createReservation": state = await repository.createReservation(operation.payload); break;
      case "updateReservation": state = await repository.updateReservation(operation.payload); break;
      case "cancelReservation": state = await repository.cancelReservation(operation.payload.reservationId, operation.payload.reason); break;
      case "checkIn": state = await repository.checkIn(operation.payload.reservationId); break;
      case "checkOut": state = await repository.checkOut(operation.payload.reservationId); break;
      case "registerPayment": state = await repository.registerPayment(operation.payload); break;
      case "addNote": state = await repository.addNote(operation.payload); break;
      case "changeRoomStatus": state = await repository.changeRoomStatus(operation.payload.roomId, operation.payload.status, operation.payload.reason); break;
    }
    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Revisá los datos ingresados." }, { status: 422 });
    }
    if (error instanceof OperationsError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Solicitud no autorizada.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "No fue posible completar la operación." }, { status: 500 });
  }
}
