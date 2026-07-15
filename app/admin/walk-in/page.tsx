"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, formatCurrency, paymentMethodLabels } from "../components/ui";
import { DEFAULT_REFERENCE_RATE_ARS, hostelDate } from "../lib/demo-data";
import { isRoomOperationallyAvailable, nightsBetween } from "../lib/operations";
import type { PaymentMethod } from "../lib/types";

export default function WalkInPage() {
  const router = useRouter();
  const { state, addWalkIn } = useOperations();
  const availableRooms = state.rooms.filter((room) => isRoomOperationallyAvailable(room.status));
  const [error, setError] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", document: "", guestCount: 1, roomId: availableRooms[0]?.id ?? "", checkIn: hostelDate(), checkOut: hostelDate(1), nightlyRate: DEFAULT_REFERENCE_RATE_ARS, amountPaid: 0, paymentMethod: "cash" as PaymentMethod, notes: "" });
  const nights = Math.max(nightsBetween(form.checkIn, form.checkOut), 0);
  const total = nights * Number(form.nightlyRate || 0);
  const balance = Math.max(total - Number(form.amountPaid || 0), 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try { addWalkIn(form); router.push("/admin/huespedes/actuales?created=walk-in"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible registrar el ingreso."); }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Recepción rápida" title="Registrar ingreso sin reserva" description="Crea una estadía de tipo walk-in y realiza el check-in en una sola operación." />
      <div className="admin-form-layout">
        <form className="admin-form-card" onSubmit={submit}>
          <div className="admin-form-section"><span>01</span><div><h2>Huésped principal</h2><p>Los datos secundarios pueden completarse después.</p></div></div>
          <div className="admin-field-grid">
            <label>Nombre<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" /></label>
            <label>Apellido<input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" /></label>
            <label>Teléfono<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
            <label>Documento <small>opcional</small><input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></label>
          </div>
          <div className="admin-form-section"><span>02</span><div><h2>Estadía</h2><p>Seleccioná una habitación operativamente disponible.</p></div></div>
          <div className="admin-field-grid">
            <label>Habitación<select required value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">Seleccionar</option>{availableRooms.map((room) => <option value={room.id} key={room.id}>{room.displayName} · hasta {room.capacity}</option>)}</select></label>
            <label>Cantidad de huéspedes<input required min="1" type="number" value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: Number(e.target.value) })} /></label>
            <label>Entrada<input required type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></label>
            <label>Salida prevista<input required type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></label>
          </div>
          <div className="admin-form-section"><span>03</span><div><h2>Tarifa y pago</h2><p>La tarifa es manual y editable; no se aplica como precio universal.</p></div></div>
          <div className="admin-field-grid">
            <label>Tarifa acordada por noche<input required min="0" step="100" type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: Number(e.target.value) })} /></label>
            <label>Monto pagado<input required min="0" step="100" type="number" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: Number(e.target.value) })} /></label>
            <label>Medio de pago<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>{Object.entries(paymentMethodLabels).filter(([key]) => !["mercado_pago", "card"].includes(key)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="admin-field--full">Observaciones<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          {!availableRooms.length ? <p className="admin-form-error" role="alert">No hay habitaciones disponibles en los datos de prueba.</p> : null}
          <button className="admin-button admin-button--primary admin-button--large" type="submit" disabled={!availableRooms.length}>Registrar y hacer check-in</button>
        </form>
        <aside className="admin-form-summary"><p>Resumen del ingreso</p><h2>{nights} noche{nights === 1 ? "" : "s"}</h2><dl><div><dt>Total acordado</dt><dd>{formatCurrency(total)}</dd></div><div><dt>Pagado</dt><dd>{formatCurrency(Number(form.amountPaid || 0))}</dd></div><div><dt>Saldo</dt><dd>{formatCurrency(balance)}</dd></div></dl><div className="admin-summary-note"><strong>Al confirmar</strong><span>El huésped quedará alojado, la habitación pasará a ocupada y la acción se registrará en auditoría.</span></div></aside>
      </div>
    </>
  );
}
