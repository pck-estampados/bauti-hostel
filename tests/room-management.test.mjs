import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRoomManagementService,
  RoomManagementError,
} from "../app/admin/data/room-management-core.ts";

const TYPE_ID = "123e4567-e89b-42d3-a456-426614174000";
const ROOM_ID = "123e4567-e89b-42d3-a456-426614174001";
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

function memoryRepository(options = {}) {
  const roomTypes = [structuredClone(validType)];
  const rooms = [];
  const events = [];

  return {
    events,
    roomTypes,
    rooms,
    repository: {
      async loadSnapshot() {
        events.push("list");
        if (options.failList) throw new RoomManagementError("ROOM_OPERATION_FAILED", "falló listado");
        return { roomTypes: structuredClone(roomTypes), rooms: structuredClone(rooms), serviceCount: 6 };
      },
      async findRoom(id) {
        events.push(`room:find:${id}`);
        return structuredClone(rooms.find((room) => room.id === id) ?? null);
      },
      async findRoomType(id) {
        events.push(`type:find:${id}`);
        return structuredClone(roomTypes.find((roomType) => roomType.id === id) ?? null);
      },
      async createRoom(input) {
        events.push("room:create");
        const room = {
          id: ROOM_ID,
          ...structuredClone(input),
          status: "out_of_service",
          bedCapacity: 0,
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

test("routes use session-bound clients, RLS permissions and no privileged key", async () => {
  const [roomsRoute, roomRoute, statusRoute, typesRoute, typeRoute, repository, core, api] = await Promise.all([
    read("app/api/admin/rooms/route.ts"),
    read("app/api/admin/rooms/[id]/route.ts"),
    read("app/api/admin/rooms/[id]/status/route.ts"),
    read("app/api/admin/room-types/route.ts"),
    read("app/api/admin/room-types/[id]/route.ts"),
    read("app/admin/data/supabase-room-management-repository.ts"),
    read("app/admin/data/room-management-core.ts"),
    read("app/lib/room-management-api.ts"),
  ]);
  const source = roomsRoute + roomRoute + statusRoute + typesRoute + typeRoute + repository + core;
  assert.match(source, /getStaffSession/);
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /assertSameOrigin/);
  assert.match(source, /rooms\.inventory_manage/);
  assert.match(source, /rooms\.manage/);
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
