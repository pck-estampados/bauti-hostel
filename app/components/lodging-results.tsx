"use client";
import { useState, useTransition } from "react";
import { LODGING_REASONS, lodgingMoney, type LodgingAvailability, type LodgingHold, type LodgingRequest } from "@/app/lib/lodging";

export function LodgingResults({ categories, request, ready }: { categories: LodgingAvailability[]; request: LodgingRequest; ready: boolean }) {
  const [hold, setHold] = useState<LodgingHold | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  function changeHold(category?: string) {
    start(async () => {
      setMessage("");
      try {
        const response = await fetch("/api/lodging/holds", { method: category ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(category ? { ...request, category } : { id: hold?.id }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setHold(category ? data : null);
        if (!category) setMessage("El hold ya no retiene disponibilidad. Consultá nuevamente para conocer el estado actualizado.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo completar la consulta."); }
    });
  }
  return <section className="shell lodging-results" aria-labelledby="lodging-results-title"><h2 id="lodging-results-title">Opciones para tu estadía</h2><p>Tarifa por habitación y noche según categoría. Adultos y menores cuentan para la capacidad. Esta consulta no confirma una reserva.</p>
    {message && <p role="status">{message}</p>}
    {!ready ? <p>No podemos cotizar estas fechas en este momento. Revisá el rango o contactanos; no se confirmó disponibilidad.</p> : !categories.length ? <p>El alojamiento está pendiente de configuración comercial. Todavía no hay categorías disponibles para cotizar.</p> : <div className="lodging-results-grid">{categories.map((c) => <article key={c.category}><span className="status-badge status-badge--neutral">{c.available ? "Disponible al consultar" : "No cotizable / no disponible"}</span><h3>{c.public_name}</h3><p>Hasta {c.capacity} personas</p>{c.quote.total !== null && <strong className="lodging-total">{lodgingMoney(c.quote.total)} <small>total de la estadía</small></strong>}{c.reasons.map((r) => <p key={r}>{LODGING_REASONS[r] ?? "Consultanos antes de continuar."}</p>)}<details><summary>Ver precio por noche</summary><ul>{c.quote.nights.map((n) => <li key={n.date}>{n.date}: {n.final_amount === null ? "Tarifa pendiente" : lodgingMoney(n.final_amount)}{n.adjustment === "promotion" ? " · Promoción" : n.adjustment === "override" ? " · Tarifa de fecha" : ""}</li>)}</ul></details><button className="button button--primary" disabled={!c.available || busy || !!hold} onClick={() => changeHold(c.category)}>Retener temporalmente esta categoría</button></article>)}</div>}
    {hold && <div className="lodging-hold-status" role="status"><h3>Hold temporal creado</h3><p>Retención de categoría válida hasta {new Date(hold.expiresAt).toLocaleString("es-AR")}. No es una reserva confirmada ni requiere pago en esta etapa. El vencimiento libera la habitación automáticamente.</p><button className="button button--secondary" disabled={busy} onClick={() => changeHold()}>Cancelar hold</button></div>}
  </section>;
}
