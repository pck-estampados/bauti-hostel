import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";
import { getPublicSupabaseConfig } from "@/app/lib/config/env";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

const publicSiteRowSchema = z.object({
  hostel_name: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  base_price_ars: z.coerce.number().positive().nullable(),
  check_in_from: z.string().nullable(),
  check_in_until: z.string().nullable(),
  check_out_until: z.string().nullable(),
  quiet_hours_from: z.string().nullable(),
  quiet_hours_until: z.string().nullable(),
  cancellation_policy: z.string().nullable(),
  minors_policy: z.string().nullable(),
  pets_policy: z.string().nullable(),
  smoking_policy: z.string().nullable(),
  quiet_hours_policy: z.string().nullable(),
});

export const PUBLIC_SITE_FALLBACK: PublicSiteContent = {
  name: "Hostel Bauti",
  phone: "+54 9 11 2806-4272",
  whatsapp: "+54 9 11 2806-4272",
  address: "Uruguayana 235",
  city: "Ezeiza",
  province: "Buenos Aires",
  basePriceArs: 60_000,
  checkInFrom: "08:00",
  checkInUntil: "22:00",
  checkOutUntil: "10:00",
  quietHoursFrom: "23:00",
  quietHoursUntil: "08:00",
  policies: {
    cancellation:
      "La reserva se confirma una vez acordadas las condiciones y, cuando corresponda, acreditado el pago solicitado. Las cancelaciones y reprogramaciones quedan sujetas a la anticipación informada al momento de reservar.",
    minors:
      "Los menores deben alojarse acompañados por una persona adulta responsable.",
    pets: "Las mascotas se admiten únicamente con consulta y confirmación previa.",
    smoking:
      "No está permitido fumar dentro de las habitaciones ni en espacios interiores. Se permite únicamente en sectores exteriores habilitados.",
    quietHours:
      "Durante el horario de descanso debe evitarse música alta, gritos y ruidos que molesten a otros huéspedes.",
  },
};

function confirmed(value: string | null, fallback: string) {
  const clean = value?.trim();
  return clean ? clean : fallback;
}

function fromRpcRow(
  row: z.infer<typeof publicSiteRowSchema>,
): PublicSiteContent {
  return {
    name: confirmed(row.hostel_name, PUBLIC_SITE_FALLBACK.name),
    phone: confirmed(row.phone, PUBLIC_SITE_FALLBACK.phone),
    whatsapp: confirmed(row.whatsapp, PUBLIC_SITE_FALLBACK.whatsapp),
    address: confirmed(row.address, PUBLIC_SITE_FALLBACK.address),
    city: confirmed(row.city, PUBLIC_SITE_FALLBACK.city),
    province: confirmed(row.province, PUBLIC_SITE_FALLBACK.province),
    basePriceArs: row.base_price_ars ?? PUBLIC_SITE_FALLBACK.basePriceArs,
    checkInFrom: confirmed(row.check_in_from, PUBLIC_SITE_FALLBACK.checkInFrom),
    checkInUntil: confirmed(row.check_in_until, PUBLIC_SITE_FALLBACK.checkInUntil),
    checkOutUntil: confirmed(row.check_out_until, PUBLIC_SITE_FALLBACK.checkOutUntil),
    quietHoursFrom: confirmed(
      row.quiet_hours_from,
      PUBLIC_SITE_FALLBACK.quietHoursFrom,
    ),
    quietHoursUntil: confirmed(
      row.quiet_hours_until,
      PUBLIC_SITE_FALLBACK.quietHoursUntil,
    ),
    policies: {
      cancellation: confirmed(
        row.cancellation_policy,
        PUBLIC_SITE_FALLBACK.policies.cancellation,
      ),
      minors: confirmed(row.minors_policy, PUBLIC_SITE_FALLBACK.policies.minors),
      pets: confirmed(row.pets_policy, PUBLIC_SITE_FALLBACK.policies.pets),
      smoking: confirmed(row.smoking_policy, PUBLIC_SITE_FALLBACK.policies.smoking),
      quietHours: confirmed(
        row.quiet_hours_policy,
        PUBLIC_SITE_FALLBACK.policies.quietHours,
      ),
    },
  };
}

async function loadPublicSiteContent(): Promise<PublicSiteContent> {
  try {
    const { url, publishableKey } = getPublicSupabaseConfig();
    const supabase = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase.rpc("get_public_site_configuration");
    if (error) return PUBLIC_SITE_FALLBACK;

    const parsed = z.array(publicSiteRowSchema).safeParse(data);
    if (!parsed.success || !parsed.data[0]) return PUBLIC_SITE_FALLBACK;
    return fromRpcRow(parsed.data[0]);
  } catch {
    return PUBLIC_SITE_FALLBACK;
  }
}

export const getPublicSiteContent = cache(loadPublicSiteContent);
