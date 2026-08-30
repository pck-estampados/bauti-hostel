"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOperations } from "../../../components/operations-provider";
import { AdminPageHeader, formatCurrency, reservationStatusLabel, StatusPill } from "../../../components/ui";
import { availableRoomsForStay, findPotentialGuestMatches } from "../../../data/reservation-management-core";
import { formatGuestName, nightsBetween } from "../../../lib/operations";
import type { ReservationSource } from "../../../lib/types";

const sources: Array<[Exclude<ReservationSource, "walk_in">, string]> = [
  ["web", "Web directa"], ["whatsapp", "WhatsApp"], ["phone", "Teléfono"],
  ["booking", "Booking.com"], ["airbnb", "Airbnb"], ["instagram", "Instagram"],
  ["referral", "Recomendación"], ["other", "Otro"],
];

export default function EditReservationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, updateReservation, cancelReservation } = useOperations();
  const reservation = state.reservations.find((item) => item.id === params.id);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState(() => ({
    guestId: reservation?.primaryGuestId ?? "",
    roomId: reservation?.roomId ?? "",
    guestCount: reservation?.guestCount ?? 1,
    checkIn: reservation?.checkIn ?? "",
    checkOut: reservation?.checkOut ?? "",
    nightlyRate: reservation?.nightlyRate ?? 0,
    source: (reservation?.source === "walk_in" ? "other" : reservation?.source ?? "whatsapp") as Exclude<ReservationSource, "walk_in">,
    expectedArrival: reservation?.expectedArrival ?? "",
    externalReference: reservation?.externalReference ?? "",
    notes: reservation?.notes ?? "",
  }));

  const guestMatches = useMemo(() => findPotentialGuestMatches(state, guestSearch).slice(0, 8), [guestSearch, state]);
  const rooms = useMemo(() => availableRoomsForStay(state, {
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    guestCount: form.guestCount,
    excludeReservationId: reservation?.id,
  }), [form.checkIn, form.checkOut, form.guestCount, reservation?.id, state]);
  const selectedRoomId = rooms.some((room) => room.id === form.roomId) ? form.roomId : "";
  const selectedGuest = state.guests.find((guest) => guest.id === form.guestId);
  const editable = Boolean(reservation && ["inquiry", "pending", "pending_deposit", "confirmed", "partially_paid", "paid"].includes(reservation.status));

  if (!reservation) {
    return <><AdminPageHeader eyebrow="Reservas" title="Reserva no encontrada" description="La reserva solicitada no existe o ya no está disponible." /><p className="admin-form-error" role="alert">No se encontró la reserva.</p></>;
  }
  const reservationId = reservation.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!selectedRoomId) { setError("Seleccioná una habitación disponible."); return; }
    try {
      await updateReservation({ ...form, reservationId, roomId: selectedRoomId });
      setSuccess("Reserva actualizada correctamente.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible actualizar la reserva.");
    }
  }

  async function cancel() {
    setError(""); setSuccess("");
    try {
      await cancelReservation(reservationId, cancelReason);
      router.push("/admin/reservas?cancelled=reservation");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cancelar la reserva.");
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={reservation.code}
        title="Editar reserva"
        description="Cada cambio vuelve a validar permisos, capacidad, inventario y disponibilidad."
        actions={<StatusPill status={reservation.status}>{reservationStatusLabel(reservation.status)}</StatusPill>}
      />
      <div className="admin-form-layout">
        <form className="admin-form-card" onSubmit={submit}>
          <div className="admin-form-section"><span>01</span><div><h2>Huésped principal</h2><p>Podés reasignar la reserva a una ficha existente.</p></div></div>
          <label className="admin-search-field">Buscar huésped<input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} /></label>
          {guestSearch ? <div className="admin-guest-picker__results" role="listbox">{guestMatches.map((guest) => <button type="button" key={guest.id} onClick={() => { setForm({ ...form, guestId: guest.id }); setGuestSearch(""); }}><strong>{formatGuestName(guest.firstName, guest.lastName)}</strong><span>{guest.phone}</span></button>)}</div> : null}
          <p className="admin-selected-record">Seleccionado: <strong>{selectedGuest ? formatGuestName(selectedGuest.firstName, selectedGuest.lastName) : "Sin huésped"}</strong></p>

          <div className="admin-form-section"><span>02</span><div><h2>Fechas y asignación</h2><p>Las noches se calculan con salida exclusiva.</p></div></div>
          <div className="admin-field-grid">
            <label>Origen<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as Exclude<ReservationSource, "walk_in"> })}>{sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Entrada<input required type="date" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} /></label>
            <label>Salida<input required type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} /></label>
            <label>Personas<input required min="1" max="30" type="number" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: Number(event.target.value) })} /></label>
            <label>Habitación<select required value={selectedRoomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setForm({ ...form, roomId: event.target.value, nightlyRate: room?.baseRate ?? form.nightlyRate }); }}><option value="">Seleccionar</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.displayName} · capacidad {room.capacity}</option>)}</select></label>
            <label>Hora estimada <small>opcional</small><input type="time" value={form.expectedArrival} onChange={(event) => setForm({ ...form, expectedArrival: event.target.value })} /></label>
            <label>Tarifa por noche<input required min="1" step="100" type="number" value={form.nightlyRate} onChange={(event) => setForm({ ...form, nightlyRate: Number(event.target.value) })} /></label>
            {["booking", "airbnb"].includes(form.source) ? <label>Referencia externa <small>opcional</small><input maxLength={200} value={form.externalReference} onChange={(event) => setForm({ ...form, externalReference: event.target.value })} /></label> : null}
            <label className="admin-field--full">Observaciones<textarea rows={4} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          {!editable ? <p className="admin-form-error" role="status">El estado actual no permite editar esta reserva.</p> : null}
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          {success ? <p className="admin-form-success" role="status">{success}</p> : null}
          <button className="admin-button admin-button--primary" disabled={!editable || !selectedRoomId} type="submit">Guardar cambios</button>
        </form>
        <aside className="admin-form-summary">
          <p>Nuevo total</p><h2>{formatCurrency(Math.max(nightsBetween(form.checkIn, form.checkOut), 0) * form.nightlyRate)}</h2>
          <dl><div><dt>Pagado</dt><dd>{formatCurrency(reservation.paid)}</dd></div><div><dt>Estado</dt><dd>{reservationStatusLabel(reservation.status)}</dd></div></dl>
          {editable ? <div className="admin-cancel-box"><strong>Cancelar reserva</strong><p>No se elimina: conserva historial y libera la habitación.</p><label>Motivo<textarea rows={3} minLength={2} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><button type="button" onClick={cancel} disabled={cancelReason.trim().length < 2}>Confirmar cancelación</button></div> : null}
        </aside>
      </div>
    </>
  );
}
