"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDateTime, paymentMethodLabels, StatusPill } from "../components/ui";
import { buildCashReadModel } from "../data/payment-management-core";
import { formatGuestName } from "../lib/operations";
import type { Payment, PaymentMethod } from "../lib/types";

type CashTargetType = Payment["targetType"] | "";

export default function CashPage() {
  const { state, mode, permissions } = useOperations();
  const today = buildCashReadModel(state).today;
  const canManage = mode === "demo" || permissions.includes("payments.manage");
  const [filters, setFilters] = useState({ from: today, to: today, method: "" as PaymentMethod | "", targetType: "" as CashTargetType, targetId: "" });
  const snapshot = useMemo(() => buildCashReadModel(state, filters, today), [filters, state, today]);
  const reservationById = useMemo(() => new Map(state.reservations.map((reservation) => [reservation.id, reservation])), [state.reservations]);
  const wellnessBookingById = useMemo(() => new Map(state.wellnessBookings.map((booking) => [booking.id, booking])), [state.wellnessBookings]);
  const guestById = useMemo(() => new Map(state.guests.map((guest) => [guest.id, guest])), [state.guests]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Caja operativa"
        title="Ingresos y movimientos"
        description={mode === "demo" ? "Movimientos ficticios del entorno de prueba." : "Pagos reales persistidos en Supabase, sin apertura o cierre formal de caja."}
        actions={canManage ? <Link className="admin-button admin-button--primary" href="/admin/pagos/nuevo">Registrar pago</Link> : undefined}
      />

      <section className="admin-financial-summary" aria-label="Resumen de caja de hoy">
        <article><span>Ingresos registrados hoy</span><strong>{formatCurrency(snapshot.incomeToday)}</strong><small>Pagos vigentes</small></article>
        <article><span>Cantidad de pagos</span><strong>{snapshot.paymentCountToday}</strong><small>Movimientos de cobro</small></article>
        <article><span>Pagos anulados hoy</span><strong>{snapshot.voidedToday}</strong><small>Registros conservados</small></article>
      </section>

      <section className="admin-method-summary" aria-label="Ingresos de hoy por método">
        {(Object.entries(paymentMethodLabels) as Array<[PaymentMethod, string]>).map(([method, label]) => <article key={method}><span>{label}</span><strong>{formatCurrency(snapshot.byMethod[method])}</strong></article>)}
      </section>

      <section className="admin-filter-bar admin-filter-bar--cash" aria-label="Filtros de movimientos">
        <label>Desde<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>Hasta<input type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>Método<select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value as PaymentMethod | "" })}><option value="">Todos</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Concepto<select value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value as CashTargetType, targetId: "" })}><option value="">Todos</option><option value="stay">Estadías</option><option value="wellness">Wellness</option></select></label>
        <label>Operación<select value={filters.targetId} onChange={(event) => setFilters({ ...filters, targetId: event.target.value })}><option value="">Todas</option>{filters.targetType !== "wellness" ? <optgroup label="Estadías">{state.reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.code}</option>)}</optgroup> : null}{filters.targetType !== "stay" ? <optgroup label="Wellness">{state.wellnessBookings.map((booking) => <option value={booking.id} key={booking.id}>{booking.code}</option>)}</optgroup> : null}</select></label>
      </section>

      <section className="admin-section admin-panel">
        <div className="admin-panel__heading"><div><p>Libro financiero</p><h2>Últimos movimientos</h2></div><span className="admin-count">{snapshot.movements.length}</span></div>
        {snapshot.latestMovements.length ? <div className="admin-cash-movements">{snapshot.latestMovements.map((payment) => {
          const reservation = payment.reservationId ? reservationById.get(payment.reservationId) : undefined;
          const wellnessBooking = payment.wellnessBookingId ? wellnessBookingById.get(payment.wellnessBookingId) : payment.targetType === "wellness" ? wellnessBookingById.get(payment.targetId) : undefined;
          const guestId = payment.guestId ?? reservation?.primaryGuestId ?? wellnessBooking?.guestId;
          const guest = guestId ? guestById.get(guestId) : undefined;
          const targetLabel = payment.targetType === "wellness" ? "Wellness" : "Estadía";
          const targetHref = payment.targetType === "wellness" ? `/admin/experiencias?booking=${payment.targetId}#wellness-booking-${payment.targetId}` : reservation ? `/admin/reservas/${reservation.id}` : undefined;
          return <article className={payment.status === "voided" ? "is-voided" : undefined} key={payment.id}><time>{formatDateTime(payment.createdAt)}</time><div><strong>{payment.targetCode || reservation?.code || wellnessBooking?.code || "Operación no disponible"}</strong><span>{targetLabel} · {guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin huésped"}</span></div><span>{paymentMethodLabels[payment.method]}</span><strong>{payment.direction === "refund" ? "−" : "+"}{formatCurrency(payment.amount)}</strong><StatusPill status={payment.status === "voided" ? "alert" : "paid"}>{payment.status === "voided" ? "Anulado" : "Registrado"}</StatusPill>{targetHref ? <Link href={targetHref}>{payment.targetType === "wellness" ? "Ver experiencia" : "Ver reserva"}</Link> : null}</article>;
        })}</div> : <EmptyState title="Sin movimientos" description="No hay pagos que coincidan con los filtros seleccionados." />}
      </section>
    </>
  );
}
