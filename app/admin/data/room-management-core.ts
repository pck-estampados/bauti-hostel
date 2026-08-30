import type {
  ManagedBed,
  ManagedRoom,
  ManagedRoomService,
  ManagedRoomType,
  RoomInventoryReadModel,
  RoomManagementSnapshot,
} from "./room-management-types.ts";
import {
  managedBedCreateSchema,
  managedBedIdSchema,
  managedBedUpdateSchema,
  managedRoomCreateSchema,
  managedRoomIdSchema,
  managedRoomServiceAssignmentSchema,
  managedRoomServiceIdSchema,
  managedRoomStatusSchema,
  managedRoomTypeCreateSchema,
  managedRoomTypeIdSchema,
  managedRoomTypeUpdateSchema,
  managedRoomUpdateSchema,
  type ManagedBedCreateInput,
  type ManagedBedUpdateInput,
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
  findBed(id: string): Promise<ManagedBed | null>;
  findRoomService(id: string): Promise<ManagedRoomService | null>;
  hasRoomService(roomId: string, serviceId: string): Promise<boolean>;
  createRoom(input: ManagedRoomCreateInput): Promise<ManagedRoom>;
  updateRoom(id: string, input: ManagedRoomUpdateInput): Promise<ManagedRoom>;
  updateRoomStatus(id: string, status: ManagedRoom["status"]): Promise<ManagedRoom>;
  deactivateRoom(room: ManagedRoom): Promise<ManagedRoom>;
  createRoomType(input: ManagedRoomTypeCreateInput): Promise<ManagedRoomType>;
  updateRoomType(id: string, input: ManagedRoomTypeUpdateInput): Promise<ManagedRoomType>;
  createBed(roomId: string, input: ManagedBedCreateInput): Promise<ManagedBed>;
  updateBed(id: string, input: ManagedBedUpdateInput): Promise<ManagedBed>;
  deactivateBed(bed: ManagedBed): Promise<ManagedBed>;
  assignRoomService(roomId: string, serviceId: string): Promise<void>;
  removeRoomService(roomId: string, serviceId: string): Promise<void>;
};

export type RoomManagementErrorCode =
  | "ROOM_UNAUTHENTICATED"
  | "ROOM_FORBIDDEN"
  | "ROOM_NOT_FOUND"
  | "ROOM_TYPE_NOT_FOUND"
  | "ROOM_TYPE_INACTIVE"
  | "BED_NOT_FOUND"
  | "ROOM_SERVICE_NOT_FOUND"
  | "ROOM_SERVICE_INACTIVE"
  | "ROOM_SERVICE_ASSIGNMENT_NOT_FOUND"
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

async function requireRoom(repository: RoomManagementRepository, id: string) {
  const roomId = managedRoomIdSchema.parse(id);
  const room = await repository.findRoom(roomId);
  if (!room) {
    throw new RoomManagementError("ROOM_NOT_FOUND", "La habitación no existe.");
  }
  return room;
}

export function buildRoomInventoryReadModel(
  snapshot: RoomManagementSnapshot,
): RoomInventoryReadModel[] {
  const servicesById = new Map(snapshot.services.map((service) => [service.id, service]));
  return snapshot.rooms.map((room) => {
    const activeBeds = snapshot.beds.filter((bed) => bed.roomId === room.id && bed.active);
    return {
      roomId: room.id,
      active: room.active,
      status: room.status,
      configuredCapacity: room.capacity,
      activeBeds: activeBeds.reduce((total, bed) => total + bed.quantity, 0),
      bedCapacity: activeBeds.reduce(
        (total, bed) => total + bed.quantity * bed.capacity,
        0,
      ),
      assignedServices: room.serviceIds.flatMap((id) => {
        const service = servicesById.get(id);
        return service ? [service] : [];
      }),
    };
  });
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

    async createBed(
      actor: RoomManagementActor | null,
      roomIdInput: string,
      input: unknown,
    ) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const value = managedBedCreateSchema.parse(input);
      const room = await requireRoom(repository, roomIdInput);
      return repository.createBed(room.id, value);
    },

    async updateBed(
      actor: RoomManagementActor | null,
      roomIdInput: string,
      bedIdInput: string,
      input: unknown,
    ) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const value = managedBedUpdateSchema.parse(input);
      const room = await requireRoom(repository, roomIdInput);
      const bedId = managedBedIdSchema.parse(bedIdInput);
      const bed = await repository.findBed(bedId);
      if (!bed || bed.roomId !== room.id) {
        throw new RoomManagementError("BED_NOT_FOUND", "La cama no existe en esta habitación.");
      }
      if (bed.active && !value.active) {
        throw new RoomManagementError(
          "ROOM_INVALID_STATE",
          "Usá la acción Desactivar para dar de baja la cama de forma segura.",
        );
      }
      return repository.updateBed(bed.id, value);
    },

    async deactivateBed(
      actor: RoomManagementActor | null,
      roomIdInput: string,
      bedIdInput: string,
    ) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const room = await requireRoom(repository, roomIdInput);
      const bedId = managedBedIdSchema.parse(bedIdInput);
      const bed = await repository.findBed(bedId);
      if (!bed || bed.roomId !== room.id) {
        throw new RoomManagementError("BED_NOT_FOUND", "La cama no existe en esta habitación.");
      }
      if (!bed.active) return bed;
      return repository.deactivateBed(bed);
    },

    async assignRoomService(
      actor: RoomManagementActor | null,
      roomIdInput: string,
      input: unknown,
    ) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const room = await requireRoom(repository, roomIdInput);
      const { serviceId } = managedRoomServiceAssignmentSchema.parse(input);
      const service = await repository.findRoomService(serviceId);
      if (!service) {
        throw new RoomManagementError(
          "ROOM_SERVICE_NOT_FOUND",
          "El servicio seleccionado no existe.",
        );
      }
      if (!service.active) {
        throw new RoomManagementError(
          "ROOM_SERVICE_INACTIVE",
          "El servicio seleccionado está inactivo.",
        );
      }
      if (await repository.hasRoomService(room.id, service.id)) {
        throw new RoomManagementError(
          "ROOM_CONFLICT",
          "El servicio ya está asignado a esta habitación.",
        );
      }
      await repository.assignRoomService(room.id, service.id);
      return service;
    },

    async removeRoomService(
      actor: RoomManagementActor | null,
      roomIdInput: string,
      serviceIdInput: string,
    ) {
      requireRoomPermissions(actor, "rooms.inventory_manage");
      const room = await requireRoom(repository, roomIdInput);
      const serviceId = managedRoomServiceIdSchema.parse(serviceIdInput);
      if (!(await repository.hasRoomService(room.id, serviceId))) {
        throw new RoomManagementError(
          "ROOM_SERVICE_ASSIGNMENT_NOT_FOUND",
          "El servicio no está asignado a esta habitación.",
        );
      }
      await repository.removeRoomService(room.id, serviceId);
    },
  };
}
