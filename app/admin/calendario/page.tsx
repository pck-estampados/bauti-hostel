"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminPageHeader, EmptyState, formatDate, reservationStatusLabel } from "../components/ui";
import { useOperations } from "../components/operations-provider";
import { overlappingSlots, wellnessLocalDate, wellnessLocalTime } from "../data/wellness-capacity-core";
import type { WellnessBookingStatus } from "../data/wellness-types";
import { hostelDate } from "../lib/demo-data";
import { formatGuestName } from "../lib/operations";
import { LodgingAvailabilityConsole } from "./lodging-availability-console";

const sourceLabels: Record<string, string> = {
  web: "Web directa", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "Walk-in",
  booking: "Booking.com", airbnb: "Airbnb", instagram: "Instagram", referral: "Recomendación", admin: "Administración", other: "Otro",
};

const wellnessStatusLabels: Record<WellnessBookingStatus, string> = {
  pending_payment: "Pago pendiente",
  confirmed: "Confirmada",
  checked_in: "Ingresó",
  completed: "Finalizada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

type CalendarView = "stays" | "wellness" | "all";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function OccupancyCalendarPage() {
  const { state } = useOperations();
  const [startDate, setStartDate] = useState(hostelDate());
  const [view, setView] = useState<CalendarView>("all");
  const endDate = addDays(startDate, 14);
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(startDate, index)), [startDate]);
  const productById = useMemo(() => new Map(state.wellnessProducts.map((product) => [product.id, product])), [state.wellnessProducts]);
  const wellnessBookings = useMemo(() => state.wellnessBookings
    .filter((booking) => {
      const localDate = wellnessLocalDate(booking.startAt);
      return localDate >= startDate && localDate < endDate;
    })
    .toSorted((left, right) => left.startAt.localeCompare(right.startAt)), [endDate, startDate, state.wellnessBookings]);
  const showStays = view === "stays" || view === "all";
  const showWellness = view === "wellness" || view === "all";
  const reservationsForRoom = (roomId: string) => state.reservations.filter((reservation) => (
    reservation.roomId === roomId
    && !["cancelled", "rejected", "checked_out", "completed", "no_show"].includes(reservation.status)
    && reservation.checkIn < endDate
    && reservation.checkOut > startDate
  ));

  return (
    <>
      <AdminPageHeader eyebrow="Agenda operativa" title="Calendario de estadías y wellness" description="Vista de 14 días. Las estadías conservan su grilla por habitación y wellness se muestra como agenda de capacidad independiente." actions={view === "wellness" ? <Link className="admin-button admin-button--primary" href="/admin/experiencias#reservar">Nueva reserva wellness</Link> : view === "stays" ? <Link className="admin-button admin-button--primary" href="/admin/reservas/nueva">Nueva estadía</Link> : <><Link className="admin-button admin-button--secondary" href="/admin/experiencias#reservar">Reserva wellness</Link><Link className="admin-button admin-button--primary" href="/admin/reservas/nueva">Nueva estadía</Link></>} />
      <div className="admin-calendar-controls">
        <label className="admin-calendar-start">Comenzar en<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="admin-calendar-start">Mostrar<select value={view} onChange={(event) => setView(event.target.value as CalendarView)}><option value="stays">Estadías</option><option value="wellness">Wellness</option><option value="all">Todo</option></select></label>
      </div>
      <LodgingAvailabilityConsole />

      {showStays ? <section aria-labelledby="stay-calendar-title">
        <div className="admin-section-heading admin-calendar-heading"><div><p>Estadías</p><h2 id="stay-calendar-title">Ocupación por habitación</h2></div></div>
        {!state.rooms.length ? <div className="admin-list-panel"><EmptyState title="Todavía no hay habitaciones configuradas" description="Completá el inventario real para visualizar ocupación y disponibilidad." action={{ href: "/admin/configuracion#habitaciones", label: "Ir a configuración" }} /></div> : (
          <>
            <div className="admin-calendar" role="region" aria-label="Calendario de ocupación de habitaciones" tabIndex={0}>
              <div className="admin-calendar__grid" style={{ gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${days.length}, minmax(82px, 1fr))` }}>
                <div className="admin-calendar__corner">Habitación</div>
                {days.map((day) => <div className="admin-calendar__day" key={day}><strong>{new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{day.slice(8, 10)}/{day.slice(5, 7)}</span></div>)}
                {state.rooms.map((room) => <div className="admin-calendar__row" key={room.id} style={{ gridColumn: `1 / span ${days.length + 1}`, gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${days.length}, minmax(82px, 1fr))` }}><div className="admin-calendar__room"><strong>{room.displayName}</strong><span>{room.code} · cap. {room.capacity}</span></div>{days.map((day) => {
                  const reservation = reservationsForRoom(room.id).find((item) => item.checkIn <= day && item.checkOut > day);
                  const guest = state.guests.find((item) => item.id === reservation?.primaryGuestId);
                  return <div className={reservation ? "admin-calendar__cell admin-calendar__cell--occupied" : "admin-calendar__cell"} key={day}>{reservation ? <Link href={`/admin/reservas/${reservation.id}/editar`} aria-label={`${room.displayName}: ${guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code}, ${reservationStatusLabel(reservation.status)}`}><strong>{guest?.firstName ?? reservation.code}</strong><span>{sourceLabels[reservation.source] ?? reservation.source}</span></Link> : <span>Sin reserva</span>}</div>;
                })}</div>)}
              </div>
            </div>
            <div className="admin-calendar-mobile" aria-label="Ocupación de habitaciones en formato móvil">{days.map((day) => {
              const occupied = state.reservations.filter((reservation) => reservation.roomId && reservation.checkIn <= day && reservation.checkOut > day && !["cancelled", "rejected", "checked_out", "completed", "no_show"].includes(reservation.status));
              return <section key={day}><h2>{formatDate(day)}</h2>{occupied.length ? occupied.map((reservation) => { const guest = state.guests.find((item) => item.id === reservation.primaryGuestId); const room = state.rooms.find((item) => item.id === reservation.roomId); return <Link href={`/admin/reservas/${reservation.id}/editar`} key={reservation.id}><strong>{room?.displayName}</strong><span>{guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code} · {sourceLabels[reservation.source]} · {reservationStatusLabel(reservation.status)}</span></Link>; }) : <p>Sin ocupación registrada.</p>}</section>;
            })}</div>
          </>
        )}
      </section> : null}

      {showWellness ? <section className="admin-section" aria-labelledby="wellness-calendar-title">
        <div className="admin-section-heading"><div><p>Wellness</p><h2 id="wellness-calendar-title">Reservas y capacidad por franja</h2></div><Link href="/admin/experiencias">Gestionar experiencias →</Link></div>
        {wellnessBookings.length ? <div className="admin-wellness-calendar">{wellnessBookings.map((booking) => {
          const product = productById.get(booking.productId);
          const guest = state.guests.find((item) => item.id === booking.guestId);
          const impactedSlots = overlappingSlots(state.wellnessSlots, booking.startAt, booking.endAt);
          const remaining = impactedSlots.map((slot) => slot.availableExternal).filter((value): value is number => value !== null);
          const capacityLabel = impactedSlots.length > 0 && remaining.length === impactedSlots.length
            ? `${Math.min(...remaining)} cupos externos disponibles como mínimo`
            : "Capacidad pendiente de configurar";
          return <article key={booking.id}><div className="admin-wellness-calendar__date"><strong>{formatDate(wellnessLocalDate(booking.startAt))}</strong><span>{wellnessLocalTime(booking.startAt)}–{wellnessLocalTime(booking.endAt)}</span></div><div><strong>{product?.name ?? "Producto no disponible"}</strong><span>{guest ? formatGuestName(guest.firstName, guest.lastName) : booking.code} · {booking.partySize} {booking.partySize === 1 ? "persona" : "personas"}</span></div><div><strong>{booking.capacityUnits} {booking.capacityUnits === 1 ? "cupo reservado" : "cupos reservados"}</strong><span>{capacityLabel}</span></div><span className={`admin-wellness-status admin-wellness-status--${booking.status}`}>{wellnessStatusLabels[booking.status]}</span><Link href={`/admin/experiencias?booking=${booking.id}#wellness-booking-${booking.id}`}>Ver reserva</Link></article>;
        })}</div> : <EmptyState title="Sin reservas wellness en este período" description="No hay Circuitos Relax ni Pases Relax Día que coincidan con las fechas seleccionadas." action={{ href: "/admin/experiencias", label: "Abrir experiencias" }} />}
      </section> : null}
    </>
  );
}
