"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDateTime, paymentMethodLabels, StatusPill } from "../components/ui";
import { buildCashReadModel } from "../data/payment-management-core";
import { formatGuestName } from "../lib/operations";
import type { PaymentMethod } from "../lib/types";

export default function CashPage() {
  const { state, mode, permissions } = useOperations();
  const today = buildCashReadModel(state).today;
  const canManage = mode === "demo" || permissions.includes("payments.manage");
  const [filters, setFilters] = useState({ from: today, to: today, method: "" as PaymentMethod | "", reservationId: "" });
  const snapshot = useMemo(() => buildCashReadModel(state, filters, today), [filters, state, today]);
  const reservationById = useMemo(() => new Map(state.reservations.map((reservation) => [reservation.id, reservation])), [state.reservations]);
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

      <section className="admin-filter-bar" aria-label="Filtros de movimientos">
        <label>Desde<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>Hasta<input type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>Método<select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value as PaymentMethod | "" })}><option value="">Todos</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Reserva<select value={filters.reservationId} onChange={(event) => setFilters({ ...filters, reservationId: event.target.value })}><option value="">Todas</option>{state.reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.code}</option>)}</select></label>
      </section>

      <section className="admin-section admin-panel">
        <div className="admin-panel__heading"><div><p>Libro financiero</p><h2>Últimos movimientos</h2></div><span className="admin-count">{snapshot.movements.length}</span></div>
        {snapshot.latestMovements.length ? <div className="admin-cash-movements">{snapshot.latestMovements.map((payment) => {
          const reservation = reservationById.get(payment.reservationId);
          const guest = reservation ? guestById.get(reservation.primaryGuestId) : undefined;
          return <article className={payment.status === "voided" ? "is-voided" : undefined} key={payment.id}><time>{formatDateTime(payment.createdAt)}</time><div><strong>{reservation?.code ?? "Reserva no disponible"}</strong><span>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin huésped"}</span></div><span>{paymentMethodLabels[payment.method]}</span><strong>{payment.direction === "refund" ? "−" : "+"}{formatCurrency(payment.amount)}</strong><StatusPill status={payment.status === "voided" ? "alert" : "paid"}>{payment.status === "voided" ? "Anulado" : "Registrado"}</StatusPill>{reservation ? <Link href={`/admin/reservas/${reservation.id}`}>Ver reserva</Link> : null}</article>;
        })}</div> : <EmptyState title="Sin movimientos" description="No hay pagos que coincidan con los filtros seleccionados." />}
      </section>
    </>
  );
}
