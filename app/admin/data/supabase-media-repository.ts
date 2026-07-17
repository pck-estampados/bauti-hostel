import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaAsset, MediaRoomOption, MediaSnapshot } from "@/app/lib/media-types";
import type { MediaRepository, MediaStorage } from "@/app/lib/media-service-core";
import { MEDIA_BUCKET, type MediaUpdate } from "@/app/lib/media-validation";

type MediaRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  alt_text: string;
  caption: string | null;
  category: MediaAsset["category"];
  sort_order: number;
  is_published: boolean;
  active: boolean;
  room_id: string | null;
  created_at: string;
  updated_at: string;
};

type RoomRow = { id: string; code: string; display_name: string };

const MEDIA_SELECTION = [
  "id",
  "storage_path",
  "original_filename",
  "mime_type",
  "size_bytes",
  "width",
  "height",
  "alt_text",
  "caption",
  "category",
  "sort_order",
  "is_published",
  "active",
  "room_id",
  "created_at",
  "updated_at",
].join(",");

export class MediaSchemaNotReadyError extends Error {
  constructor() {
    super("La migración de la galería todavía no está aplicada.");
    this.name = "MediaSchemaNotReadyError";
  }
}

export class MediaAssetNotFoundError extends Error {
  constructor() {
    super("La imagen solicitada no existe.");
    this.name = "MediaAssetNotFoundError";
  }
}

export function isMediaSchemaMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return ["42P01", "PGRST200", "PGRST204", "PGRST205"].includes(error.code ?? "")
    || /media_assets|schema cache/i.test(error.message ?? "");
}

function throwDatabaseError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): void {
  if (!error) return;
  if (isMediaSchemaMissing(error)) throw new MediaSchemaNotReadyError();
  if (error.code === "PGRST116") throw new MediaAssetNotFoundError();
  throw new Error(fallback);
}

function roomOptions(rows: RoomRow[]): MediaRoomOption[] {
  return rows.map((room) => ({
    id: room.id,
    code: room.code,
    displayName: room.display_name,
  }));
}

function mediaAsset(row: MediaRow, rooms: MediaRoomOption[] = []): MediaAsset {
  return {
    id: row.id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    altText: row.alt_text,
    caption: row.caption,
    category: row.category,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    active: row.active,
    roomId: row.room_id,
    roomName: rooms.find((room) => room.id === row.room_id)?.displayName ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function updatePayload(input: MediaUpdate) {
  const payload: Record<string, unknown> = {};
  if (input.altText !== undefined) payload.alt_text = input.altText;
  if (input.caption !== undefined) payload.caption = input.caption;
  if (input.category !== undefined) payload.category = input.category;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) payload.is_published = input.isPublished;
  if (input.active !== undefined) payload.active = input.active;
  if (input.roomId !== undefined) payload.room_id = input.roomId;
  return payload;
}

export class SupabaseMediaRepository implements MediaRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async loadRooms() {
    const result = await this.client
      .from("rooms")
      .select("id,code,display_name")
      .eq("active", true)
      .order("code");
    throwDatabaseError(result.error, "No fue posible cargar las habitaciones disponibles.");
    return roomOptions((result.data ?? []) as RoomRow[]);
  }

  async loadSnapshot(): Promise<MediaSnapshot> {
    const [assetsResult, rooms] = await Promise.all([
      this.client.from("media_assets").select(MEDIA_SELECTION).order("sort_order").order("created_at"),
      this.loadRooms(),
    ]);

    if (isMediaSchemaMissing(assetsResult.error)) {
      return { schemaReady: false, assets: [], rooms };
    }
    throwDatabaseError(assetsResult.error, "No fue posible cargar la galería.");

    return {
      schemaReady: true,
      assets: ((assetsResult.data ?? []) as unknown as MediaRow[]).map((row) => mediaAsset(row, rooms)),
      rooms,
    };
  }

  async createStaging(input: Parameters<MediaRepository["createStaging"]>[0]) {
    const result = await this.client
      .from("media_assets")
      .insert({
        storage_path: input.storagePath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        alt_text: input.altText,
        caption: input.caption,
        category: input.category,
        sort_order: input.sortOrder,
        room_id: input.roomId,
        active: false,
        is_published: false,
      })
      .select(MEDIA_SELECTION)
      .single();
    throwDatabaseError(result.error, "No fue posible preparar la imagen.");
    return mediaAsset(result.data as unknown as MediaRow);
  }

  async getById(id: string) {
    const result = await this.client
      .from("media_assets")
      .select(MEDIA_SELECTION)
      .eq("id", id)
      .single();
    throwDatabaseError(result.error, "No fue posible cargar la imagen.");
    return mediaAsset(result.data as unknown as MediaRow);
  }

  async update(id: string, input: MediaUpdate) {
    const result = await this.client
      .from("media_assets")
      .update(updatePayload(input))
      .eq("id", id)
      .select(MEDIA_SELECTION)
      .single();
    throwDatabaseError(result.error, "No fue posible actualizar la imagen.");
    return mediaAsset(result.data as unknown as MediaRow);
  }

  async deleteRow(id: string) {
    const result = await this.client.from("media_assets").delete().eq("id", id);
    throwDatabaseError(result.error, "No fue posible eliminar el registro de la imagen.");
  }
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; upsert: false },
  ) {
    const { error } = await this.client.storage.from(MEDIA_BUCKET).upload(path, bytes, {
      contentType: options.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error("No fue posible cargar el archivo.");
  }

  async remove(path: string) {
    const { error } = await this.client.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) throw new Error("No fue posible eliminar el archivo.");
  }
}
