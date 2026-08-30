import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRoomInventoryReadModel,
  createRoomManagementService,
  RoomManagementError,
} from "../app/admin/data/room-management-core.ts";

const TYPE_ID = "123e4567-e89b-42d3-a456-426614174000";
const ROOM_ID = "123e4567-e89b-42d3-a456-426614174001";
const BED_ID = "123e4567-e89b-42d3-a456-426614174002";
const SERVICE_ID = "123e4567-e89b-42d3-a456-426614174003";
const SECOND_SERVICE_ID = "123e4567-e89b-42d3-a456-426614174004";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const reader = { permissions: ["rooms.read"] };
const manager = {
  permissions: ["rooms.read", "rooms.inventory_manage", "rooms.manage"],
};
const typeManager = { permissions: ["rooms.read", "rooms.inventory_manage"] };

const validType = {
  id: TYPE_ID,
  code: "matrimonial",
  internalName: "Matrimonial",
  publicName: "Habitación matrimonial",
  description: "",
  defaultCapacity: 2,
  baseRate: 60000,
  active: true,
};

const validRoomInput = {
  roomTypeId: TYPE_ID,
  code: "H-01",
  displayName: "Habitación 1",
  capacity: 2,
  sector: "",
  internalNotes: "",
  active: true,
};

const validBedInput = {
  code: "C-01",
  bedType: "single",
  quantity: 2,
  capacity: 1,
  active: true,
};

function memoryRepository(options = {}) {
  const roomTypes = [structuredClone(validType)];
  const rooms = [];
  const beds = [];
  const services = [
    { id: SERVICE_ID, code: "fan", name: "Ventilador", description: "", active: true },
    { id: SECOND_SERVICE_ID, code: "heating", name: "Calefacción", description: "", active: true },
  ];
  const assignments = [];
  const events = [];

  const snapshotRoom = (room) => ({
    ...structuredClone(room),
    bedCapacity: beds
      .filter((bed) => bed.roomId === room.id && bed.active)
      .reduce((total, bed) => total + bed.quantity * bed.capacity, 0),
    serviceIds: assignments
      .filter((assignment) => assignment.roomId === room.id)
      .map((assignment) => assignment.serviceId),
  });

  return {
    events,
    roomTypes,
    rooms,
    beds,
    services,
    assignments,
    repository: {
      async loadSnapshot() {
        events.push("list");
        if (options.failList) throw new RoomManagementError("ROOM_OPERATION_FAILED", "falló listado");
        return {
          roomTypes: structuredClone(roomTypes),
          rooms: rooms.map(snapshotRoom),
          beds: structuredClone(beds),
          services: structuredClone(services),
          serviceCount: services.length,
        };
      },
      async findRoom(id) {
        events.push(`room:find:${id}`);
        const room = rooms.find((item) => item.id === id);
        return room ? snapshotRoom(room) : null;
      },
      async findRoomType(id) {
        events.push(`type:find:${id}`);
        return structuredClone(roomTypes.find((roomType) => roomType.id === id) ?? null);
      },
      async findBed(id) {
        events.push(`bed:find:${id}`);
        return structuredClone(beds.find((bed) => bed.id === id) ?? null);
      },
      async findRoomService(id) {
        events.push(`service:find:${id}`);
        return structuredClone(services.find((service) => service.id === id) ?? null);
      },
      async hasRoomService(roomId, serviceId) {
        events.push(`service-assignment:find:${roomId}:${serviceId}`);
        return assignments.some(
          (assignment) => assignment.roomId === roomId && assignment.serviceId === serviceId,
        );
      },
      async createRoom(input) {
        events.push("room:create");
        const room = {
          id: ROOM_ID,
          ...structuredClone(input),
          status: "out_of_service",
          bedCapacity: 0,
          serviceIds: [],
        };
        rooms.push(room);
        return structuredClone(room);
      },
      async updateRoom(id, input) {
        events.push("room:update");
        const index = rooms.findIndex((room) => room.id === id);
        const updated = { ...rooms[index], ...structuredClone(input) };
        rooms[index] = updated;
        return structuredClone(updated);
      },
      async updateRoomStatus(id, status) {
        events.push("room:status");
        const index = rooms.findIndex((room) => room.id === id);
        rooms[index] = { ...rooms[index], status };
        return structuredClone(rooms[index]);
      },
      async deactivateRoom(room) {
        events.push("room:deactivate-soft");
        const index = rooms.findIndex((item) => item.id === room.id);
        const updated = { ...rooms[index], active: false, status: "out_of_service" };
        rooms[index] = updated;
        return structuredClone(updated);
      },
      async createRoomType(input) {
        events.push("type:create");
        const roomType = { id: TYPE_ID, ...structuredClone(input) };
        roomTypes.splice(0, roomTypes.length, roomType);
        return structuredClone(roomType);
      },
      async updateRoomType(id, input) {
        events.push("type:update");
        const index = roomTypes.findIndex((roomType) => roomType.id === id);
        roomTypes[index] = { id, ...structuredClone(input) };
        return structuredClone(roomTypes[index]);
      },
      async createBed(roomId, input) {
        events.push("bed:create");
        const bed = { id: BED_ID, roomId, ...structuredClone(input) };
        beds.push(bed);
        return structuredClone(bed);
      },
      async updateBed(id, input) {
        events.push("bed:update");
        const index = beds.findIndex((bed) => bed.id === id);
        beds[index] = { ...beds[index], ...structuredClone(input) };
        return structuredClone(beds[index]);
      },
      async deactivateBed(bed) {
        events.push("bed:deactivate-soft");
        const index = beds.findIndex((item) => item.id === bed.id);
        beds[index] = { ...beds[index], active: false };
        return structuredClone(beds[index]);
      },
      async assignRoomService(roomId, serviceId) {
        events.push("service:assign");
        assignments.push({ roomId, serviceId });
      },
      async removeRoomService(roomId, serviceId) {
        events.push("service:remove");
        const index = assignments.findIndex(
          (assignment) => assignment.roomId === roomId && assignment.serviceId === serviceId,
        );
        assignments.splice(index, 1);
      },
    },
  };
}

test("rejects unauthenticated and unauthorized room creation", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(service.createRoom(null, validRoomInput), (error) => {
    assert.equal(error.code, "ROOM_UNAUTHENTICATED");
    return true;
  });
  await assert.rejects(service.createRoom(reader, validRoomInput), (error) => {
    assert.equal(error.code, "ROOM_FORBIDDEN");
    return true;
  });
  assert.deepEqual(adapters.events, []);
});

test("rejects invalid payloads before touching the repository", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(service.createRoom(manager, { ...validRoomInput, capacity: 0 }), /Too small|greater than or equal/i);
  assert.deepEqual(adapters.events, []);
});

test("creates a valid room and lists persisted real state", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  const room = await service.createRoom(manager, validRoomInput);
  assert.equal(room.status, "out_of_service");
  assert.equal(room.active, true);
  const snapshot = await service.list(reader);
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.rooms[0].code, "H-01");
  assert.deepEqual(adapters.events, [`type:find:${TYPE_ID}`, "room:create", "list"]);
});

test("persists legitimate room edits", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const updated = await service.updateRoom(manager, ROOM_ID, {
    ...validRoomInput,
    displayName: "Habitación principal",
    sector: "Planta baja",
  });
  assert.equal(updated.displayName, "Habitación principal");
  assert.equal(updated.sector, "Planta baja");
  assert.equal(adapters.rooms[0].displayName, "Habitación principal");
});

test("deactivates without physically deleting the room", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const deactivated = await service.deactivateRoom(manager, ROOM_ID);
  assert.equal(deactivated.active, false);
  assert.equal(deactivated.status, "out_of_service");
  assert.equal(adapters.rooms.length, 1);
  assert.equal(adapters.events.at(-1), "room:deactivate-soft");
});

test("updates operational status through the controlled service", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const updated = await service.updateRoomStatus(manager, ROOM_ID, "ready");
  assert.equal(updated.status, "ready");
  assert.equal(adapters.events.at(-1), "room:status");
});

test("requires a real active room type and supports its minimal management", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.updateRoomType(typeManager, TYPE_ID, { ...validType, active: false });
  await assert.rejects(service.createRoom(manager, validRoomInput), (error) => {
    assert.equal(error.code, "ROOM_TYPE_INACTIVE");
    return true;
  });
  const created = await service.createRoomType(typeManager, {
    code: "doble",
    internalName: "Doble",
    publicName: "Habitación doble",
    description: "",
    defaultCapacity: 2,
    baseRate: 60000,
    active: true,
  });
  assert.equal(created.active, true);
});

test("propagates controlled repository errors", async () => {
  const adapters = memoryRepository({ failList: true });
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(service.list(reader), (error) => {
    assert.equal(error.code, "ROOM_OPERATION_FAILED");
    return true;
  });
});

test("rejects unauthenticated bed creation", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(service.createBed(null, ROOM_ID, validBedInput), (error) => {
    assert.equal(error.code, "ROOM_UNAUTHENTICATED");
    return true;
  });
  assert.deepEqual(adapters.events, []);
});

test("rejects bed creation without inventory permission", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(service.createBed(reader, ROOM_ID, validBedInput), (error) => {
    assert.equal(error.code, "ROOM_FORBIDDEN");
    return true;
  });
  assert.deepEqual(adapters.events, []);
});

test("rejects invalid bed payloads before repository access", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(
    service.createBed(typeManager, ROOM_ID, { ...validBedInput, capacity: 0 }),
    /Too small|greater than or equal/i,
  );
  assert.deepEqual(adapters.events, []);
});

test("creates and persists a valid bed", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const bed = await service.createBed(typeManager, ROOM_ID, validBedInput);
  assert.equal(bed.roomId, ROOM_ID);
  assert.equal(adapters.beds.length, 1);
  const snapshot = await service.list(reader);
  assert.equal(snapshot.beds.length, 1);
  assert.equal(snapshot.rooms[0].bedCapacity, 2);
});

test("edits an existing bed and persists the result", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  await service.createBed(typeManager, ROOM_ID, validBedInput);
  const updated = await service.updateBed(typeManager, ROOM_ID, BED_ID, {
    ...validBedInput,
    quantity: 3,
  });
  assert.equal(updated.quantity, 3);
  assert.equal(adapters.beds[0].quantity, 3);
});

test("deactivates a bed without deleting it", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  await service.createBed(typeManager, ROOM_ID, validBedInput);
  const deactivated = await service.deactivateBed(typeManager, ROOM_ID, BED_ID);
  assert.equal(deactivated.active, false);
  assert.equal(adapters.beds.length, 1);
  assert.equal(adapters.events.at(-1), "bed:deactivate-soft");
});

test("does not create a bed for a missing room", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(
    service.createBed(typeManager, "123e4567-e89b-42d3-a456-426614174099", validBedInput),
    (error) => {
      assert.equal(error.code, "ROOM_NOT_FOUND");
      return true;
    },
  );
  assert.equal(adapters.beds.length, 0);
});

test("rejects bed types outside the database constraint", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await assert.rejects(
    service.createBed(typeManager, ROOM_ID, { ...validBedInput, bedType: "king" }),
    /Invalid option/i,
  );
  assert.deepEqual(adapters.events, []);
});

test("loads room services from the repository snapshot", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  const snapshot = await service.list(reader);
  assert.deepEqual(snapshot.services.map((service) => service.code), ["fan", "heating"]);
  assert.equal(snapshot.serviceCount, adapters.services.length);
});

test("does not hardcode service names in the room interface", async () => {
  const consoleSource = await read("app/admin/habitaciones/room-management-console.tsx");
  assert.doesNotMatch(
    consoleSource,
    /Aire acondicionado|Ropa de cama|Ventilador|Calefacción|Televisión|Toallas/,
  );
  assert.match(consoleSource, /state\.services/);
});

test("assigns an existing active service", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const assigned = await service.assignRoomService(typeManager, ROOM_ID, { serviceId: SERVICE_ID });
  assert.equal(assigned.id, SERVICE_ID);
  assert.deepEqual(adapters.assignments, [{ roomId: ROOM_ID, serviceId: SERVICE_ID }]);
});

test("reports duplicate service assignments as conflicts", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  await service.assignRoomService(typeManager, ROOM_ID, { serviceId: SERVICE_ID });
  await assert.rejects(
    service.assignRoomService(typeManager, ROOM_ID, { serviceId: SERVICE_ID }),
    (error) => {
      assert.equal(error.code, "ROOM_CONFLICT");
      return true;
    },
  );
  assert.equal(adapters.assignments.length, 1);
});

test("removes an existing service assignment", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  await service.assignRoomService(typeManager, ROOM_ID, { serviceId: SERVICE_ID });
  await service.removeRoomService(typeManager, ROOM_ID, SERVICE_ID);
  assert.equal(adapters.assignments.length, 0);
  assert.equal(adapters.events.at(-1), "service:remove");
});

test("enforces inventory permission for service assignment", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  const eventCount = adapters.events.length;
  await assert.rejects(
    service.assignRoomService(reader, ROOM_ID, { serviceId: SERVICE_ID }),
    (error) => {
      assert.equal(error.code, "ROOM_FORBIDDEN");
      return true;
    },
  );
  assert.equal(adapters.events.length, eventCount);
});

test("rejects a nonexistent service id", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, validRoomInput);
  await assert.rejects(
    service.assignRoomService(typeManager, ROOM_ID, {
      serviceId: "123e4567-e89b-42d3-a456-426614174099",
    }),
    (error) => {
      assert.equal(error.code, "ROOM_SERVICE_NOT_FOUND");
      return true;
    },
  );
});

test("builds reservation-ready inventory without blocking capacity mismatches", async () => {
  const adapters = memoryRepository();
  const service = createRoomManagementService(adapters.repository);
  await service.createRoom(manager, { ...validRoomInput, capacity: 4 });
  await service.createBed(typeManager, ROOM_ID, validBedInput);
  await service.assignRoomService(typeManager, ROOM_ID, { serviceId: SERVICE_ID });
  const readModel = buildRoomInventoryReadModel(await service.list(reader));
  assert.equal(readModel[0].configuredCapacity, 4);
  assert.equal(readModel[0].activeBeds, 2);
  assert.equal(readModel[0].bedCapacity, 2);
  assert.deepEqual(readModel[0].assignedServices.map((service) => service.id), [SERVICE_ID]);
});

test("routes use session-bound clients, RLS permissions and no privileged key", async () => {
  const [
    roomsRoute,
    roomRoute,
    statusRoute,
    typesRoute,
    typeRoute,
    bedsRoute,
    bedRoute,
    servicesRoute,
    serviceRoute,
    repository,
    core,
    api,
  ] = await Promise.all([
    read("app/api/admin/rooms/route.ts"),
    read("app/api/admin/rooms/[id]/route.ts"),
    read("app/api/admin/rooms/[id]/status/route.ts"),
    read("app/api/admin/room-types/route.ts"),
    read("app/api/admin/room-types/[id]/route.ts"),
    read("app/api/admin/rooms/[id]/beds/route.ts"),
    read("app/api/admin/rooms/[id]/beds/[bedId]/route.ts"),
    read("app/api/admin/rooms/[id]/services/route.ts"),
    read("app/api/admin/rooms/[id]/services/[serviceId]/route.ts"),
    read("app/admin/data/supabase-room-management-repository.ts"),
    read("app/admin/data/room-management-core.ts"),
    read("app/lib/room-management-api.ts"),
  ]);
  const source = roomsRoute + roomRoute + statusRoute + typesRoute + typeRoute
    + bedsRoute + bedRoute + servicesRoute + serviceRoute + repository + core;
  assert.match(source, /getStaffSession/);
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /assertSameOrigin/);
  assert.match(source, /rooms\.inventory_manage/);
  assert.match(source, /rooms\.manage/);
  assert.match(source, /from\("beds"\)/);
  assert.match(source, /from\("room_service_assignments"\)/);
  assert.match(api, /ROOM_UNAUTHENTICATED: 401/);
  assert.match(api, /ROOM_FORBIDDEN: 403/);
  assert.doesNotMatch(source, /SUPABASE_(?:SECRET|SERVICE_ROLE)|createSupabaseAdminClient/);
});

test("admin and public listings contain no demo room inventory", async () => {
  const [adminPage, consoleSource, publicPage, site] = await Promise.all([
    read("app/admin/habitaciones/page.tsx"),
    read("app/admin/habitaciones/room-management-console.tsx"),
    read("app/(public)/habitaciones/page.tsx"),
    read("app/lib/site.ts"),
  ]);
  assert.match(adminPage, /SupabaseRoomManagementRepository/);
  assert.match(consoleSource, /No hay habitaciones cargadas\./);
  assert.match(consoleSource, /Agregar habitación/);
  assert.match(publicPage, /AccommodationInquiry/);
  assert.match(site, /publishedRooms[^=]*= \[\]/);
  assert.doesNotMatch(consoleSource, /Habitación Matrimonial Demo|createDemoOperationsState|demoRooms/i);
});
