export const MEDIA_CATEGORIES = [
  "exterior",
  "recepcion",
  "habitacion",
  "pileta",
  "patio",
  "espacios_comunes",
  "desayuno",
  "otros",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  exterior: "Exterior",
  recepcion: "Recepción",
  habitacion: "Habitación",
  pileta: "Pileta",
  patio: "Patio",
  espacios_comunes: "Espacios comunes",
  desayuno: "Desayuno",
  otros: "Otros",
};

export type MediaAsset = {
  id: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  altText: string;
  caption: string | null;
  category: MediaCategory;
  sortOrder: number;
  isPublished: boolean;
  active: boolean;
  roomId: string | null;
  roomName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaRoomOption = {
  id: string;
  code: string;
  displayName: string;
};

export type MediaSnapshot = {
  schemaReady: boolean;
  assets: MediaAsset[];
  rooms: MediaRoomOption[];
};

export type PublicGalleryAsset = Pick<
  MediaAsset,
  | "id"
  | "storagePath"
  | "width"
  | "height"
  | "altText"
  | "caption"
  | "category"
  | "sortOrder"
> & {
  publicUrl: string;
};
