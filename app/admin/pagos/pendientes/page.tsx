"use client";

import Link from "next/link";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDate, StatusPill } from "../../components/ui";
import { formatGuestName } from "../../lib/operations";

export default function PendingPaymentsPage() {
  const { state } = useOperations(); const pending = state.reservations.filter((item) => item.balance > 0 && !["cancelled", "rejected"].includes(item.status)).sort((a,b) => a.checkOut.localeCompare(b.checkOut));
  const total = pending.reduce((sum, item) => sum + item.balance, 0);
  return <><AdminPageHeader eyebrow="Caja y cobranzas" title="Pagos y saldos pendientes" description="Prioriza estadías activas, salidas próximas y reservas con importes por cobrar." actions={<Link className="admin-button admin-button--primary" href="/admin/pagos/nuevo">Registrar pago</Link>} /><div className="admin-balance-summary"><div><span>Saldo total de prueba</span><strong>{formatCurrency(total)}</strong></div><div><span>Operaciones pendientes</span><strong>{pending.length}</strong></div><div><span>Moneda</span><strong>ARS</strong></div></div>{pending.length ? <div className="admin-list-panel"><div className="admin-list-panel__head admin-list-panel__head--payments"><span>Huésped</span><span>Habitación</span><span>Total</span><span>Pagado</span><span>Saldo</span><span>Salida</span><span>Acción</span></div>{pending.map((reservation) => { const guest = state.guests.find((item) => item.id === reservation.primaryGuestId); const room = state.rooms.find((item) => item.id === reservation.roomId); return <article className="admin-list-row admin-list-row--payments" key={reservation.id}><div><strong>{guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code}</strong><small>{reservation.code}</small></div><span>{room?.displayName ?? "Sin asignar"}</span><span>{formatCurrency(reservation.total)}</span><span>{formatCurrency(reservation.paid)}</span><StatusPill status="partial">{formatCurrency(reservation.balance)}</StatusPill><span>{formatDate(reservation.checkOut)}</span><Link href={`/admin/pagos/nuevo?reservation=${reservation.id}`}>Registrar</Link></article>; })}</div> : <EmptyState title="No hay saldos pendientes" description="Todos los importes del entorno de prueba están conciliados." />}</>;
}
