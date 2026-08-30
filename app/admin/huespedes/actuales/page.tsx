"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader, EmptyState, formatDate, StatusPill } from "../../components/ui";
import { findPotentialGuestMatches } from "../../data/reservation-management-core";
import { formatGuestName } from "../../lib/operations";
import type { Guest } from "../../lib/types";

function GuestEditor({ guest, save }: { guest: Guest; save: (guestId: string, input: Omit<Guest, "id" | "createdAt" | "isDemo">) => Promise<void> }) {
  const [form, setForm] = useState({ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, email: guest.email ?? "", document: guest.document ?? "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try { await save(guest.id, form); setMessage("Datos actualizados."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible actualizar."); }
  }
  return <details className="admin-guest-editor"><summary>Editar datos básicos</summary><form onSubmit={submit}><div className="admin-field-grid"><label>Nombre<input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label><label>Apellido<input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label><label>Teléfono<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email <small>opcional</small><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Documento <small>opcional</small><input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></label></div>{error ? <p className="admin-form-error" role="alert">{error}</p> : null}{message ? <p className="admin-form-success" role="status">{message}</p> : null}<button className="admin-button admin-button--secondary" type="submit">Guardar cambios</button></form></details>;
}

export default function GuestsPage() {
  const { state, updateGuest } = useOperations();
  const [search, setSearch] = useState("");
  const guests = useMemo(() => findPotentialGuestMatches(state, search), [search, state]);
  const activeReservationByGuest = new Map(
    state.reservations.filter((reservation) => reservation.status === "accommodated").map((reservation) => [reservation.primaryGuestId, reservation]),
  );
  return (
    <>
      <AdminPageHeader eyebrow="Base de huéspedes" title="Huéspedes" description="Buscá fichas reales por nombre, teléfono o email y actualizá sólo sus datos básicos." actions={<Link className="admin-button admin-button--primary" href="/admin/huespedes/nuevo">Nuevo huésped</Link>} />
      <label className="admin-directory-search">Buscar huésped<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, teléfono o email" /></label>
      {!state.guests.length ? <div className="admin-list-panel"><EmptyState title="No hay huéspedes cargados" description="La base está vacía. Podés crear una ficha o hacerlo durante una reserva." action={{ href: "/admin/huespedes/nuevo", label: "Nuevo huésped" }} /></div> : !guests.length ? <div className="admin-list-panel"><EmptyState title="Sin coincidencias" description="Probá con otro nombre, teléfono o correo." /></div> : <div className="admin-guest-grid">{guests.map((guest) => {
        const activeReservation = activeReservationByGuest.get(guest.id);
        const room = state.rooms.find((item) => item.id === activeReservation?.roomId);
        return <article className="admin-guest-card" key={guest.id}><div className="admin-guest-card__identity"><span>{guest.firstName.slice(0, 1)}</span><div><h2>{formatGuestName(guest.firstName, guest.lastName)}</h2><a href={`tel:${guest.phone}`}>{guest.phone}</a>{guest.email ? <a href={`mailto:${guest.email}`}>{guest.email}</a> : null}</div></div><dl><div><dt>Creado</dt><dd>{formatDate(guest.createdAt)}</dd></div><div><dt>Estado</dt><dd>{activeReservation ? "Alojado" : "Sin estadía activa"}</dd></div>{activeReservation ? <div><dt>Habitación</dt><dd>{room?.displayName ?? "Sin asignar"}</dd></div> : null}</dl>{activeReservation ? <StatusPill status="accommodated">Alojado</StatusPill> : null}<GuestEditor guest={guest} save={updateGuest} /></article>;
      })}</div>}
    </>
  );
}
