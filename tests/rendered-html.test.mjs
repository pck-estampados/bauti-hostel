import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

let application;
let baseUrl;
let applicationOutput = "";

async function availablePort() {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (application.exitCode !== null) {
      throw new Error(`Next.js terminó antes de iniciar.\n${applicationOutput}`);
    }

    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // The production server can take a few seconds to bind the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Next.js no respondió a tiempo.\n${applicationOutput}`);
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  application = spawn(
    process.execPath,
    [nextCli, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        APP_MODE: "demo",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:9",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_test_only_not_a_real_credential",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  application.stdout.on("data", (chunk) => { applicationOutput += chunk; });
  application.stderr.on("data", (chunk) => { applicationOutput += chunk; });
  await waitUntilReady();
});

after(async () => {
  if (!application || application.exitCode !== null) return;
  application.kill();
  await Promise.race([
    once(application, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (application.exitCode === null) application.kill("SIGKILL");
});

async function render(pathname = "/", requestHeaders = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { accept: "text/html", ...requestHeaders },
    redirect: "manual",
  });
}

test("renders the real Casa Albor public home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Casa Albor \| Casa boutique en Ezeiza<\/title>/i);
  assert.match(html, /Casa boutique · Estadías &amp; Experiencias/i);
  assert.match(html, /casa-albor-(?:logo|isotipo)/i);
  assert.match(html, /Descansá cerca/);
  assert.match(html, /Consultar por WhatsApp/);
  assert.match(html, /Uruguayana 235/);
  assert.match(html, /Desde[\s\S]{0,20}(?:\$|ARS)[\s\S]{0,10}60\.000[\s\S]{0,40}por habitaci.n\/noche/i);
  assert.match(html, /5491128064272/);
  assert.doesNotMatch(html, /50\.000|50000/);
  assert.match(html, /Consultá si hay una opción para tu estadía/);
  assert.match(html, /Cómo llegar/);
  assert.doesNotMatch(
    html,
    /\bDEMO\b|Your site is taking shape|Codex is working|codex-preview|Pendiente de carga|Habitación Matrimonial|Habitación Cuádruple|Habitación Familiar/i,
  );
});

test("server-renders every primary public route", async () => {
  const routes = [
    "/habitaciones",
    "/servicios",
    "/galeria",
    "/ubicacion",
    "/preguntas-frecuentes",
    "/contacto",
    "/reservar",
    "/politicas",
    "/privacidad",
    "/terminos",
  ];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, `Expected ${route} to render`);
    const html = await response.text();
    assert.match(html, /Casa Albor/);
    assert.doesNotMatch(html, /\bDEMO\b|Pendiente de carga|contenido ficticio/i);
  }
});

test("renders the public gallery empty without fictitious images or authentication", async () => {
  const response = await render("/galeria");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Las fotografías reales estarán disponibles próximamente/);
  assert.match(html, /Pedir fotos por WhatsApp/);
  assert.match(html, /Ver Instagram/);
  assert.doesNotMatch(html, /hostel-media\/gallery\/[0-9a-f-]+\.(?:jpg|png|webp)|Habitación Matrimonial|imagen demo|placeholder/i);
  assert.doesNotMatch(html, /acceso-interno|Iniciar sesión/i);
});

test("does not publish the removed sample room URLs", async () => {
  const response = await render("/habitaciones/habitacion-matrimonial-demo");
  assert.equal(response.status, 404);
});

test("keeps the availability handoff transparent", async () => {
  const response = await render(
    "/disponibilidad?name=Daniel&checkin=2026-08-10&checkout=2026-08-12&adults=2&children=0",
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Consulta lista/);
  assert.match(html, /10 de agosto de 2026/);
  assert.match(html, /Consultar disponibilidad por WhatsApp/);
  assert.match(html, /Fecha%20de%20ingreso%3A%2010%2F08%2F2026/);
  assert.match(html, /Nombre%3A%20Daniel/);
  assert.match(html, /Cantidad%20de%20hu%C3%A9spedes%3A%202/);
  assert.match(html, /wa\.me\/5491128064272/);
  assert.doesNotMatch(html, /Reserva confirmada|Pago aprobado/);
});

test("renders public schedules and policies from the safe source with documented fallback", async () => {
  const [locationResponse, policiesResponse, publicContentSource] = await Promise.all([
    render("/ubicacion"),
    render("/politicas"),
    readFile(new URL("../app/lib/public-site-content.ts", import.meta.url), "utf8"),
  ]);
  const locationHtml = await locationResponse.text();
  const policiesHtml = await policiesResponse.text();

  assert.equal(locationResponse.status, 200);
  assert.equal(policiesResponse.status, 200);
  assert.match(locationHtml, /08:00[\s\S]{0,40}a[\s\S]{0,40}22:00/);
  assert.match(policiesHtml, /Horario de descanso[\s\S]{0,120}De \d{2}:\d{2} a \d{2}:\d{2}/);
  assert.match(publicContentSource, /quietHoursFrom: "23:00"/);
  assert.match(publicContentSource, /quietHoursUntil: "08:00"/);
  assert.match(locationHtml, /rel="canonical" href="http:\/\/localhost:3000\/ubicacion"/);
  assert.match(policiesHtml, /Las mascotas se admiten/);
  assert.doesNotMatch(
    locationHtml + policiesHtml,
    /Application error|Internal Server Error|stack trace/i,
  );
});

test("publishes a public-only sitemap and protective robots rules", async () => {
  const [sitemapResponse, robotsResponse] = await Promise.all([
    render("/sitemap.xml"),
    render("/robots.txt"),
  ]);
  const sitemapXml = await sitemapResponse.text();
  const robotsTxt = await robotsResponse.text();

  assert.equal(sitemapResponse.status, 200);
  assert.equal(robotsResponse.status, 200);
  assert.match(sitemapXml, /http:\/\/localhost:3000\/contacto/);
  assert.doesNotMatch(sitemapXml, /\/admin|\/acceso-interno/);
  assert.match(robotsTxt, /Disallow: \/admin/);
  assert.match(robotsTxt, /Disallow: \/acceso-interno/);
  assert.match(robotsTxt, /Sitemap: http:\/\/localhost:3000\/sitemap.xml/);
});

test("server-renders the complete configuration experience without enabling writes in demo mode", async () => {
  const response = await render("/admin/configuracion");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Avance de Casa Albor/);
  assert.match(html, /Configuraci.n terminada/);
  assert.match(html, /Tipos de habitaci.n/);
  assert.match(html, /Camas y capacidades/);
  assert.match(html, /Servicios por habitaci.n/);
  assert.match(html, /Usuarios y roles/);
  assert.match(html, /Esta vista es s.lo informativa en modo demo/);
  assert.match(html, /no incluye ba.o privado/i);
});

test("server-renders the managed gallery empty and disables writes before migration", async () => {
  const response = await render("/admin/galeria");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Galería pendiente de habilitación/);
  assert.match(html, /Todavía no hay fotografías cargadas/);
  assert.match(html, /Cargar fotografía/);
  assert.match(html, /fieldset disabled/);
  assert.doesNotMatch(html, /hostel-media\/gallery\/[0-9a-f-]+\.(?:jpg|png|webp)/i);
});

test("server-renders the isolated operational dashboard in explicit demo mode", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Todo lo importante, a primera vista/);
  assert.match(html, /Registrar ingreso sin reserva/);
  assert.match(html, /Entorno de prueba/);
  assert.match(html, /Todos los huéspedes, habitaciones, importes y operaciones del panel son ficticios/);
});
