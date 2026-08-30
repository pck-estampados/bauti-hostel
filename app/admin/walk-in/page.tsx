"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, formatCurrency, paymentMethodLabels } from "../components/ui";
import { availableRoomsForStay, findPotentialGuestMatches } from "../data/reservation-management-core";
import { DEFAULT_REFERENCE_RATE_ARS, hostelDate } from "../lib/demo-data";
import { formatGuestName, nightsBetween } from "../lib/operations";
import type { PaymentMethod } from "../lib/types";

export default function WalkInPage() {
  const router = useRouter();
  const { state, mode, permissions, addWalkIn } = useOperations();
  const [guestSearch, setGuestSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    guestId: "", firstName: "", lastName: "", phone: "", email: "", document: "",
    guestCount: 1, roomId: "", checkIn: hostelDate(), checkOut: hostelDate(1),
    nightlyRate: mode === "demo" ? DEFAULT_REFERENCE_RATE_ARS : 0,
    amountPaid: 0, paymentMethod: "cash" as PaymentMethod, notes: "",
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
  const balance = Math.max(total - Number(form.amountPaid || 0), 0);
  const canManageStays = mode === "demo" || permissions.includes("reservations.manage");
  const canManageGuests = mode === "demo" || permissions.includes("guests.manage");
  const canManagePayments = mode === "demo" || permissions.includes("payments.manage");
  const canManageNotes = mode === "demo" || permissions.includes("notes.manage");
  const canSubmit = canManageStays && canManageGuests && Boolean(selectedRoomId)
    && (form.amountPaid <= 0 || canManagePayments)
    && (!form.notes.trim() || canManageNotes);

  function chooseGuest(guestId: string) {
    const guest = state.guests.find((item) => item.id === guestId);
    if (!guest) return;
    setForm((current) => ({
      ...current,
      guestId: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      phone: guest.phone,
      email: guest.email ?? "",
      document: guest.document ?? "",
    }));
    setGuestSearch(formatGuestName(guest.firstName, guest.lastName));
  }

  function createNewGuest() {
    setForm((current) => ({
      ...current,
      guestId: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      document: "",
    }));
    setGuestSearch("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selectedRoomId) {
      setError("Seleccioná una habitación disponible para esas fechas y capacidad.");
      return;
    }
    try {
      await addWalkIn({ ...form, guestId: form.guestId || undefined, roomId: selectedRoomId });
      router.push("/admin/operacion?created=walk-in");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible registrar el ingreso.");
    }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Recepción rápida" title="Nuevo walk-in" description="Busca o crea al huésped y realiza reserva, asignación y check-in en una única operación transaccional." />
      <div className="admin-form-layout">
        <form className="admin-form-card" onSubmit={submit}>
          <div className="admin-form-section"><span>01</span><div><h2>Huésped principal</h2><p>Usá una ficha existente o completá los datos mínimos de una nueva persona.</p></div></div>
          <div className="admin-guest-picker">
            <label>Buscar por nombre, teléfono o email<input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Escribí para buscar" /></label>
            {guestSearch && !form.guestId ? <div className="admin-guest-picker__results" role="listbox" aria-label="Huéspedes encontrados">{guestMatches.map((guest) => <button type="button" key={guest.id} onClick={() => chooseGuest(guest.id)}><strong>{formatGuestName(guest.firstName, guest.lastName)}</strong><span>{guest.phone}{guest.email ? ` · ${guest.email}` : ""}</span></button>)}{!guestMatches.length ? <p>No encontramos coincidencias. Completá una nueva ficha.</p> : null}</div> : null}
            {form.guestId ? <p className="admin-form-success">Huésped existente seleccionado. <button type="button" onClick={createNewGuest}>Usar otra persona</button></p> : null}
          </div>
          <div className="admin-field-grid">
            <label>Nombre<input required readOnly={Boolean(form.guestId)} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} autoComplete="given-name" /></label>
            <label>Apellido<input required readOnly={Boolean(form.guestId)} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" /></label>
            <label>Teléfono / contacto<input required readOnly={Boolean(form.guestId)} type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label>
            <label>Email <small>opcional</small><input readOnly={Boolean(form.guestId)} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
            <label>Documento <small>opcional</small><input readOnly={Boolean(form.guestId)} value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></label>
          </div>

          <div className="admin-form-section"><span>02</span><div><h2>Estadía</h2><p>El ingreso es hoy; la disponibilidad y el solapamiento se revalidan en PostgreSQL.</p></div></div>
          <div className="admin-field-grid">
            <label>Habitación disponible<select required value={selectedRoomId} onChange={(event) => { const room = availableRooms.find((item) => item.id === event.target.value); setForm({ ...form, roomId: event.target.value, nightlyRate: room?.baseRate ?? form.nightlyRate }); }}><option value="">Seleccionar</option>{availableRooms.map((room) => <option value={room.id} key={room.id}>{room.displayName} · hasta {room.capacity}</option>)}</select></label>
            <label>Cantidad de huéspedes<input required min="1" max="30" type="number" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: Number(event.target.value) })} /></label>
            <label>Entrada<input required readOnly type="date" value={form.checkIn} /></label>
            <label>Salida prevista<input required min={hostelDate(1)} type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} /></label>
          </div>

          <div className="admin-form-section"><span>03</span><div><h2>Tarifa, pago y contexto</h2><p>El pago inicial es opcional y respeta el permiso financiero existente.</p></div></div>
          <div className="admin-field-grid">
            <label>Tarifa acordada por noche<input required min="1" step="100" type="number" value={form.nightlyRate} onChange={(event) => setForm({ ...form, nightlyRate: Number(event.target.value) })} /></label>
            <label>Monto pagado<input disabled={!canManagePayments} required min="0" step="100" type="number" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: Number(event.target.value) })} /></label>
            <label>Medio de pago<select disabled={!canManagePayments || form.amountPaid <= 0} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="admin-field--full">Observaciones <small>{canManageNotes ? "opcional" : "requiere permiso notes.manage"}</small><textarea disabled={!canManageNotes} rows={3} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          {!state.rooms.length ? <p className="admin-form-error" role="alert">Todavía no hay habitaciones configuradas. Completá el inventario desde Configuración.</p> : !availableRooms.length ? <p className="admin-form-error" role="status">No hay una habitación válida y disponible para la estadía indicada.</p> : null}
          {!canManageStays || !canManageGuests ? <p className="admin-form-error" role="alert">El walk-in requiere permisos para administrar reservas y huéspedes.</p> : null}
          <button className="admin-button admin-button--primary admin-button--large" type="submit" disabled={!canSubmit}>Registrar y hacer check-in</button>
        </form>
        <aside className="admin-form-summary"><p>Resumen del ingreso</p><h2>{nights} noche{nights === 1 ? "" : "s"}</h2><dl><div><dt>Total acordado</dt><dd>{formatCurrency(total)}</dd></div><div><dt>Pagado</dt><dd>{formatCurrency(Number(form.amountPaid || 0))}</dd></div><div><dt>Saldo</dt><dd>{formatCurrency(balance)}</dd></div></dl><div className="admin-summary-note"><strong>Operación atómica</strong><span>La reserva queda alojada, la habitación ocupada y la acción registrada en historial y auditoría. No se confirma disponibilidad futura fuera de esta operación.</span></div></aside>
      </div>
    </>
  );
}
