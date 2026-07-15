"use client";

import Link from "next/link";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDate, StatusPill } from "../../components/ui";
import { dashboardSnapshot, formatGuestName, nightsBetween } from "../../lib/operations";

export default function CurrentGuestsPage() {
  const { state } = useOperations();
  const active = dashboardSnapshot(state).active;
  return (
    <>
      <AdminPageHeader eyebrow="Recepción" title="Huéspedes alojados actualmente" description="Estadías activas, datos de contacto, fechas y saldos del entorno de prueba." actions={<Link className="admin-button admin-button--primary" href="/admin/walk-in">Registrar ingreso</Link>} />
      {active.length ? <div className="admin-guest-grid">{active.map((reservation) => {
        const guest = state.guests.find((item) => item.id === reservation.primaryGuestId); const room = state.rooms.find((item) => item.id === reservation.roomId); if (!guest) return null;
        return <article className="admin-guest-card" key={reservation.id}><div className="admin-guest-card__identity"><span>{guest.firstName.slice(0,1)}</span><div><h2>{formatGuestName(guest.firstName, guest.lastName)}</h2><a href={`tel:${guest.phone}`}>{guest.phone}</a></div></div><dl><div><dt>Habitación</dt><dd>{room?.displayName ?? "Sin asignar"}</dd></div><div><dt>Estadía</dt><dd>{formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</dd></div><div><dt>Noches</dt><dd>{nightsBetween(reservation.checkIn, reservation.checkOut)}</dd></div><div><dt>Personas</dt><dd>{reservation.guestCount}</dd></div><div><dt>Saldo</dt><dd>{formatCurrency(reservation.balance)}</dd></div></dl><StatusPill status={reservation.paymentStatus}>{reservation.balance ? "Pago pendiente" : "Pagado"}</StatusPill><div className="admin-card-actions"><Link href={`/admin/pagos/nuevo?reservation=${reservation.id}`}>Registrar pago</Link><Link href={`/admin/check-out?reservation=${reservation.id}`}>Hacer check-out</Link></div></article>;
      })}</div> : <EmptyState title="No hay huéspedes alojados" description="Los ingresos confirmados aparecerán aquí automáticamente." action={{ href: "/admin/walk-in", label: "Registrar ingreso" }} />}
    </>
  );
}
