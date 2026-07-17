import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";
import { getPublicSupabaseConfig } from "@/app/lib/config/env";
import { MEDIA_CATEGORIES, type PublicGalleryAsset } from "@/app/lib/media-types";
import {
  buildPublicMediaUrl,
  MEDIA_STORAGE_PATH_PATTERN,
} from "@/app/lib/media-validation";

const publicMediaRowSchema = z.object({
  id: z.uuid(),
  storage_path: z.string().regex(MEDIA_STORAGE_PATH_PATTERN),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt_text: z.string().trim().min(1).max(300),
  caption: z.string().max(1000).nullable(),
  category: z.enum(MEDIA_CATEGORIES),
  sort_order: z.number().int(),
});

async function loadPublicGallery(): Promise<PublicGalleryAsset[]> {
  try {
    const { url, publishableKey } = getPublicSupabaseConfig();
    const supabase = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const result = await supabase
      .from("media_assets")
      .select("id,storage_path,width,height,alt_text,caption,category,sort_order")
      .order("sort_order")
      .order("id");
    if (result.error) return [];

    const parsed = z.array(publicMediaRowSchema).safeParse(result.data);
    if (!parsed.success) return [];
    return parsed.data.flatMap<PublicGalleryAsset>((row) => {
      const publicUrl = buildPublicMediaUrl(row.storage_path);
      if (!publicUrl) return [];
      return [{
        id: row.id,
        storagePath: row.storage_path,
        width: row.width,
        height: row.height,
        altText: row.alt_text,
        caption: row.caption,
        category: row.category,
        sortOrder: row.sort_order,
        publicUrl,
      }];
    });
  } catch {
    return [];
  }
}

export const getPublicGallery = cache(loadPublicGallery);
