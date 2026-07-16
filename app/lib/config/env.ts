import { z } from "zod";

const appModeSchema = z.enum(["demo", "production"]);

const publicSupabaseSchema = z.object({
  url: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida.")
    .refine((value) => value.startsWith("https://"), "Supabase debe utilizar HTTPS."),
  publishableKey: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no parece válida."),
});

const serverSupabaseSchema = publicSupabaseSchema.extend({
  secretKey: z
    .string()
    .min(20, "La clave privada de Supabase no parece válida."),
});

export type AppMode = z.infer<typeof appModeSchema>;
export type PublicSupabaseConfig = z.infer<typeof publicSupabaseSchema>;
export type ServerSupabaseConfig = z.infer<typeof serverSupabaseSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly issues: string[];

  constructor(scope: string, issues: string[]) {
    super(`Configuración incompleta para ${scope}: ${issues.join(" ")}`);
    this.name = "EnvironmentConfigurationError";
    this.issues = issues;
  }
}

export function getAppMode(): AppMode {
  const result = appModeSchema.safeParse(process.env.APP_MODE);
  if (result.success) return result.data;

  if (process.env.NODE_ENV === "development") return "demo";

  throw new EnvironmentConfigurationError("APP_MODE", [
    "Definí APP_MODE=demo o APP_MODE=production.",
  ]);
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const result = publicSupabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      "Supabase público",
      result.error.issues.map((issue) => issue.message),
    );
  }

  return result.data;
}

export function getServerSupabaseConfig(): ServerSupabaseConfig {
  const publicConfig = getPublicSupabaseConfig();
  const result = serverSupabaseSchema.safeParse({
    ...publicConfig,
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      "Supabase server-side",
      result.error.issues.map((issue) => issue.message),
    );
  }

  return result.data;
}

export function assertProductionEnvironment(): void {
  if (getAppMode() !== "production") return;

  getServerSupabaseConfig();

  const siteUrl = z
    .string()
    .url("NEXT_PUBLIC_SITE_URL debe ser una URL válida.")
    .refine((value) => value.startsWith("https://"), "El sitio productivo debe utilizar HTTPS.")
    .safeParse(process.env.NEXT_PUBLIC_SITE_URL);

  if (!siteUrl.success) {
    throw new EnvironmentConfigurationError(
      "sitio productivo",
      siteUrl.error.issues.map((issue) => issue.message),
    );
  }
}
