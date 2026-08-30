import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomStatus } from "../lib/types";
import {
  RoomManagementError,
  type RoomManagementRepository,
} from "./room-management-core";
import type {
  ManagedBed,
  ManagedRoom,
  ManagedRoomService,
  ManagedRoomType,
  RoomManagementSnapshot,
} from "./room-management-types";
import type {
  ManagedBedCreateInput,
  ManagedBedUpdateInput,
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
type BedRow = {
  id: string;
  room_id: string;
  code: string;
  bed_type: ManagedBed["bedType"];
  capacity: number;
  quantity: number;
  active: boolean;
};
type RoomServiceRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};
type RoomServiceAssignmentRow = { room_id: string; service_id: string };

const ROOM_TYPE_SELECTION =
  "id,code,name,public_name,description,default_capacity,base_rate,active";
const ROOM_SELECTION =
  "id,room_type_id,code,display_name,capacity,status,sector,internal_notes,active";
const BED_SELECTION = "id,room_id,code,bed_type,quantity,capacity,active";
const ROOM_SERVICE_SELECTION = "id,code,name,description,active";

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

function mapRoom(row: RoomRow, bedCapacity = 0, serviceIds: string[] = []): ManagedRoom {
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
    serviceIds,
  };
}

function mapBed(row: BedRow): ManagedBed {
  return {
    id: row.id,
    roomId: row.room_id,
    code: row.code,
    bedType: row.bed_type,
    quantity: Number(row.quantity),
    capacity: Number(row.capacity),
    active: row.active,
  };
}

function mapRoomService(row: RoomServiceRow): ManagedRoomService {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    active: row.active,
  };
}

export class SupabaseRoomManagementRepository implements RoomManagementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(): Promise<RoomManagementSnapshot> {
    const [roomTypes, rooms, beds, services, serviceAssignments] = await Promise.all([
      this.client.from("room_types").select(ROOM_TYPE_SELECTION).order("name"),
      this.client.from("rooms").select(ROOM_SELECTION).order("code"),
      this.client.from("beds").select(BED_SELECTION).order("code"),
      this.client.from("room_services").select(ROOM_SERVICE_SELECTION).order("name"),
      this.client.from("room_service_assignments").select("room_id,service_id"),
    ]);
    databaseError(roomTypes.error, "No fue posible cargar los tipos de habitación.");
    databaseError(rooms.error, "No fue posible cargar las habitaciones.");
    databaseError(beds.error, "No fue posible cargar las capacidades de camas.");
    databaseError(services.error, "No fue posible verificar el catálogo de servicios.");
    databaseError(
      serviceAssignments.error,
      "No fue posible cargar los servicios asignados a las habitaciones.",
    );

    const capacityByRoom = new Map<string, number>();
    for (const bed of (beds.data ?? []) as BedRow[]) {
      if (!bed.active) continue;
      capacityByRoom.set(
        bed.room_id,
        (capacityByRoom.get(bed.room_id) ?? 0) + Number(bed.capacity) * Number(bed.quantity),
      );
    }
    const serviceIdsByRoom = new Map<string, string[]>();
    for (const assignment of (serviceAssignments.data ?? []) as RoomServiceAssignmentRow[]) {
      const serviceIds = serviceIdsByRoom.get(assignment.room_id) ?? [];
      serviceIds.push(assignment.service_id);
      serviceIdsByRoom.set(assignment.room_id, serviceIds);
    }

    return {
      roomTypes: ((roomTypes.data ?? []) as unknown as RoomTypeRow[]).map(mapRoomType),
      rooms: ((rooms.data ?? []) as unknown as RoomRow[]).map((room) =>
        mapRoom(
          room,
          capacityByRoom.get(room.id) ?? 0,
          serviceIdsByRoom.get(room.id) ?? [],
        )),
      beds: ((beds.data ?? []) as unknown as BedRow[]).map(mapBed),
      services: ((services.data ?? []) as unknown as RoomServiceRow[]).map(mapRoomService),
      serviceCount: services.data?.length ?? 0,
    };
  }

  async findRoom(id: string): Promise<ManagedRoom | null> {
    const result = await this.client.from("rooms").select(ROOM_SELECTION).eq("id", id).maybeSingle();
    databaseError(result.error, "No fue posible validar la habitación.");
    if (!result.data) return null;
    const [beds, assignments] = await Promise.all([
      this.client
        .from("beds")
        .select("capacity,quantity")
        .eq("room_id", id)
        .eq("active", true),
      this.client
        .from("room_service_assignments")
        .select("service_id")
        .eq("room_id", id),
    ]);
    databaseError(beds.error, "No fue posible validar la capacidad de camas.");
    databaseError(assignments.error, "No fue posible validar los servicios asignados.");
    const bedCapacity = ((beds.data ?? []) as Array<{ capacity: number; quantity: number }>).reduce(
      (total, bed) => total + Number(bed.capacity) * Number(bed.quantity),
      0,
    );
    const serviceIds = ((assignments.data ?? []) as Array<{ service_id: string }>).map(
      (assignment) => assignment.service_id,
    );
    return mapRoom(result.data as unknown as RoomRow, bedCapacity, serviceIds);
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

  async findBed(id: string): Promise<ManagedBed | null> {
    const result = await this.client
      .from("beds")
      .select(BED_SELECTION)
      .eq("id", id)
      .maybeSingle();
    databaseError(result.error, "No fue posible validar la cama.");
    return result.data ? mapBed(result.data as unknown as BedRow) : null;
  }

  async findRoomService(id: string): Promise<ManagedRoomService | null> {
    const result = await this.client
      .from("room_services")
      .select(ROOM_SERVICE_SELECTION)
      .eq("id", id)
      .maybeSingle();
    databaseError(result.error, "No fue posible validar el servicio.");
    return result.data ? mapRoomService(result.data as unknown as RoomServiceRow) : null;
  }

  async hasRoomService(roomId: string, serviceId: string): Promise<boolean> {
    const result = await this.client
      .from("room_service_assignments")
      .select("room_id")
      .eq("room_id", roomId)
      .eq("service_id", serviceId)
      .maybeSingle();
    databaseError(result.error, "No fue posible validar la asignación del servicio.");
    return Boolean(result.data);
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

  async createBed(roomId: string, input: ManagedBedCreateInput): Promise<ManagedBed> {
    const result = await this.client.from("beds").insert({
      room_id: roomId,
      code: input.code,
      bed_type: input.bedType,
      quantity: input.quantity,
      capacity: input.capacity,
      active: input.active,
    }).select(BED_SELECTION).single();
    databaseError(result.error, "No fue posible crear la cama.");
    return mapBed(result.data as unknown as BedRow);
  }

  async updateBed(id: string, input: ManagedBedUpdateInput): Promise<ManagedBed> {
    const result = await this.client.from("beds").update({
      code: input.code,
      bed_type: input.bedType,
      quantity: input.quantity,
      capacity: input.capacity,
      active: input.active,
    }).eq("id", id).select(BED_SELECTION).maybeSingle();
    databaseError(result.error, "No fue posible actualizar la cama.");
    if (!result.data) {
      throw new RoomManagementError("BED_NOT_FOUND", "La cama no existe.");
    }
    return mapBed(result.data as unknown as BedRow);
  }

  async deactivateBed(bed: ManagedBed): Promise<ManagedBed> {
    const result = await this.client
      .from("beds")
      .update({ active: false })
      .eq("id", bed.id)
      .select(BED_SELECTION)
      .maybeSingle();
    databaseError(result.error, "No fue posible desactivar la cama.");
    if (!result.data) {
      throw new RoomManagementError("BED_NOT_FOUND", "La cama no existe.");
    }
    return mapBed(result.data as unknown as BedRow);
  }

  async assignRoomService(roomId: string, serviceId: string): Promise<void> {
    const result = await this.client.from("room_service_assignments").insert({
      room_id: roomId,
      service_id: serviceId,
    });
    databaseError(result.error, "No fue posible asignar el servicio.");
  }

  async removeRoomService(roomId: string, serviceId: string): Promise<void> {
    const result = await this.client
      .from("room_service_assignments")
      .delete()
      .eq("room_id", roomId)
      .eq("service_id", serviceId);
    databaseError(result.error, "No fue posible quitar el servicio.");
  }
}
