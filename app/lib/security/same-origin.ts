import "server-only";

import { headers } from "next/headers";

export async function assertSameOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const fetchSite = requestHeaders.get("sec-fetch-site");

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new Error("Solicitud no autorizada.");
  }
  if (!origin || !host) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Solicitud no autorizada.");
  }
  if (originHost !== host) throw new Error("Solicitud no autorizada.");
}
