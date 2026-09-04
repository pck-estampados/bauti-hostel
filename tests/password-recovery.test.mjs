import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("password recovery uses the configured HTTPS site and a dedicated callback flow", async () => {
  const source = await readSource("app/recuperar-acceso/page.tsx");
  assert.match(source, /process\.env\.NEXT_PUBLIC_SITE_URL \?\? window\.location\.origin/);
  assert.match(source, /new URL\("\/auth\/callback", siteUrl\)/);
  assert.match(source, /searchParams\.set\("flow", "recovery"\)/);
  assert.doesNotMatch(source, /localhost:3000/);
});

test("callback exchanges the one-time code and sends recovery errors to a safe page", async () => {
  const source = await readSource("app/auth/callback/route.ts");
  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /\/actualizar-clave\?recovery=1/);
  assert.match(source, /\/recuperar-acceso\?error=invalid_or_expired/);
  assert.doesNotMatch(source, /error_description|access_token|refresh_token/);
});

test("new-password form requires a valid user session and signs out after the update", async () => {
  const source = await readSource("app/actualizar-clave/page.tsx");
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /const isRecovery = searchParams\.get\("recovery"\) === "1"/);
  assert.match(source, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(source, /supabase\.auth\.signOut\(\)/);
  assert.match(source, /router\.replace\("\/acceso-interno\?password=updated"\)/);
  assert.doesNotMatch(source, /console\.|localStorage|searchParams\.set\([^)]*password/);
});
