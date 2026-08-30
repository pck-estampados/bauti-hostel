"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDate, reservationStatusLabel, StatusPill } from "../components/ui";
import { formatGuestName } from "../lib/operations";

const sourceLabels: Record<string, string> = {
  web: "Web directa", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "Walk-in",
  booking: "Booking.com", airbnb: "Airbnb", instagram: "Instagram", referral: "Recomendación", other: "Otro",
};

export default function ReservationsPage() {
  const { state, mode, permissions } = useOperations();
  const canManagePayments = mode === "demo" || permissions.includes("payments.manage");
  const [filters, setFilters] = useState({ date: "", status: "", source: "", roomId: "" });
  const reservations = useMemo(() => state.reservations.filter((reservation) => (
    (!filters.date || (reservation.checkIn <= filters.date && reservation.checkOut > filters.date))
    && (!filters.status || reservation.status === filters.status)
    && (!filters.source || reservation.source === filters.source)
    && (!filters.roomId || reservation.roomId === filters.roomId)
  )), [filters, state.reservations]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Operación real"
        title="Reservas y estadías"
        description={mode === "demo" ? "Fechas, origen, habitación y saldos del entorno de prueba." : "Fechas, origen, habitación y saldos persistidos en Supabase."}
        actions={<><Link className="admin-button admin-button--secondary" href="/admin/calendario">Ver calendario</Link><Link className="admin-button admin-button--primary" href="/admin/reservas/nueva">Nueva reserva</Link></>}
      />
      <section className="admin-filter-bar" aria-label="Filtros de reservas">
        <label>Fecha<input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
        <label>Estado<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{[...new Set(state.reservations.map((item) => item.status))].map((status) => <option key={status} value={status}>{reservationStatusLabel(status)}</option>)}</select></label>
        <label>Origen<select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Todos</option>{[...new Set(state.reservations.map((item) => item.source))].map((source) => <option key={source} value={source}>{sourceLabels[source] ?? source}</option>)}</select></label>
        <label>Habitación<select value={filters.roomId} onChange={(event) => setFilters({ ...filters, roomId: event.target.value })}><option value="">Todas</option>{state.rooms.map((room) => <option key={room.id} value={room.id}>{room.displayName}</option>)}</select></label>
      </section>
      {!state.reservations.length ? (
        <div className="admin-list-panel"><EmptyState title="No hay reservas cargadas." description="Cuando registres una reserva real aparecerá aquí, asociada a su huésped y habitación." action={{ href: "/admin/reservas/nueva", label: "Nueva reserva" }} /></div>
      ) : !reservations.length ? (
        <div className="admin-list-panel"><EmptyState title="Sin resultados" description="No hay reservas que coincidan con los filtros seleccionados." /></div>
      ) : (
        <div className="admin-list-panel">
          <div className="admin-list-panel__head"><span>Huésped</span><span>Estadía</span><span>Habitación</span><span>Estado</span><span>Finanzas</span><span>Acción</span></div>
          {reservations.map((reservation) => {
            const guest = state.guests.find((item) => item.id === reservation.primaryGuestId);
            const room = state.rooms.find((item) => item.id === reservation.roomId);
            return <article className="admin-list-row" key={reservation.id}><div><strong>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin huésped"}</strong><small>{reservation.code} · {sourceLabels[reservation.source] ?? reservation.source} · {reservation.guestCount} personas</small></div><span>{formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</span><span>{room?.displayName ?? "Sin asignar"}</span><StatusPill status={reservation.status}>{reservationStatusLabel(reservation.status)}</StatusPill><div className="admin-financial-cell"><span>Total {formatCurrency(reservation.total)}</span><span>Pagado {formatCurrency(reservation.paid)}</span><strong>Saldo {formatCurrency(reservation.balance)}</strong></div><div className="admin-inline-actions"><Link href={`/admin/reservas/${reservation.id}`}>Ver</Link>{["inquiry", "pending", "pending_deposit", "confirmed", "partially_paid", "paid"].includes(reservation.status) ? <Link href={`/admin/reservas/${reservation.id}/editar`}>Editar</Link> : null}{reservation.balance > 0 && canManagePayments ? <Link href={`/admin/pagos/nuevo?reservation=${reservation.id}`}>Registrar pago</Link> : null}{["confirmed", "partially_paid", "paid"].includes(reservation.status) ? <Link href={`/admin/check-in?reservation=${reservation.id}`}>Check-in</Link> : null}{reservation.status === "accommodated" ? <Link href={`/admin/check-out?reservation=${reservation.id}`}>Check-out</Link> : null}</div></article>;
          })}
        </div>
      )}
    </>
  );
}
