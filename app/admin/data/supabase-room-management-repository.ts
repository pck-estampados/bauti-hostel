import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomStatus } from "../lib/types";
import {
  RoomManagementError,
  type RoomManagementRepository,
} from "./room-management-core";
import type {
  ManagedRoom,
  ManagedRoomType,
  RoomManagementSnapshot,
} from "./room-management-types";
import type {
  ManagedRoomCreateInput,
  ManagedRoomTypeCreateInput,
  ManagedRoomTypeUpdateInput,
  ManagedRoomUpdateInput,
} from "./room-management-validation";

type DatabaseError = { code?: string; message: string } | null;
type RoomTypeRow = {
  id: string;
  code: string;
  name: string;
  public_name: string | null;
  description: string | null;
  default_capacity: number;
  base_rate: number | null;
  active: boolean;
};
type RoomRow = {
  id: string;
  room_type_id: string | null;
  code: string;
  display_name: string;
  capacity: number;
  status: RoomStatus;
  sector: string | null;
  internal_notes: string | null;
  active: boolean;
};
type BedRow = { room_id: string; capacity: number; quantity: number; active: boolean };

const ROOM_TYPE_SELECTION =
  "id,code,name,public_name,description,default_capacity,base_rate,active";
const ROOM_SELECTION =
  "id,room_type_id,code,display_name,capacity,status,sector,internal_notes,active";

function databaseError(error: DatabaseError, fallback: string): void {
  if (!error) return;
  if (error.code === "23505") {
    throw new RoomManagementError(
      "ROOM_CONFLICT",
      "Ya existe un registro con ese código.",
    );
  }
  throw new RoomManagementError("ROOM_OPERATION_FAILED", fallback);
}

function mapRoomType(row: RoomTypeRow): ManagedRoomType {
  return {
    id: row.id,
    code: row.code,
    internalName: row.name,
    publicName: row.public_name ?? "",
    description: row.description ?? "",
    defaultCapacity: Number(row.default_capacity),
    baseRate: Number(row.base_rate ?? 0),
    active: row.active,
  };
}

function mapRoom(row: RoomRow, bedCapacity = 0): ManagedRoom {
  return {
    id: row.id,
    roomTypeId: row.room_type_id ?? "",
    code: row.code,
    displayName: row.display_name,
    capacity: Number(row.capacity),
    status: row.status,
    sector: row.sector ?? "",
    internalNotes: row.internal_notes ?? "",
    active: row.active,
    bedCapacity,
  };
}

export class SupabaseRoomManagementRepository implements RoomManagementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(): Promise<RoomManagementSnapshot> {
    const [roomTypes, rooms, beds, services] = await Promise.all([
      this.client.from("room_types").select(ROOM_TYPE_SELECTION).order("name"),
      this.client.from("rooms").select(ROOM_SELECTION).order("code"),
      this.client.from("beds").select("room_id,capacity,quantity,active").eq("active", true),
      this.client.from("room_services").select("id", { count: "exact", head: true }),
    ]);
    databaseError(roomTypes.error, "No fue posible cargar los tipos de habitación.");
    databaseError(rooms.error, "No fue posible cargar las habitaciones.");
    databaseError(beds.error, "No fue posible cargar las capacidades de camas.");
    databaseError(services.error, "No fue posible verificar el catálogo de servicios.");

    const capacityByRoom = new Map<string, number>();
    for (const bed of (beds.data ?? []) as BedRow[]) {
      capacityByRoom.set(
        bed.room_id,
        (capacityByRoom.get(bed.room_id) ?? 0) + Number(bed.capacity) * Number(bed.quantity),
      );
    }

    return {
      roomTypes: ((roomTypes.data ?? []) as unknown as RoomTypeRow[]).map(mapRoomType),
      rooms: ((rooms.data ?? []) as unknown as RoomRow[]).map((room) =>
        mapRoom(room, capacityByRoom.get(room.id) ?? 0)),
      serviceCount: services.count ?? 0,
    };
  }

  async findRoom(id: string): Promise<ManagedRoom | null> {
    const result = await this.client.from("rooms").select(ROOM_SELECTION).eq("id", id).maybeSingle();
    databaseError(result.error, "No fue posible validar la habitación.");
    if (!result.data) return null;
    const beds = await this.client
      .from("beds")
      .select("capacity,quantity")
      .eq("room_id", id)
      .eq("active", true);
    databaseError(beds.error, "No fue posible validar la capacidad de camas.");
    const bedCapacity = ((beds.data ?? []) as Array<{ capacity: number; quantity: number }>).reduce(
      (total, bed) => total + Number(bed.capacity) * Number(bed.quantity),
      0,
    );
    return mapRoom(result.data as unknown as RoomRow, bedCapacity);
  }

  async findRoomType(id: string): Promise<ManagedRoomType | null> {
    const result = await this.client
      .from("room_types")
      .select(ROOM_TYPE_SELECTION)
      .eq("id", id)
      .maybeSingle();
    databaseError(result.error, "No fue posible validar el tipo de habitación.");
    return result.data ? mapRoomType(result.data as unknown as RoomTypeRow) : null;
  }

  async createRoom(input: ManagedRoomCreateInput): Promise<ManagedRoom> {
    const result = await this.client.from("rooms").insert({
      room_type_id: input.roomTypeId,
      code: input.code,
      display_name: input.displayName,
      capacity: input.capacity,
      status: "out_of_service",
      status_note: "Pendiente de habilitación operativa.",
      sector: input.sector || null,
      internal_notes: input.internalNotes || null,
      active: input.active,
    }).select(ROOM_SELECTION).single();
    databaseError(result.error, "No fue posible crear la habitación.");
    return mapRoom(result.data as unknown as RoomRow);
  }

  async updateRoom(id: string, input: ManagedRoomUpdateInput): Promise<ManagedRoom> {
    const result = await this.client.from("rooms").update({
      room_type_id: input.roomTypeId,
      code: input.code,
      display_name: input.displayName,
      capacity: input.capacity,
      sector: input.sector || null,
      internal_notes: input.internalNotes || null,
      active: input.active,
    }).eq("id", id).select(ROOM_SELECTION).maybeSingle();
    databaseError(result.error, "No fue posible actualizar la habitación.");
    if (!result.data) {
      throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
    }
    return mapRoom(result.data as unknown as RoomRow);
  }

  async updateRoomStatus(id: string, status: RoomStatus): Promise<ManagedRoom> {
    const result = await this.client.rpc("set_room_operational_status", {
      p_room_id: id,
      p_status: status,
      p_reason: "Estado actualizado desde la administración de habitaciones.",
    });
    databaseError(result.error, "No fue posible actualizar el estado operativo.");
    const updated = await this.findRoom(id);
    if (!updated) {
      throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
    }
    return updated;
  }

  async deactivateRoom(room: ManagedRoom): Promise<ManagedRoom> {
    if (room.status !== "out_of_service") {
      const statusResult = await this.client.rpc("set_room_operational_status", {
        p_room_id: room.id,
        p_status: "out_of_service",
        p_reason: "Habitación desactivada desde la administración de inventario.",
      });
      databaseError(statusResult.error, "No fue posible dejar la habitación fuera de servicio.");
    }
    const result = await this.client
      .from("rooms")
      .update({ active: false })
      .eq("id", room.id)
      .select(ROOM_SELECTION)
      .maybeSingle();
    databaseError(
      result.error,
      "La habitación quedó fuera de servicio, pero no fue posible completar su desactivación.",
    );
    if (!result.data) {
      throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
    }
    return mapRoom(result.data as unknown as RoomRow, room.bedCapacity);
  }

  async createRoomType(input: ManagedRoomTypeCreateInput): Promise<ManagedRoomType> {
    const result = await this.client.from("room_types").insert({
      code: input.code,
      name: input.internalName,
      public_name: input.publicName,
      description: input.description || null,
      default_capacity: input.defaultCapacity,
      base_rate: input.baseRate,
      active: input.active,
    }).select(ROOM_TYPE_SELECTION).single();
    databaseError(result.error, "No fue posible crear el tipo de habitación.");
    return mapRoomType(result.data as unknown as RoomTypeRow);
  }

  async updateRoomType(
    id: string,
    input: ManagedRoomTypeUpdateInput,
  ): Promise<ManagedRoomType> {
    const result = await this.client.from("room_types").update({
      code: input.code,
      name: input.internalName,
      public_name: input.publicName,
      description: input.description || null,
      default_capacity: input.defaultCapacity,
      base_rate: input.baseRate,
      active: input.active,
    }).eq("id", id).select(ROOM_TYPE_SELECTION).maybeSingle();
    databaseError(result.error, "No fue posible actualizar el tipo de habitación.");
    if (!result.data) {
      throw new RoomManagementError(
        "ROOM_TYPE_NOT_FOUND",
        "El tipo de habitación no existe.",
      );
    }
    return mapRoomType(result.data as unknown as RoomTypeRow);
  }
}
