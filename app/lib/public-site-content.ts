import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";
import { getPublicSupabaseConfig } from "@/app/lib/config/env";
import { CORE_GENERAL, CORE_POLICIES, CORE_SCHEDULES } from "@/app/lib/core-settings";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

const string = z.string().nullable();
const publicSiteRowSchema = z.object({
  hostel_name: string, descriptor: string, phone: string, whatsapp: string,
  address: string, city: string, province: string, country: string,
  check_in_from: string, check_in_until: string, check_out_until: string,
  courtesy_checkout_until: string, courtesy_requires_approval: z.literal(true),
  breakfast_from: string, breakfast_until: string, quiet_hours_from: string, quiet_hours_until: string,
  cancellation_policy: string, minors_policy: string, pets_policy: string,
  resident_pets_disclosure: string, smoking_policy: string, quiet_hours_policy: string,
});

export const PUBLIC_SITE_FALLBACK: PublicSiteContent = {
  name: CORE_GENERAL.name, descriptor: CORE_GENERAL.descriptor,
  phone: CORE_GENERAL.phone, whatsapp: CORE_GENERAL.whatsapp,
  address: CORE_GENERAL.address, city: CORE_GENERAL.city,
  province: CORE_GENERAL.province, country: CORE_GENERAL.country,
  ...CORE_SCHEDULES,
  policies: {
    cancellation: CORE_POLICIES.cancellation, minors: CORE_POLICIES.minors,
    pets: CORE_POLICIES.pets, residentPetsDisclosure: CORE_POLICIES.residentPetsDisclosure,
    smoking: CORE_POLICIES.smoking, quietHours: CORE_POLICIES.quietHours,
  },
};

function fromRpcRow(row: z.infer<typeof publicSiteRowSchema>): PublicSiteContent {
  return {
    name: row.hostel_name ?? CORE_GENERAL.name, descriptor: row.descriptor ?? CORE_GENERAL.descriptor,
    phone: row.phone ?? "", whatsapp: row.whatsapp ?? "", address: row.address ?? CORE_GENERAL.address,
    city: row.city ?? CORE_GENERAL.city, province: row.province ?? CORE_GENERAL.province,
    country: row.country ?? CORE_GENERAL.country,
    checkInFrom: row.check_in_from ?? CORE_SCHEDULES.checkInFrom, checkInUntil: row.check_in_until ?? "",
    checkOutUntil: row.check_out_until ?? CORE_SCHEDULES.checkOutUntil,
    courtesyCheckoutUntil: row.courtesy_checkout_until ?? CORE_SCHEDULES.courtesyCheckoutUntil,
    courtesyRequiresApproval: true,
    breakfastFrom: row.breakfast_from ?? CORE_SCHEDULES.breakfastFrom,
    breakfastUntil: row.breakfast_until ?? CORE_SCHEDULES.breakfastUntil,
    quietHoursFrom: row.quiet_hours_from ?? CORE_SCHEDULES.quietHoursFrom,
    quietHoursUntil: row.quiet_hours_until ?? CORE_SCHEDULES.quietHoursUntil,
    policies: {
      cancellation: row.cancellation_policy ?? "", minors: row.minors_policy ?? CORE_POLICIES.minors,
      pets: row.pets_policy ?? CORE_POLICIES.pets, residentPetsDisclosure: row.resident_pets_disclosure ?? "",
      smoking: row.smoking_policy ?? CORE_POLICIES.smoking, quietHours: row.quiet_hours_policy ?? CORE_POLICIES.quietHours,
    },
  };
}

async function loadPublicSiteContent(): Promise<PublicSiteContent> {
  try {
    const { url, publishableKey } = getPublicSupabaseConfig();
    const supabase = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await supabase.rpc("get_public_site_configuration_v127");
    if (error) return PUBLIC_SITE_FALLBACK;
    const parsed = z.array(publicSiteRowSchema).safeParse(data);
    if (!parsed.success || !parsed.data[0]) return PUBLIC_SITE_FALLBACK;
    return fromRpcRow(parsed.data[0]);
  } catch { return PUBLIC_SITE_FALLBACK; }
}
export const getPublicSiteContent = cache(loadPublicSiteContent);
