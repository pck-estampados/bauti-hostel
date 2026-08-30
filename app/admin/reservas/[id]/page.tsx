"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useOperations } from "../../components/operations-provider";
import {
  AdminPageHeader,
  EmptyState,
  formatCurrency,
  formatDate,
  formatDateTime,
  paymentMethodLabels,
  reservationStatusLabel,
  StatusPill,
} from "../../components/ui";
import { formatGuestName } from "../../lib/operations";

export default function ReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const { state, mode, permissions, voidPayment } = useOperations();
  const canManagePayments = mode === "demo" || permissions.includes("payments.manage");
  const reservation = state.reservations.find((item) => item.id === params.id);
  const guest = state.guests.find((item) => item.id === reservation?.primaryGuestId);
  const room = state.rooms.find((item) => item.id === reservation?.roomId);
  const payments = state.payments
    .filter((payment) => payment.reservationId === reservation?.id)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [busyPayment, setBusyPayment] = useState("");
  const [error, setError] = useState("");

  if (!reservation) {
    return <div className="admin-list-panel"><EmptyState title="Reserva no encontrada" description="La reserva solicitada no existe o ya no está disponible." action={{ href: "/admin/reservas", label: "Volver a reservas" }} /></div>;
  }

  async function submitVoid(event: FormEvent, paymentId: string) {
    event.preventDefault();
    const reason = reasons[paymentId] ?? "";
    if (!canManagePayments) return setError("No tenés permiso para anular pagos.");
    if (!confirmations[paymentId]) return setError("Confirmá expresamente la anulación del pago.");
    if (reason.trim().length < 2) return setError("Indicá un motivo de anulación.");
    setBusyPayment(paymentId);
    setError("");
    try {
      await voidPayment(paymentId, reason);
      setReasons((current) => ({ ...current, [paymentId]: "" }));
      setConfirmations((current) => ({ ...current, [paymentId]: false }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible anular el pago.");
    } finally {
      setBusyPayment("");
    }
  }

  const paymentHref = `/admin/pagos/nuevo?reservation=${reservation.id}&returnTo=${encodeURIComponent(`/admin/reservas/${reservation.id}`)}`;

  return (
    <>
      <AdminPageHeader
        eyebrow={`Reserva ${reservation.code}`}
        title={guest ? formatGuestName(guest.firstName, guest.lastName) : "Detalle de reserva"}
        description={`${formatDate(reservation.checkIn)} → ${formatDate(reservation.checkOut)} · ${room?.displayName ?? "Sin habitación"}`}
        actions={<><Link className="admin-button admin-button--secondary" href={`/admin/reservas/${reservation.id}/editar`}>Editar</Link>{reservation.balance > 0 && canManagePayments ? <Link className="admin-button admin-button--primary" href={paymentHref}>Registrar pago</Link> : null}</>}
      />

      <section className="admin-financial-summary" aria-label="Situación financiera">
        <article><span>Total acordado</span><strong>{formatCurrency(reservation.total)}</strong><small>{reservation.currency}</small></article>
        <article><span>Pagado</span><strong>{formatCurrency(reservation.paid)}</strong><small>Movimientos contabilizados</small></article>
        <article><span>Saldo pendiente</span><strong>{formatCurrency(reservation.balance)}</strong><StatusPill status={reservation.paymentStatus}>{reservation.balance > 0 ? "Pendiente" : "Saldado"}</StatusPill></article>
      </section>

      <div className="admin-dashboard-grid admin-dashboard-grid--equal">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Estadía</p><h2>Datos de la reserva</h2></div><StatusPill status={reservation.status}>{reservationStatusLabel(reservation.status)}</StatusPill></div>
          <dl className="admin-detail-list">
            <div><dt>Huésped principal</dt><dd>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin ficha"}</dd></div>
            <div><dt>Habitación</dt><dd>{room?.displayName ?? "Sin asignar"}</dd></div>
            <div><dt>Personas</dt><dd>{reservation.guestCount}</dd></div>
            <div><dt>Origen</dt><dd>{reservation.source}</dd></div>
            <div><dt>Tarifa por noche</dt><dd>{formatCurrency(reservation.nightlyRate)}</dd></div>
            <div><dt>Estado financiero</dt><dd>{reservation.paymentStatus}</dd></div>
          </dl>
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Acciones</p><h2>Continuar operación</h2></div></div>
          <div className="admin-stack-actions">
            {reservation.balance > 0 ? <Link className="admin-button admin-button--primary" href={paymentHref}>Registrar pago pendiente</Link> : null}
            {["confirmed", "partially_paid", "paid"].includes(reservation.status) ? <Link className="admin-button admin-button--secondary" href={`/admin/check-in?reservation=${reservation.id}`}>Hacer check-in</Link> : null}
            {reservation.status === "accommodated" ? <Link className="admin-button admin-button--secondary" href={`/admin/check-out?reservation=${reservation.id}`}>Hacer check-out</Link> : null}
            <Link href="/admin/reservas">Volver al listado</Link>
          </div>
        </section>
      </div>

      <section className="admin-section admin-panel">
        <div className="admin-panel__heading"><div><p>Libro financiero</p><h2>Historial de pagos</h2></div><span className="admin-count">{payments.length}</span></div>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        {payments.length ? <div className="admin-payment-history">{payments.map((payment) => (
          <article className={payment.status === "voided" ? "is-voided" : undefined} key={payment.id}>
            <div className="admin-payment-history__main">
              <div><strong>{payment.direction === "refund" ? "Reintegro" : "Pago"} · {paymentMethodLabels[payment.method]}</strong><span>{formatDateTime(payment.createdAt)} · {payment.createdByName ?? "Usuario interno"}</span></div>
              <strong>{payment.direction === "refund" ? "−" : "+"}{formatCurrency(payment.amount)}</strong>
            </div>
            <dl><div><dt>Estado</dt><dd>{payment.status === "voided" ? "Anulado" : "Registrado"}</dd></div><div><dt>Referencia</dt><dd>{payment.reference ?? "—"}</dd></div><div><dt>Nota</dt><dd>{payment.note ?? "—"}</dd></div></dl>
            {payment.status === "voided" ? <p className="admin-void-note"><strong>Anulado {payment.voidedAt ? formatDateTime(payment.voidedAt) : ""}</strong>{payment.voidReason ?? "Motivo no informado"}</p> : canManagePayments ? (
              <form className="admin-void-form" onSubmit={(event) => submitVoid(event, payment.id)}>
                <label>Motivo de anulación<input required minLength={2} maxLength={500} value={reasons[payment.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))} /></label>
                <label className="admin-checkbox"><input type="checkbox" checked={confirmations[payment.id] ?? false} onChange={(event) => setConfirmations((current) => ({ ...current, [payment.id]: event.target.checked }))} /> Confirmo que este pago debe quedar anulado.</label>
                <button className="admin-button admin-button--compact" disabled={busyPayment === payment.id} type="submit">{busyPayment === payment.id ? "Anulando…" : "Anular pago"}</button>
              </form>
            ) : null}
          </article>
        ))}</div> : <EmptyState title="Sin movimientos" description="Esta reserva todavía no tiene pagos registrados." />}
      </section>
    </>
  );
}
