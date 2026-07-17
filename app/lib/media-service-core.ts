import type { MediaAsset } from "./media-types.ts";
import {
  assertPublishableState,
  buildMediaStoragePath,
  type MediaUpdate,
  type MediaUploadFile,
  type MediaUploadMetadata,
  validateMediaFile,
} from "./media-validation.ts";

export type MediaRepository = {
  createStaging: (input: {
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    altText: string;
    caption: string | null;
    category: MediaUploadMetadata["category"];
    sortOrder: number;
    roomId: string | null;
  }) => Promise<MediaAsset>;
  getById: (id: string) => Promise<MediaAsset>;
  update: (id: string, input: MediaUpdate) => Promise<MediaAsset>;
  deleteRow: (id: string) => Promise<void>;
};

export type MediaStorage = {
  upload: (
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; upsert: false },
  ) => Promise<void>;
  remove: (path: string) => Promise<void>;
};

export class MediaOperationError extends Error {
  readonly code: "MEDIA_OPERATION_FAILED" | "MEDIA_PARTIAL_FAILURE";
  readonly partial: boolean;

  constructor(message: string, partial = false) {
    super(message);
    this.name = "MediaOperationError";
    this.code = partial ? "MEDIA_PARTIAL_FAILURE" : "MEDIA_OPERATION_FAILED";
    this.partial = partial;
  }
}

export function createMediaService(dependencies: {
  repository: MediaRepository;
  storage: MediaStorage;
  randomUUID?: () => string;
}) {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());

  return {
    async upload(file: MediaUploadFile, metadata: MediaUploadMetadata) {
      assertPublishableState(metadata);
      const validated = await validateMediaFile(file);
      const storagePath = buildMediaStoragePath(randomUUID(), validated.mimeType);
      const staging = await dependencies.repository.createStaging({
        storagePath,
        originalFilename: validated.originalFilename,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        width: validated.width,
        height: validated.height,
        altText: metadata.altText,
        caption: metadata.caption,
        category: metadata.category,
        sortOrder: metadata.sortOrder,
        roomId: metadata.roomId,
      });

      try {
        await dependencies.storage.upload(storagePath, validated.bytes, {
          contentType: validated.mimeType,
          upsert: false,
        });
      } catch {
        try {
          await dependencies.repository.deleteRow(staging.id);
        } catch {
          throw new MediaOperationError(
            "La carga falló y quedó un registro inactivo pendiente de limpieza.",
            true,
          );
        }
        throw new MediaOperationError("No se pudo cargar la imagen en Storage.");
      }

      try {
        return await dependencies.repository.update(staging.id, {
          active: metadata.active,
          isPublished: metadata.isPublished,
        });
      } catch {
        throw new MediaOperationError(
          "La imagen quedó almacenada e inactiva. Revisala y reintentá la activación.",
          true,
        );
      }
    },

    async update(id: string, patch: MediaUpdate) {
      const current = await dependencies.repository.getById(id);
      assertPublishableState({
        active: patch.active ?? current.active,
        isPublished: patch.isPublished ?? current.isPublished,
        altText: patch.altText ?? current.altText,
      });
      return dependencies.repository.update(id, patch);
    },

    async remove(id: string) {
      const current = await dependencies.repository.getById(id);
      try {
        await dependencies.repository.update(id, { active: false, isPublished: false });
      } catch {
        throw new MediaOperationError("No se pudo despublicar la imagen antes de eliminarla.");
      }

      try {
        await dependencies.storage.remove(current.storagePath);
      } catch {
        throw new MediaOperationError(
          "La imagen quedó despublicada, pero el archivo no pudo eliminarse. Podés reintentar.",
          true,
        );
      }

      try {
        await dependencies.repository.deleteRow(id);
      } catch {
        throw new MediaOperationError(
          "El archivo fue eliminado, pero el registro inactivo requiere un nuevo intento.",
          true,
        );
      }
    },
  };
}
