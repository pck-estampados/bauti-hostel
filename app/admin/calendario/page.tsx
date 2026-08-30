"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, EmptyState, formatDate, reservationStatusLabel } from "../components/ui";
import { hostelDate } from "../lib/demo-data";
import { formatGuestName } from "../lib/operations";

const sourceLabels: Record<string, string> = {
  web: "Web directa", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "Walk-in",
  booking: "Booking.com", airbnb: "Airbnb", instagram: "Instagram", referral: "Recomendación", other: "Otro",
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function OccupancyCalendarPage() {
  const { state } = useOperations();
  const [startDate, setStartDate] = useState(hostelDate());
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(startDate, index)), [startDate]);
  const reservationsForRoom = (roomId: string) => state.reservations.filter((reservation) => (
    reservation.roomId === roomId
    && !["cancelled", "rejected", "checked_out", "completed", "no_show"].includes(reservation.status)
    && reservation.checkIn < addDays(startDate, 14)
    && reservation.checkOut > startDate
  ));

  return (
    <>
      <AdminPageHeader eyebrow="Ocupación" title="Calendario de habitaciones" description="Vista de 14 días con salida exclusiva: una salida y una nueva entrada pueden compartir fecha." actions={<Link className="admin-button admin-button--primary" href="/admin/reservas/nueva">Nueva reserva</Link>} />
      <label className="admin-calendar-start">Comenzar en<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      {!state.rooms.length ? <div className="admin-list-panel"><EmptyState title="Todavía no hay habitaciones configuradas" description="Completá el inventario real para visualizar ocupación y disponibilidad." action={{ href: "/admin/configuracion#habitaciones", label: "Ir a configuración" }} /></div> : (
        <>
          <div className="admin-calendar" role="region" aria-label="Calendario de ocupación" tabIndex={0}>
            <div className="admin-calendar__grid" style={{ gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${days.length}, minmax(82px, 1fr))` }}>
              <div className="admin-calendar__corner">Habitación</div>
              {days.map((day) => <div className="admin-calendar__day" key={day}><strong>{new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{day.slice(8, 10)}/{day.slice(5, 7)}</span></div>)}
              {state.rooms.map((room) => <div className="admin-calendar__row" key={room.id} style={{ gridColumn: `1 / span ${days.length + 1}`, gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${days.length}, minmax(82px, 1fr))` }}><div className="admin-calendar__room"><strong>{room.displayName}</strong><span>{room.code} · cap. {room.capacity}</span></div>{days.map((day) => {
                const reservation = reservationsForRoom(room.id).find((item) => item.checkIn <= day && item.checkOut > day);
                const guest = state.guests.find((item) => item.id === reservation?.primaryGuestId);
                return <div className={reservation ? "admin-calendar__cell admin-calendar__cell--occupied" : "admin-calendar__cell"} key={day}>{reservation ? <Link href={`/admin/reservas/${reservation.id}/editar`} aria-label={`${room.displayName}: ${guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code}, ${reservationStatusLabel(reservation.status)}`}><strong>{guest?.firstName ?? reservation.code}</strong><span>{sourceLabels[reservation.source] ?? reservation.source}</span></Link> : <span>Libre</span>}</div>;
              })}</div>)}
            </div>
          </div>
          <div className="admin-calendar-mobile" aria-label="Ocupación en formato móvil">{days.map((day) => {
            const occupied = state.reservations.filter((reservation) => reservation.roomId && reservation.checkIn <= day && reservation.checkOut > day && !["cancelled", "rejected", "checked_out", "completed", "no_show"].includes(reservation.status));
            return <section key={day}><h2>{formatDate(day)}</h2>{occupied.length ? occupied.map((reservation) => { const guest = state.guests.find((item) => item.id === reservation.primaryGuestId); const room = state.rooms.find((item) => item.id === reservation.roomId); return <Link href={`/admin/reservas/${reservation.id}/editar`} key={reservation.id}><strong>{room?.displayName}</strong><span>{guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code} · {sourceLabels[reservation.source]} · {reservationStatusLabel(reservation.status)}</span></Link>; }) : <p>Sin ocupación registrada.</p>}</section>;
          })}</div>
        </>
      )}
    </>
  );
}
