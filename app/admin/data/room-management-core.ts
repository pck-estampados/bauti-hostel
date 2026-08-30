import type {
  ManagedRoom,
  ManagedRoomType,
  RoomManagementSnapshot,
} from "./room-management-types.ts";
import {
  managedRoomCreateSchema,
  managedRoomIdSchema,
  managedRoomStatusSchema,
  managedRoomTypeCreateSchema,
  managedRoomTypeIdSchema,
  managedRoomTypeUpdateSchema,
  managedRoomUpdateSchema,
  type ManagedRoomCreateInput,
  type ManagedRoomTypeCreateInput,
  type ManagedRoomTypeUpdateInput,
  type ManagedRoomUpdateInput,
} from "./room-management-validation.ts";

export type RoomManagementActor = { permissions: string[] };

export type RoomManagementRepository = {
  loadSnapshot(): Promise<RoomManagementSnapshot>;
  findRoom(id: string): Promise<ManagedRoom | null>;
  findRoomType(id: string): Promise<ManagedRoomType | null>;
  createRoom(input: ManagedRoomCreateInput): Promise<ManagedRoom>;
  updateRoom(id: string, input: ManagedRoomUpdateInput): Promise<ManagedRoom>;
  updateRoomStatus(id: string, status: ManagedRoom["status"]): Promise<ManagedRoom>;
  deactivateRoom(room: ManagedRoom): Promise<ManagedRoom>;
  createRoomType(input: ManagedRoomTypeCreateInput): Promise<ManagedRoomType>;
  updateRoomType(id: string, input: ManagedRoomTypeUpdateInput): Promise<ManagedRoomType>;
};

export type RoomManagementErrorCode =
  | "ROOM_UNAUTHENTICATED"
  | "ROOM_FORBIDDEN"
  | "ROOM_NOT_FOUND"
  | "ROOM_TYPE_NOT_FOUND"
  | "ROOM_TYPE_INACTIVE"
  | "ROOM_INVALID_STATE"
  | "ROOM_CONFLICT"
  | "ROOM_OPERATION_FAILED";

export class RoomManagementError extends Error {
  readonly code: RoomManagementErrorCode;

  constructor(code: RoomManagementErrorCode, message: string) {
    super(message);
    this.name = "RoomManagementError";
    this.code = code;
  }
}

export function requireRoomPermissions(
  actor: RoomManagementActor | null,
  ...permissions: string[]
) {
  if (!actor) {
    throw new RoomManagementError("ROOM_UNAUTHENTICATED", "Sesión no válida.");
  }
  if (permissions.some((permission) => !actor.permissions.includes(permission))) {
    throw new RoomManagementError(
      "ROOM_FORBIDDEN",
      "No tenés permisos para administrar habitaciones.",
    );
  }
}

async function requireActiveRoomType(repository: RoomManagementRepository, id: string) {
  const roomType = await repository.findRoomType(managedRoomTypeIdSchema.parse(id));
  if (!roomType) {
    throw new RoomManagementError(
      "ROOM_TYPE_NOT_FOUND",
      "El tipo de habitación seleccionado no existe.",
    );
  }
  if (!roomType.active) {
    throw new RoomManagementError(
      "ROOM_TYPE_INACTIVE",
      "El tipo de habitación seleccionado está inactivo.",
    );
  }
}

export function createRoomManagementService(repository: RoomManagementRepository) {
  return {
    async list(actor: RoomManagementActor | null) {
      requireRoomPermissions(actor, "rooms.read");
      return repository.loadSnapshot();
    },

    async createRoom(actor: RoomManagementActor | null, input: unknown) {
      requireRoomPermissions(actor, "rooms.inventory_manage", "rooms.manage");
      const value = managedRoomCreateSchema.parse(input);
      await requireActiveRoomType(repository, value.roomTypeId);
      return repository.createRoom(value);
    },

    async updateRoom(actor: RoomManagementActor | null, id: string, input: unknown) {
      requireRoomPermissions(actor, "rooms.inventory_manage", "rooms.manage");
      const roomId = managedRoomIdSchema.parse(id);
      const current = await repository.findRoom(roomId);
      if (!current) {
        throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
      }
      const value = managedRoomUpdateSchema.parse(input);
      if (current.active && !value.active) {
        throw new RoomManagementError(
          "ROOM_INVALID_STATE",
          "Usá la acción Desactivar para conservar el estado operativo y el historial.",
        );
      }
      await requireActiveRoomType(repository, value.roomTypeId);
      return repository.updateRoom(roomId, value);
    },

    async deactivateRoom(actor: RoomManagementActor | null, id: string) {
      requireRoomPermissions(actor, "rooms.inventory_manage", "rooms.manage");
      const roomId = managedRoomIdSchema.parse(id);
      const current = await repository.findRoom(roomId);
      if (!current) {
        throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
      }
      if (!current.active && current.status === "out_of_service") return current;
      return repository.deactivateRoom(current);
    },

    async updateRoomStatus(actor: RoomManagementActor | null, id: string, input: unknown) {
      requireRoomPermissions(actor, "rooms.read", "rooms.manage");
      const roomId = managedRoomIdSchema.parse(id);
      const current = await repository.findRoom(roomId);
      if (!current) {
        throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
      }
      const value = managedRoomStatusSchema.parse(input);
      if (!current.active && value !== "out_of_service") {
        throw new RoomManagementError(
          "ROOM_INVALID_STATE",
          "Reactivá la habitación antes de cambiar su estado operativo.",
        );
      }
      return repository.updateRoomStatus(roomId, value);
    },

    async createRoomType(actor: RoomManagementActor | null, input: unknown) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      return repository.createRoomType(managedRoomTypeCreateSchema.parse(input));
    },

    async updateRoomType(actor: RoomManagementActor | null, id: string, input: unknown) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const roomTypeId = managedRoomTypeIdSchema.parse(id);
      const current = await repository.findRoomType(roomTypeId);
      if (!current) {
        throw new RoomManagementError(
          "ROOM_TYPE_NOT_FOUND",
          "El tipo de habitación no existe.",
        );
      }
      return repository.updateRoomType(
        roomTypeId,
        managedRoomTypeUpdateSchema.parse(input),
      );
    },
  };
}
