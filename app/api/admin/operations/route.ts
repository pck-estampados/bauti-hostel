import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SupabaseOperationsRepository } from "@/app/admin/data/supabase-operations-repository";
import {
  guestInputSchema,
  noteInputSchema,
  paymentInputSchema,
  reservationInputSchema,
  roomStatusInputSchema,
  uuidSchema,
  walkInInputSchema,
} from "@/app/admin/data/validation";
import { getStaffSession } from "@/app/lib/auth/staff-session";
import { assertProductionEnvironment } from "@/app/lib/config/env";
import { assertSameOrigin } from "@/app/lib/security/same-origin";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const operationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("addGuest"), payload: guestInputSchema }),
  z.object({ operation: z.literal("createWalkIn"), payload: walkInInputSchema }),
  z.object({ operation: z.literal("createReservation"), payload: reservationInputSchema }),
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
  return new SupabaseOperationsRepository(await createSupabaseServerClient());
}

export async function GET() {
  const repository = await repositoryForRequest();
  if (!repository) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  return NextResponse.json({ state: await repository.loadSnapshot() });
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const repository = await repositoryForRequest();
    if (!repository) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

    const operation = operationSchema.parse(await request.json());
    let state;
    switch (operation.operation) {
      case "addGuest": state = await repository.addGuest(operation.payload); break;
      case "createWalkIn": state = await repository.createWalkIn(operation.payload); break;
      case "createReservation": state = await repository.createReservation(operation.payload); break;
      case "checkIn": state = await repository.checkIn(operation.payload.reservationId); break;
      case "checkOut": state = await repository.checkOut(operation.payload.reservationId); break;
      case "registerPayment": state = await repository.registerPayment(operation.payload); break;
      case "addNote": state = await repository.addNote(operation.payload); break;
      case "changeRoomStatus": state = await repository.changeRoomStatus(operation.payload.roomId, operation.payload.status, operation.payload.reason); break;
    }
    return NextResponse.json({ state });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "Revisá los datos ingresados."
      : error instanceof Error
        ? error.message
        : "No fue posible completar la operación.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
