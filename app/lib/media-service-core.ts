import type { MediaAsset, MediaUploadTicket } from "./media-types.ts";
import {
  assertPublishableState,
  buildMediaStoragePath,
  MediaValidationError,
  type MediaFinalize,
  type MediaUpdate,
  type MediaUploadFile,
  type MediaUploadMetadata,
  validateMediaFile,
  validateMediaUploadIntent,
} from "./media-validation.ts";

type FinalizedMediaFile = {
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  active: boolean;
  isPublished: boolean;
};

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
  finalizeStaging: (id: string, input: FinalizedMediaFile) => Promise<MediaAsset>;
  update: (id: string, input: MediaUpdate) => Promise<MediaAsset>;
  deleteRow: (id: string) => Promise<void>;
};

export type MediaStorage = {
  createSignedUpload: (path: string) => Promise<{ token: string }>;
  download: (path: string) => Promise<{
    type: string;
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }>;
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

function isPendingVerification(asset: MediaAsset) {
  return asset.sizeBytes === 1 && asset.width === 1 && asset.height === 1;
}

export function createMediaService(dependencies: {
  repository: MediaRepository;
  storage: MediaStorage;
  randomUUID?: () => string;
}) {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());

  return {
    async prepareUpload(
      file: Pick<MediaUploadFile, "name" | "type" | "size">,
      metadata: MediaUploadMetadata,
    ): Promise<MediaUploadTicket> {
      assertPublishableState(metadata);
      const validated = validateMediaUploadIntent(file);
      const storagePath = buildMediaStoragePath(randomUUID(), validated.mimeType);
      const staging = await dependencies.repository.createStaging({
        storagePath,
        originalFilename: validated.originalFilename,
        mimeType: validated.mimeType,
        // Sentinel values keep unverified objects inactive and distinguishable.
        sizeBytes: 1,
        width: 1,
        height: 1,
        altText: metadata.altText,
        caption: metadata.caption,
        category: metadata.category,
        sortOrder: metadata.sortOrder,
        roomId: metadata.roomId,
      });

      try {
        const signedUpload = await dependencies.storage.createSignedUpload(storagePath);
        return {
          assetId: staging.id,
          storagePath,
          token: signedUpload.token,
        };
      } catch {
        try {
          await dependencies.repository.deleteRow(staging.id);
        } catch {
          throw new MediaOperationError(
            "No se pudo preparar la carga y quedó un registro inactivo pendiente de limpieza.",
            true,
          );
        }
        throw new MediaOperationError("No se pudo preparar la carga segura en Storage.");
      }
    },

    async finalizeUpload(id: string, state: MediaFinalize) {
      const current = await dependencies.repository.getById(id);
      assertPublishableState({ ...state, altText: current.altText });

      let storedFile: Awaited<ReturnType<MediaStorage["download"]>>;
      try {
        storedFile = await dependencies.storage.download(current.storagePath);
      } catch {
        throw new MediaOperationError(
          "El archivo no pudo verificarse y el registro permanece inactivo. Podés reintentar o eliminarlo.",
          true,
        );
      }

      const validated = await validateMediaFile({
        name: current.originalFilename,
        type: storedFile.type,
        size: storedFile.size,
        arrayBuffer: storedFile.arrayBuffer,
      });
      if (validated.mimeType !== current.mimeType) {
        throw new MediaValidationError(
          "El tipo MIME almacenado no coincide con la carga autorizada.",
        );
      }

      try {
        return await dependencies.repository.finalizeStaging(id, {
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          width: validated.width,
          height: validated.height,
          active: state.active,
          isPublished: state.isPublished,
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
      if (isPendingVerification(current) && (patch.active || patch.isPublished)) {
        throw new MediaValidationError(
          "La imagen debe superar la verificación del archivo antes de activarse.",
        );
      }
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
