import assert from "node:assert/strict";
import test from "node:test";

import { createMediaService, MediaOperationError } from "../app/lib/media-service-core.ts";
import {
  assertPublishableState,
  buildMediaStoragePath,
  inspectImage,
  MEDIA_MAX_BYTES,
  MEDIA_STORAGE_PATH_PATTERN,
  MediaValidationError,
  mediaUploadMetadataSchema,
  validateMediaFile,
} from "../app/lib/media-validation.ts";
import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
} from "../app/lib/media-types.ts";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

function pngBytes(width = 640, height = 480) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function uploadFile({
  name = "hostel.png",
  type = "image/png",
  bytes = pngBytes(),
  size = bytes.byteLength,
} = {}) {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

const metadata = {
  altText: "Fachada del Hostel Bauti",
  caption: null,
  category: "recepcion",
  sortOrder: 0,
  isPublished: false,
  active: true,
  roomId: null,
};

function asset(overrides = {}) {
  return {
    id: UUID,
    storagePath: `gallery/${UUID}.png`,
    originalFilename: "hostel.png",
    mimeType: "image/png",
    sizeBytes: 24,
    width: 640,
    height: 480,
    altText: metadata.altText,
    caption: null,
    category: "recepcion",
    sortOrder: 0,
    isPublished: false,
    active: false,
    roomId: null,
    roomName: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function memoryAdapters(options = {}) {
  const events = [];
  let current = asset();
  const repository = {
    async createStaging(input) {
      events.push("row:create-inactive");
      current = asset({ ...input, id: UUID, active: false, isPublished: false });
      return current;
    },
    async getById() {
      events.push("row:get");
      return current;
    },
    async update(_id, patch) {
      events.push(`row:update:${patch.active ?? current.active}:${patch.isPublished ?? current.isPublished}`);
      if (options.failUpdate) throw new Error("update failed");
      current = { ...current, ...patch };
      return current;
    },
    async deleteRow() {
      events.push("row:delete");
      if (options.failDelete) throw new Error("delete failed");
    },
  };
  const storage = {
    async upload(path, _bytes, uploadOptions) {
      events.push(`storage:upload:${path}:${uploadOptions.upsert}`);
      if (options.failUpload) throw new Error("upload failed");
    },
    async remove(path) {
      events.push(`storage:remove:${path}`);
      if (options.failRemove) throw new Error("remove failed");
    },
  };
  return { events, repository, storage, current: () => current };
}

test("validates extension, declared MIME, binary signature and real dimensions", async () => {
  const validated = await validateMediaFile(uploadFile());
  assert.equal(validated.mimeType, "image/png");
  assert.equal(validated.width, 640);
  assert.equal(validated.height, 480);

  await assert.rejects(
    validateMediaFile(uploadFile({ name: "hostel.jpg" })),
    /extensión del archivo no coincide/i,
  );
  await assert.rejects(
    validateMediaFile(uploadFile({ name: "hostel.jpg", type: "image/jpeg" })),
    /firma binaria no coincide/i,
  );
  assert.throws(() => inspectImage(new Uint8Array([1, 2, 3, 4])), /firma binaria/i);
});

test("rejects files over 6 MB and images over 50 megapixels", async () => {
  assert.equal(MEDIA_MAX_BYTES, 6_291_456);
  await assert.rejects(
    validateMediaFile(uploadFile({ size: MEDIA_MAX_BYTES + 1 })),
    /máximo 6 MB/i,
  );
  await assert.rejects(
    validateMediaFile(uploadFile({ bytes: pngBytes(10_000, 6_000) })),
    /50 megapíxeles/i,
  );
});

test("generates only UUID-v4 gallery paths without overwrite semantics", () => {
  const path = buildMediaStoragePath(UUID, "image/png");
  assert.equal(path, `gallery/${UUID}.png`);
  assert.match(path, MEDIA_STORAGE_PATH_PATTERN);
  assert.throws(
    () => buildMediaStoragePath("123e4567-e89b-12d3-a456-426614174000", "image/png"),
    MediaValidationError,
  );
});

test("requires an active asset and alt text before publication", () => {
  assert.throws(
    () => assertPublishableState({ active: true, isPublished: true, altText: "" }),
    /texto alternativo/i,
  );
  assert.throws(
    () => assertPublishableState({ active: false, isPublished: true, altText: "Exterior" }),
    /debe estar activa/i,
  );
  assert.equal(mediaUploadMetadataSchema.safeParse({ ...metadata, isPublished: true, altText: "" }).success, false);
});

test("keeps exactly the eight approved internal categories and visible labels", () => {
  assert.deepEqual(MEDIA_CATEGORIES, [
    "exterior",
    "recepcion",
    "habitacion",
    "pileta",
    "patio",
    "espacios_comunes",
    "desayuno",
    "otros",
  ]);
  assert.deepEqual(MEDIA_CATEGORY_LABELS, {
    exterior: "Exterior",
    recepcion: "Recepción",
    habitacion: "Habitación",
    pileta: "Pileta",
    patio: "Patio",
    espacios_comunes: "Espacios comunes",
    desayuno: "Desayuno",
    otros: "Otros",
  });
  for (const category of MEDIA_CATEGORIES) {
    assert.equal(mediaUploadMetadataSchema.safeParse({ ...metadata, category }).success, true);
  }
  assert.equal(mediaUploadMetadataSchema.safeParse({ ...metadata, category: "otra_categoria" }).success, false);
});

test("uploads inactive first, never upserts and activates only after Storage succeeds", async () => {
  const adapters = memoryAdapters();
  const service = createMediaService({
    repository: adapters.repository,
    storage: adapters.storage,
    randomUUID: () => UUID,
  });
  const result = await service.upload(uploadFile(), metadata);

  assert.equal(result.active, true);
  assert.deepEqual(adapters.events, [
    "row:create-inactive",
    `storage:upload:gallery/${UUID}.png:false`,
    "row:update:true:false",
  ]);
});

test("compensates a failed upload and reports an unrecoverable cleanup as partial", async () => {
  const recoverable = memoryAdapters({ failUpload: true });
  const service = createMediaService({
    repository: recoverable.repository,
    storage: recoverable.storage,
    randomUUID: () => UUID,
  });
  await assert.rejects(service.upload(uploadFile(), metadata), (error) => {
    assert.equal(error instanceof MediaOperationError, true);
    assert.equal(error.partial, false);
    return true;
  });
  assert.deepEqual(recoverable.events.slice(-2), [
    `storage:upload:gallery/${UUID}.png:false`,
    "row:delete",
  ]);

  const partial = memoryAdapters({ failUpload: true, failDelete: true });
  const partialService = createMediaService({
    repository: partial.repository,
    storage: partial.storage,
    randomUUID: () => UUID,
  });
  await assert.rejects(partialService.upload(uploadFile(), metadata), (error) => {
    assert.equal(error.partial, true);
    assert.equal(error.code, "MEDIA_PARTIAL_FAILURE");
    return true;
  });
});

test("leaves uploaded files visible for retry when final activation fails", async () => {
  const adapters = memoryAdapters({ failUpdate: true });
  const service = createMediaService({
    repository: adapters.repository,
    storage: adapters.storage,
    randomUUID: () => UUID,
  });
  await assert.rejects(service.upload(uploadFile(), metadata), (error) => {
    assert.equal(error.partial, true);
    assert.match(error.message, /almacenada e inactiva/i);
    return true;
  });
  assert.equal(adapters.current().active, false);
});

test("depublishes before deleting through Storage API and keeps partial failures retryable", async () => {
  const adapters = memoryAdapters();
  const service = createMediaService({ repository: adapters.repository, storage: adapters.storage });
  await service.remove(UUID);
  assert.deepEqual(adapters.events, [
    "row:get",
    "row:update:false:false",
    `storage:remove:gallery/${UUID}.png`,
    "row:delete",
  ]);

  const partial = memoryAdapters({ failRemove: true });
  const partialService = createMediaService({ repository: partial.repository, storage: partial.storage });
  await assert.rejects(partialService.remove(UUID), (error) => {
    assert.equal(error.partial, true);
    return true;
  });
  assert.equal(partial.current().active, false);
  assert.equal(partial.current().isPublished, false);
});
