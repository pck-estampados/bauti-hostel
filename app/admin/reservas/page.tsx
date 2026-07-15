"use client";

import Link from "next/link";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, formatCurrency, formatDate, reservationStatusLabel, StatusPill } from "../components/ui";
import { formatGuestName } from "../lib/operations";

export default function ReservationsPage() {
  const { state } = useOperations();
  return (
    <>
      <AdminPageHeader eyebrow="Reservas manuales" title="Reservas y estadías" description="Seguimiento de fechas, estado, habitación y cobros. Todo el contenido actual es de prueba." actions={<Link className="admin-button admin-button--primary" href="/admin/reservas/nueva">Nueva reserva</Link>} />
      <div className="admin-list-panel">
        <div className="admin-list-panel__head"><span>Huésped</span><span>Estadía</span><span>Habitación</span><span>Estado</span><span>Saldo</span><span>Acción</span></div>
        {state.reservations.map((reservation) => { const guest = state.guests.find((item) => item.id === reservation.primaryGuestId); const room = state.rooms.find((item) => item.id === reservation.roomId); return <article className="admin-list-row" key={reservation.id}><div><strong>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin huésped"}</strong><small>{reservation.code} · {reservation.guestCount} personas</small></div><span>{formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</span><span>{room?.displayName ?? "Sin asignar"}</span><StatusPill status={reservation.status}>{reservationStatusLabel(reservation.status)}</StatusPill><strong>{formatCurrency(reservation.balance)}</strong><div className="admin-inline-actions">{["confirmed", "partially_paid", "paid"].includes(reservation.status) ? <Link href={`/admin/check-in?reservation=${reservation.id}`}>Check-in</Link> : null}{reservation.status === "accommodated" ? <Link href={`/admin/check-out?reservation=${reservation.id}`}>Check-out</Link> : null}{reservation.balance > 0 ? <Link href={`/admin/pagos/nuevo?reservation=${reservation.id}`}>Pago</Link> : null}</div></article>; })}
      </div>
    </>
  );
}
