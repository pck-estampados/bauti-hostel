import { z } from "zod";

import { MEDIA_CATEGORIES } from "./media-types.ts";

export const MEDIA_BUCKET = "hostel-media";
export const MEDIA_PREFIX = "gallery";
export const MEDIA_MAX_BYTES = 6 * 1024 * 1024;
export const MEDIA_MAX_PIXELS = 50_000_000;
export const MEDIA_MAX_DIMENSION = 20_000;
export const MEDIA_PUBLIC_BASE_URL =
  "https://jduitbuzomkwmzzyrjux.supabase.co/storage/v1/object/public/hostel-media";
export const MEDIA_STORAGE_PATH_PATTERN =
  /^gallery\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type AllowedMime = keyof typeof MIME_TO_EXTENSION;

const EXTENSION_TO_MIME: Record<string, AllowedMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const nullableRoomIdSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.uuid().nullable(),
);

const nullableCaptionSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const formBooleanSchema = z.preprocess((value) => {
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "0" || value === "" || value === undefined) return false;
  return value;
}, z.boolean());

const formIntegerSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().int().min(0).max(10_000));

const editableFields = {
  altText: z.string().trim().max(300),
  caption: nullableCaptionSchema,
  category: z.enum(MEDIA_CATEGORIES),
  sortOrder: formIntegerSchema,
  isPublished: formBooleanSchema,
  active: formBooleanSchema,
  roomId: nullableRoomIdSchema,
};

export const mediaUploadMetadataSchema = z
  .object(editableFields)
  .strict()
  .superRefine((value, context) => {
    if (value.isPublished && !value.active) {
      context.addIssue({
        code: "custom",
        path: ["isPublished"],
        message: "Una imagen publicada debe estar activa.",
      });
    }
    if (value.isPublished && value.altText.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["altText"],
        message: "El texto alternativo es obligatorio para publicar.",
      });
    }
  });

export const mediaUpdateSchema = z
  .object({
    altText: editableFields.altText.optional(),
    caption: nullableCaptionSchema.optional(),
    category: editableFields.category.optional(),
    sortOrder: formIntegerSchema.optional(),
    isPublished: formBooleanSchema.optional(),
    active: formBooleanSchema.optional(),
    roomId: nullableRoomIdSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export type MediaUploadMetadata = z.infer<typeof mediaUploadMetadataSchema>;
export type MediaUpdate = z.infer<typeof mediaUpdateSchema>;

export type MediaUploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type ValidatedMediaFile = {
  bytes: Uint8Array;
  originalFilename: string;
  mimeType: AllowedMime;
  sizeBytes: number;
  width: number;
  height: number;
};

export class MediaValidationError extends Error {
  readonly code = "MEDIA_VALIDATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

function readUint16BigEndian(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function inspectPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (!hasAscii(bytes, 12, "IHDR")) throw new MediaValidationError("El archivo PNG no tiene una cabecera válida.");
  return {
    mimeType: "image/png" as const,
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20),
  };
}

function inspectJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        mimeType: "image/jpeg" as const,
        height: readUint16BigEndian(bytes, offset + 3),
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }

  throw new MediaValidationError("No se pudieron verificar las dimensiones del archivo JPEG.");
}

function inspectWebp(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    !hasAscii(bytes, 0, "RIFF") ||
    !hasAscii(bytes, 8, "WEBP")
  ) {
    return null;
  }

  if (hasAscii(bytes, 12, "VP8X")) {
    return {
      mimeType: "image/webp" as const,
      width: 1 + readUint24LittleEndian(bytes, 24),
      height: 1 + readUint24LittleEndian(bytes, 27),
    };
  }
  if (hasAscii(bytes, 12, "VP8 ") && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      mimeType: "image/webp" as const,
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
    };
  }
  if (hasAscii(bytes, 12, "VP8L") && bytes[20] === 0x2f) {
    return {
      mimeType: "image/webp" as const,
      width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
      height: 1 + ((bytes[24] & 0x0f) << 10) + (bytes[23] << 2) + ((bytes[22] & 0xc0) >> 6),
    };
  }

  throw new MediaValidationError("No se pudieron verificar las dimensiones del archivo WebP.");
}

export function inspectImage(bytes: Uint8Array) {
  const inspected = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
  if (!inspected) throw new MediaValidationError("La firma binaria no corresponde a JPEG, PNG o WebP.");
  return inspected;
}

function safeOriginalFilename(filename: string) {
  const name = filename.split(/[\\/]/).pop()?.trim() ?? "";
  if (name.length === 0 || name.length > 255) {
    throw new MediaValidationError("El nombre original del archivo no es válido.");
  }
  return name;
}

export async function validateMediaFile(file: MediaUploadFile): Promise<ValidatedMediaFile> {
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > MEDIA_MAX_BYTES) {
    throw new MediaValidationError("La imagen debe pesar como máximo 6 MB.");
  }

  const declaredMime = file.type.toLowerCase() as AllowedMime;
  if (!(declaredMime in MIME_TO_EXTENSION)) {
    throw new MediaValidationError("Sólo se admiten imágenes JPEG, PNG o WebP.");
  }

  const originalFilename = safeOriginalFilename(file.name);
  const extension = originalFilename.split(".").pop()?.toLowerCase() ?? "";
  if (EXTENSION_TO_MIME[extension] !== declaredMime) {
    throw new MediaValidationError("La extensión del archivo no coincide con su tipo MIME.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) {
    throw new MediaValidationError("El tamaño recibido no coincide con el archivo declarado.");
  }

  const inspected = inspectImage(bytes);
  if (inspected.mimeType !== declaredMime) {
    throw new MediaValidationError("La firma binaria no coincide con el tipo MIME declarado.");
  }
  if (
    inspected.width < 1 ||
    inspected.height < 1 ||
    inspected.width > MEDIA_MAX_DIMENSION ||
    inspected.height > MEDIA_MAX_DIMENSION ||
    inspected.width * inspected.height > MEDIA_MAX_PIXELS
  ) {
    throw new MediaValidationError("La imagen supera el límite de 50 megapíxeles.");
  }

  return {
    bytes,
    originalFilename,
    mimeType: declaredMime,
    sizeBytes: file.size,
    width: inspected.width,
    height: inspected.height,
  };
}

export function buildMediaStoragePath(id: string, mimeType: AllowedMime) {
  const path = `${MEDIA_PREFIX}/${id}.${MIME_TO_EXTENSION[mimeType]}`;
  if (!MEDIA_STORAGE_PATH_PATTERN.test(path)) {
    throw new MediaValidationError("No se pudo generar una ruta segura para el archivo.");
  }
  return path;
}

export function buildPublicMediaUrl(storagePath: string) {
  if (!MEDIA_STORAGE_PATH_PATTERN.test(storagePath)) return null;
  return `${MEDIA_PUBLIC_BASE_URL}/${storagePath}`;
}

export function assertPublishableState(state: {
  active: boolean;
  isPublished: boolean;
  altText: string;
}) {
  if (state.isPublished && !state.active) {
    throw new MediaValidationError("Una imagen publicada debe estar activa.");
  }
  if (state.isPublished && state.altText.trim().length === 0) {
    throw new MediaValidationError("El texto alternativo es obligatorio para publicar.");
  }
}
