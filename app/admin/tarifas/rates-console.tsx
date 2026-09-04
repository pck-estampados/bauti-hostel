"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { AdminPageHeader, EmptyState } from "../components/ui";
import { lodgingMoney, lodgingRateSchema, type LodgingRate, type LodgingSnapshot } from "@/app/lib/lodging";
import { lodgingMutation } from "../data/lodging-client";

const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const kinds = { day: "Regla diaria", promotion: "Promoción", override: "Override por fecha" };
export function RatesConsole({ initial, canManage }: { initial: LodgingSnapshot; canManage: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [editing, setEditing] = useState<LodgingRate | null>(null);
  const [special, setSpecial] = useState<LodgingSnapshot["specialDates"][number] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, startTransition] = useTransition();
  const disabled = !canManage || !snapshot.schemaReady || busy;
  function save(action: string, input: unknown, id?: string) {
    setMessage("");
    startTransition(async () => {
      try {
        await lodgingMutation(action, input, id);
        const response = await fetch("/api/admin/lodging", { cache: "no-store" });
        if (!response.ok) throw new Error("Se guardó el cambio, pero no se pudo actualizar la vista. Recargá antes de continuar.");
        setSnapshot(await response.json());
        setEditing(null); setSpecial(null); setFormKey((v) => v + 1);
        setFailed(false); setMessage("Cambios guardados.");
      } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    });
  }
  function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = lodgingRateSchema.safeParse({ categoryId: form.get("categoryId"), name: form.get("name"), kind: form.get("kind"), dayKind: form.get("dayKind"), weekdays: form.getAll("weekdays").map(Number), validFrom: form.get("validFrom"), validUntil: form.get("validUntil"), amount: form.get("amount"), minimumStay: form.get("minimumStay"), conditions: form.get("conditions"), active: form.has("active"), salesEnabled: form.has("salesEnabled") });
    if (!value.success) { setFailed(true); setMessage(value.error.issues.map((i) => i.message).join(" ")); return; }
    save("rate", value.data, editing?.id);
  }
  return <>
    <AdminPageHeader eyebrow="Gerencia · alojamiento" title="Categorías y tarifas" description="Precio por categoría y por noche. La habitación física se asigna dentro del motor de disponibilidad." actions={<Link className="admin-button admin-button--secondary" href="/admin/calendario">Consultar disponibilidad</Link>} />
    {!snapshot.schemaReady && <p className="admin-lodging-notice" role="status">El módulo de tarifas no está disponible en esta conexión. No se habilitarán escrituras hasta confirmar el esquema.</p>}
    {message && <p className="admin-lodging-notice" role={failed ? "alert" : "status"}>{message}</p>}
    <section className="admin-lodging-panel" aria-labelledby="lodging-categories"><h2 id="lodging-categories">Categorías comerciales</h2>
      <p>Las categorías y capacidades se administran en Inventario. Habilitar la venta no reemplaza la configuración de camas, habitaciones ni tarifas.</p>
      {snapshot.categories.length ? <div className="admin-lodging-cards">{snapshot.categories.map((c) => <article key={c.id}><h3>{c.name}</h3><p>{c.code} · hasta {c.capacity} personas</p><p>{c.active ? "Activa" : "Inactiva"} · {c.salesEnabled ? "Venta habilitada" : "Venta deshabilitada"}</p><button className="admin-button admin-button--secondary" disabled={disabled || !c.active} onClick={() => save("categorySales", { categoryId: c.id, enabled: !c.salesEnabled })}>{c.salesEnabled ? "Deshabilitar venta" : "Habilitar venta"}</button></article>)}</div> : <EmptyState title="Sin categorías configuradas" description="Cargá primero el inventario real. No se generan habitaciones ni categorías automáticamente." action={{ href: "/admin/configuracion#tipos", label: "Abrir inventario" }} />}
    </section>
    <section className="admin-lodging-panel" aria-labelledby="lodging-rates"><h2 id="lodging-rates">Reglas y promociones</h2>
      <p>Precedencia: override de fecha → promoción aplicable → regla diaria. Sin tarifa para una noche, no hay cotización. Domingo ordinario: pendiente de configuración comercial.</p>
      <label className="admin-lodging-filter">Filtrar categoría<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Todas</option>{snapshot.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="admin-lodging-cards">{snapshot.rates.filter((r) => !categoryFilter || r.category_id === categoryFilter).map((r) => <article key={r.id}><h3>{r.name}</h3><p>{snapshot.categories.find((c) => c.id === r.category_id)?.name} · {kinds[r.kind]}</p><p>{lodgingMoney(r.amount)} / noche · {r.valid_from} a {r.valid_until ?? "sin fecha final"}</p><p>{r.active && r.sales_enabled ? "Activa para venta" : "No se aplica a ventas"} · versión {r.version}</p><button disabled={disabled} className="admin-button admin-button--secondary" onClick={() => { setEditing(r); setFormKey((v) => v + 1); document.getElementById("lodging-rate-form")?.scrollIntoView({ block: "start" }); }}>Editar regla</button></article>)}</div>
      {!snapshot.rates.length && <p role="status">Todavía no hay reglas de precio. Los valores de referencia no se cargan automáticamente.</p>}
      <form id="lodging-rate-form" key={`rate-${formKey}`} onSubmit={submitRate}>
        <h3>{editing ? `Editar: ${editing.name}` : "Nueva regla"}</h3>
        <fieldset disabled={disabled || !snapshot.categories.length} className="admin-lodging-fields"><legend>Datos tarifarios</legend>
          <label>Categoría<select name="categoryId" required defaultValue={editing?.category_id ?? ""} disabled={!!editing}><option value="">Seleccionar</option>{snapshot.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{editing && <input type="hidden" name="categoryId" value={editing.category_id} />}</label>
          <label>Nombre de la regla<input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name ?? ""} /></label>
          <label>Tipo de regla<select name="kind" defaultValue={editing?.kind ?? "day"}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Tipo de día<select name="dayKind" defaultValue={editing?.day_kind ?? "normal"}><option value="normal">Día normal</option><option value="holiday">Feriado</option><option value="special">Fecha especial</option><option value="any">Cualquier tipo (promoción / override)</option></select></label>
          <label>Vigencia desde<input type="date" name="validFrom" required defaultValue={editing?.valid_from ?? ""} /></label>
          <label>Vigencia hasta (inclusive)<input type="date" name="validUntil" defaultValue={editing?.valid_until ?? ""} /></label>
          <label>Importe ARS por noche<input type="number" name="amount" min="0.01" step="0.01" required defaultValue={editing?.amount ?? ""} /></label>
          <label>Mínimo de noches<input type="number" name="minimumStay" min="1" max="60" required defaultValue={editing?.minimum_stay ?? 1} /></label>
          <fieldset className="admin-lodging-days"><legend>Días aplicables</legend>{weekdays.map((day, i) => <label key={day}><input type="checkbox" name="weekdays" value={i + 1} defaultChecked={editing?.weekdays.includes(i + 1) ?? false} />{day}</label>)}</fieldset>
          <label className="admin-lodging-wide">Condiciones (obligatorias para promociones)<textarea name="conditions" maxLength={500} defaultValue={editing?.conditions ?? ""} /></label>
          <label className="admin-lodging-check"><input name="active" type="checkbox" defaultChecked={editing?.active ?? false} />Regla activa</label>
          <label className="admin-lodging-check"><input name="salesEnabled" type="checkbox" defaultChecked={editing?.sales_enabled ?? false} />Aplicar a ventas</label>
          <button className="admin-button admin-button--primary" type="submit">{busy ? "Guardando…" : "Guardar regla"}</button>
          {editing && <button className="admin-button admin-button--secondary" type="button" onClick={() => { setEditing(null); setFormKey((v) => v + 1); }}>Cancelar edición</button>}
        </fieldset>
      </form>
    </section>
    <section className="admin-lodging-panel" aria-labelledby="lodging-special"><h2 id="lodging-special">Feriados y fechas especiales</h2>
      <p>No se importa ningún calendario externo. “Día normal” anula el tratamiento especial de esa fecha y usa su día de semana.</p>
      {snapshot.specialDates.length ? <ul>{snapshot.specialDates.map((s) => <li key={s.date}>{s.date} · {s.name} · {s.kind} · {s.active ? "Activa" : "Inactiva"} <button disabled={disabled} type="button" onClick={() => { setSpecial(s); setFormKey((v) => v + 1); }}>Editar fecha</button></li>)}</ul> : <p>Sin fechas especiales configuradas.</p>}
      <form key={`date-${formKey}`} onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); save("specialDate", { date: form.get("date"), kind: form.get("kind"), name: form.get("name"), active: form.has("active") }); }}><fieldset disabled={disabled} className="admin-lodging-fields"><legend>{special ? "Editar fecha especial" : "Nueva fecha especial"}</legend>
        <label>Fecha<input type="date" name="date" required defaultValue={special?.date ?? ""} readOnly={!!special} /></label><label>Tratamiento<select name="kind" defaultValue={special?.kind ?? "HOLIDAY"}><option value="HOLIDAY">Feriado</option><option value="SPECIAL">Fecha especial</option><option value="NORMAL_OVERRIDE">Día normal</option></select></label>
        <label>Nombre<input name="name" minLength={2} maxLength={100} required defaultValue={special?.name ?? ""} /></label><label className="admin-lodging-check"><input type="checkbox" name="active" defaultChecked={special?.active ?? false} />Fecha activa</label><button className="admin-button admin-button--primary">Guardar fecha especial</button>
      </fieldset></form>
    </section>
    <section className="admin-lodging-panel" aria-labelledby="lodging-ttl"><h2 id="lodging-ttl">Duración de holds</h2><p>Un hold retiene temporalmente una habitación compatible. No confirma una reserva ni registra un pago. Límite técnico inicial: 120 minutos.</p>
      <form key={`ttl-${formKey}`} onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); save("settings", { webMinutes: Number(form.get("webMinutes")), adminMinutes: Number(form.get("adminMinutes")) }); }}><fieldset className="admin-lodging-fields" disabled={disabled}><legend>Vigencia máxima</legend><label>Web (minutos)<input name="webMinutes" type="number" min="1" max="120" required defaultValue={snapshot.holdSettings.webMinutes} /></label><label>Administración / WhatsApp (minutos)<input name="adminMinutes" type="number" min="1" max="120" required defaultValue={snapshot.holdSettings.adminMinutes} /></label><button className="admin-button admin-button--primary">Guardar duración</button></fieldset></form>
    </section>
  </>;
}
