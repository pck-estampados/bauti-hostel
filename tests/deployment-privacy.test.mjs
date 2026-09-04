import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

// Read-only smoke checks against the real production adapter. No login, fixtures,
// demo mode, fake Supabase configuration, mutation requests or persisted cookies.
let application;
let baseUrl;

before(async () => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  socket.close();
  await once(socket, "close");
  baseUrl = `http://127.0.0.1:${port}`;
  application = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
    "start", "-H", "127.0.0.1", "-p", String(port),
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, APP_MODE: "production" },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (application.exitCode !== null) throw new Error("Production server exited before readiness.");
    try {
      if ((await fetch(`${baseUrl}/robots.txt`)).ok) return;
    } catch { /* Wait for the local listener. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Production server did not become ready.");
});

after(async () => {
  if (!application || application.exitCode !== null) return;
  application.kill();
  await Promise.race([once(application, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (application.exitCode === null) application.kill("SIGKILL");
});

const routes = ["/", "/habitaciones", "/servicios", "/galeria", "/ubicacion",
  "/preguntas-frecuentes", "/contacto", "/politicas", "/disponibilidad",
  "/reservar", "/privacidad", "/terminos", "/acceso-interno",
  "/recuperar-acceso", "/actualizar-clave"];

for (const route of routes) {
  test(`real private deployment: ${route} renders with noindex`, async () => {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(html, /Casa Albor/i);
    assert.doesNotMatch(html, /Application error|Internal Server Error|Entorno de prueba/);
  });
}

test("robots blocks the entire private release without advertising a sitemap", async () => {
  const response = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const text = await response.text();
  assert.match(text, /^User-Agent: \*\s*$/im);
  assert.match(text, /^Disallow: \/\s*$/m);
  assert.doesNotMatch(text, /^Allow:|^Sitemap:/m);
});

test("admin stays authenticated and API does not expose media without a session", async () => {
  const admin = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
  assert.equal(admin.status, 307);
  assert.match(admin.headers.get("location") ?? "", /^\/acceso-interno\?/);
  assert.equal(admin.headers.get("x-robots-tag"), "noindex, nofollow");
  const api = await fetch(`${baseUrl}/api/admin/media`, { redirect: "manual" });
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("x-robots-tag"), "noindex, nofollow");
});
