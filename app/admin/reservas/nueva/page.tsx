"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader, formatCurrency, paymentMethodLabels } from "../../components/ui";
import { availableRoomsForStay, findPotentialGuestMatches } from "../../data/reservation-management-core";
import { DEFAULT_REFERENCE_RATE_ARS, hostelDate } from "../../lib/demo-data";
import { formatGuestName, nightsBetween } from "../../lib/operations";
import type { PaymentMethod, ReservationSource } from "../../lib/types";

const sources: Array<[Exclude<ReservationSource, "walk_in">, string]> = [
  ["web", "Web directa"], ["whatsapp", "WhatsApp"], ["phone", "Teléfono"],
  ["booking", "Booking.com"], ["airbnb", "Airbnb"], ["instagram", "Instagram"],
  ["referral", "Recomendación"], ["other", "Otro"],
];

export default function NewReservationPage() {
  const router = useRouter();
  const { state, mode, addReservation } = useOperations();
  const [guestSearch, setGuestSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    guestId: "", firstName: "", lastName: "", phone: "", email: "", document: "",
    source: "whatsapp" as Exclude<ReservationSource, "walk_in">,
    checkIn: hostelDate(), checkOut: hostelDate(1), guestCount: 1, roomId: "", expectedArrival: "",
    nightlyRate: mode === "demo" ? DEFAULT_REFERENCE_RATE_ARS : 0,
    amountPaid: 0, paymentMethod: "cash" as PaymentMethod, externalReference: "", notes: "",
  });

  const guestMatches = useMemo(
    () => findPotentialGuestMatches(state, guestSearch).slice(0, 8),
    [guestSearch, state],
  );
  const availableRooms = useMemo(() => availableRoomsForStay(state, {
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    guestCount: form.guestCount,
  }), [form.checkIn, form.checkOut, form.guestCount, state]);
  const selectedRoomId = availableRooms.some((room) => room.id === form.roomId) ? form.roomId : "";
  const nights = Math.max(nightsBetween(form.checkIn, form.checkOut), 0);
  const total = nights * Number(form.nightlyRate || 0);

  function chooseGuest(guestId: string) {
    const guest = state.guests.find((item) => item.id === guestId);
    if (!guest) return;
    setForm((current) => ({
      ...current, guestId: guest.id, firstName: guest.firstName, lastName: guest.lastName,
      phone: guest.phone, email: guest.email ?? "", document: guest.document ?? "",
    }));
    setGuestSearch(formatGuestName(guest.firstName, guest.lastName));
  }

  function createNewGuest() {
    setForm((current) => ({
      ...current, guestId: "", firstName: "", lastName: "", phone: "", email: "", document: "",
    }));
    setGuestSearch("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedRoomId) {
      setError("Seleccioná una habitación disponible para esas fechas y capacidad.");
      return;
    }
    try {
      await addReservation({ ...form, guestId: form.guestId || undefined, roomId: selectedRoomId });
      router.push("/admin/reservas?created=reservation");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear la reserva.");
    }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Venta manual" title="Nueva reserva" description="Seleccioná un huésped, validá fechas y asigná únicamente una habitación realmente disponible." />
      <div className="admin-form-layout">
        <form className="admin-form-card" onSubmit={submit}>
          <div className="admin-form-section"><span>01</span><div><h2>Huésped</h2><p>Buscá una ficha existente o registrá sólo los datos mínimos.</p></div></div>
          <div className="admin-guest-picker">
            <label>Buscar por nombre, teléfono o email<input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Escribí para buscar" /></label>
            {guestSearch && !form.guestId ? (
              <div className="admin-guest-picker__results" role="listbox" aria-label="Huéspedes encontrados">
                {guestMatches.map((guest) => (
                  <button type="button" key={guest.id} onClick={() => chooseGuest(guest.id)}>
                    <strong>{formatGuestName(guest.firstName, guest.lastName)}</strong>
                    <span>{guest.phone}{guest.email ? ` · ${guest.email}` : ""}</span>
                  </button>
                ))}
                {!guestMatches.length ? <p>No encontramos coincidencias. Completá una nueva ficha.</p> : null}
              </div>
            ) : null}
            {form.guestId ? <p className="admin-form-success">Huésped existente seleccionado. <button type="button" onClick={createNewGuest}>Usar otra persona</button></p> : null}
          </div>
          <div className="admin-field-grid">
            <label>Nombre<input required readOnly={Boolean(form.guestId)} autoComplete="given-name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
            <label>Apellido<input required readOnly={Boolean(form.guestId)} autoComplete="family-name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
            <label>Teléfono / contacto<input required readOnly={Boolean(form.guestId)} autoComplete="tel" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label>Email <small>opcional</small><input readOnly={Boolean(form.guestId)} autoComplete="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Documento <small>opcional</small><input readOnly={Boolean(form.guestId)} value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></label>
          </div>

          <div className="admin-form-section"><span>02</span><div><h2>Origen y estadía</h2><p>El checkout libera la habitación para otra entrada ese mismo día.</p></div></div>
          <div className="admin-field-grid">
            <label>Origen<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as Exclude<ReservationSource, "walk_in"> })}>{sources.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Entrada<input required type="date" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} /></label>
            <label>Salida<input required type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} /></label>
            <label>Cantidad de personas<input required min="1" max="30" type="number" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: Number(event.target.value) })} /></label>
            <label>Habitación disponible<select required value={selectedRoomId} onChange={(event) => { const room = availableRooms.find((item) => item.id === event.target.value); setForm({ ...form, roomId: event.target.value, nightlyRate: room?.baseRate ?? form.nightlyRate }); }}><option value="">Seleccionar habitación</option>{availableRooms.map((room) => <option value={room.id} key={room.id}>{room.displayName} · capacidad {room.capacity}</option>)}</select></label>
            <label>Hora estimada <small>opcional</small><input type="time" value={form.expectedArrival} onChange={(event) => setForm({ ...form, expectedArrival: event.target.value })} /></label>
            {["booking", "airbnb"].includes(form.source) ? <label>Referencia externa <small>opcional</small><input maxLength={200} value={form.externalReference} onChange={(event) => setForm({ ...form, externalReference: event.target.value })} /></label> : null}
          </div>
          {!state.rooms.length ? <p className="admin-form-error" role="status">Todavía no hay habitaciones configuradas. Completá el inventario desde Configuración.</p> : !availableRooms.length ? <p className="admin-form-error" role="status">No hay habitaciones válidas y disponibles para esas fechas y capacidad.</p> : null}

          <div className="admin-form-section"><span>03</span><div><h2>Importes y observaciones</h2><p>La tarifa queda fijada en esta reserva.</p></div></div>
          <div className="admin-field-grid">
            <label>Precio por noche<input min="1" required step="100" type="number" value={form.nightlyRate} onChange={(event) => setForm({ ...form, nightlyRate: Number(event.target.value) })} /></label>
            <label>Monto pagado<input min="0" step="100" type="number" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: Number(event.target.value) })} /></label>
            <label>Medio<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="admin-field--full">Observaciones<textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          <button className="admin-button admin-button--primary admin-button--large" disabled={!availableRooms.length} type="submit">Guardar reserva</button>
        </form>
        <aside className="admin-form-summary"><p>Resumen</p><h2>{formatCurrency(total)}</h2><dl><div><dt>Noches</dt><dd>{nights}</dd></div><div><dt>Personas</dt><dd>{form.guestCount}</dd></div><div><dt>Pagado</dt><dd>{formatCurrency(form.amountPaid)}</dd></div><div><dt>Saldo</dt><dd>{formatCurrency(Math.max(total - form.amountPaid, 0))}</dd></div></dl><div className="admin-summary-note"><strong>Disponibilidad transaccional</strong><span>El servidor y PostgreSQL vuelven a validar habitación, capacidad y solapamientos al guardar.</span></div></aside>
      </div>
    </>
  );
}
