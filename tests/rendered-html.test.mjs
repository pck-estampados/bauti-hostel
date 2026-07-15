import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function render(pathname = "/", requestHeaders = {}) {
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", ...requestHeaders } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the real Hostel Bauti public home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Hostel Bauti \| Alojamiento en Ezeiza<\/title>/i);
  assert.match(html, /Descansá cerca/);
  assert.match(html, /Consultar por WhatsApp/);
  assert.match(html, /Uruguayana 235/);
  assert.match(html, /Consultá la opción disponible para tu estadía/);
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
    assert.match(html, /Hostel Bauti/);
    assert.doesNotMatch(html, /\bDEMO\b|Pendiente de carga|contenido ficticio/i);
  }
});

test("does not publish the removed sample room URLs", async () => {
  const response = await render("/habitaciones/habitacion-matrimonial-demo");
  assert.equal(response.status, 404);
});

test("keeps the availability handoff transparent", async () => {
  const response = await render(
    "/disponibilidad?checkin=2026-08-10&checkout=2026-08-12&adults=2&children=0",
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Consulta lista/);
  assert.match(html, /10 de agosto de 2026/);
  assert.match(html, /Consultar disponibilidad por WhatsApp/);
  assert.match(html, /Fecha%20de%20ingreso%3A%2010%2F08%2F2026/);
  assert.match(html, /Cantidad%20de%20hu%C3%A9spedes%3A%202/);
  assert.doesNotMatch(html, /Reserva confirmada|Pago aprobado/);
});

test("protects the administration surface in production", async () => {
  const response = await render("/admin");
  assert.ok([302, 303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/signin-with-chatgpt\?return_to=/);
});

test("server-renders the operational dashboard for an authenticated user", async () => {
  const response = await render("/admin", {
    "oai-authenticated-user-email": "david@example.test",
    "oai-authenticated-user-full-name": "David%20Prueba",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Todo lo importante, a primera vista/);
  assert.match(html, /Registrar ingreso sin reserva/);
  assert.match(html, /Entorno de prueba/);
  assert.match(html, /Todos los huéspedes, habitaciones, importes y operaciones del panel son ficticios/);
});
