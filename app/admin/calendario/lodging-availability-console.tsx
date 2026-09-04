"use client";
import { useState, useTransition } from "react";
import { LODGING_REASONS, lodgingMoney, type AdminLodgingAvailability, type LodgingRequest } from "@/app/lib/lodging";
import { lodgingMutation } from "../data/lodging-client";
import { useOperations } from "../components/operations-provider";

export function LodgingAvailabilityConsole() {
  const { permissions, mode } = useOperations();
  const [result, setResult] = useState<AdminLodgingAvailability | null>(null);
  const [request, setRequest] = useState<LodgingRequest | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const canRead = permissions.includes("availability.read");
  const canHold = permissions.includes("availability.manage");
  const canBlock = permissions.includes("rooms.inventory_manage");
  if (!canRead && mode !== "demo") return null;
  async function query(value: LodgingRequest) {
    const params = new URLSearchParams({ checkIn: value.checkIn, checkOut: value.checkOut, adults: String(value.adults), children: String(value.children), ...(value.category ? { category: value.category } : {}) });
    const response = await fetch(`/api/admin/lodging?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setResult(data); setRequest(value);
  }
  function run(work: () => Promise<void>) { setMessage(""); start(async () => { try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo consultar."); } }); }
  return <section className="admin-lodging-panel" aria-labelledby="lodging-availability"><h2 id="lodging-availability">Disponibilidad y holds por categoría</h2><p>Consulta transaccional de alojamiento, sin reemplazar la agenda de wellness. La salida no ocupa una noche adicional.</p>
    {message && <p role="alert" className="admin-lodging-notice">{message}</p>}
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => query({ checkIn: String(f.get("checkIn")), checkOut: String(f.get("checkOut")), adults: Number(f.get("adults")), children: Number(f.get("children")), ...(f.get("category") ? { category: String(f.get("category")) } : {}) })); }}><fieldset className="admin-lodging-fields" disabled={busy || mode === "demo"}><legend>Consultar rango</legend>
      <label>Ingreso<input type="date" name="checkIn" required /></label><label>Salida<input type="date" name="checkOut" required /></label><label>Adultos<input type="number" name="adults" required min="1" max="30" defaultValue="1" /></label><label>Menores<input type="number" name="children" required min="0" max="29" defaultValue="0" /></label><label>Código de categoría (opcional)<input name="category" pattern="[a-z0-9][a-z0-9_-]{1,49}" /></label><button className="admin-button admin-button--primary">{busy ? "Consultando…" : "Consultar disponibilidad"}</button>
    </fieldset></form>
    {result && <><div className="admin-lodging-cards">{result.categories.map((c) => <article key={c.category}><h3>{c.public_name}</h3><p>{c.eligible_room_count} habitaciones elegibles · {c.quote.total === null ? "Sin cotización completa" : lodgingMoney(c.quote.total)}</p>{c.reasons.map((reason) => <p key={reason}>{LODGING_REASONS[reason] ?? "No disponible"}</p>)}<details><summary>Detalle nocturno y huecos de tarifa</summary>{c.quote.nights.map((n) => <p key={n.date}>{n.date}: {n.final_amount === null ? "Sin tarifa" : lodgingMoney(n.final_amount)} · {n.rate_source}</p>)}</details>
      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (!request) return; run(async () => { await lodgingMutation("hold", { request: { ...request, category: c.category }, source: f.get("source") }); await query(request); }); }}><label>Canal del hold<select name="source" disabled={!canHold || busy}><option value="admin">Administración</option><option value="whatsapp">WhatsApp</option><option value="phone">Teléfono</option><option value="walk_in">Walk-in</option><option value="instagram">Instagram</option><option value="referral">Recomendación</option><option value="other">Otro</option></select></label><button className="admin-button admin-button--secondary" disabled={!canHold || !c.available || busy}>Crear hold temporal</button></form>
    </article>)}</div>
    {!result.categories.length && <p role="status">No hay categorías con venta habilitada. Completá inventario y tarifas desde Configuración.</p>}
    <h3>Habitaciones físicas</h3>{!result.rooms.length ? <p>Todavía no hay habitaciones configuradas. Completá el inventario desde Configuración.</p> : <div className="admin-lodging-cards">{result.rooms.map((r) => <article key={r.id}><h4>{r.name} · {r.code}</h4><p>{LODGING_REASONS[r.state] ?? "No disponible"}</p>{canBlock && <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (!request) return; run(async () => { await lodgingMutation("block", { roomId: r.id, checkIn: request.checkIn, checkOut: request.checkOut, reason: f.get("reason") }); await query(request); }); }}><label>Motivo de bloqueo<input name="reason" required minLength={2} maxLength={500} /></label><button disabled={busy || ["RESERVED", "BLOCKED", "HELD"].includes(r.state)} className="admin-button admin-button--secondary">Bloquear rango consultado</button></form>}</article>)}</div>}
    <h3>Holds del período</h3>{result.holds.length ? <ul>{result.holds.map((h) => <li key={h.id}>{h.category} · {h.checkIn} a {h.checkOut} · {h.source} · {h.status} · vence {new Date(h.expiresAt).toLocaleString("es-AR")}{h.status === "ACTIVE" && <button disabled={!canHold || busy} onClick={() => run(async () => { await lodgingMutation("cancelHold", {}, h.id); if (request) await query(request); })}>Cancelar hold</button>}</li>)}</ul> : <p>No hay holds en este período.</p>}</>}
  </section>;
}
