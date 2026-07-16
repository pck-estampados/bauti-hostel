"use client";

import Link from "next/link";
import { useOperations } from "./components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDate, reservationStatusLabel, roomStatusLabel, StatusPill } from "./components/ui";
import { dashboardSnapshot, formatGuestName } from "./lib/operations";

export default function AdminDashboardPage() {
  const { state, mode } = useOperations();
  const snapshot = dashboardSnapshot(state);
  const guest = (id: string) => state.guests.find((item) => item.id === id);
  const room = (id?: string) => state.rooms.find((item) => item.id === id);

  const metrics = [
    { label: "Huéspedes alojados", value: snapshot.currentGuests, tone: "ink" },
    { label: "Check-ins pendientes", value: snapshot.arrivals.length, tone: "clay" },
    { label: "Check-outs de hoy", value: snapshot.departures.length, tone: "sand" },
    { label: "Habitaciones ocupadas", value: snapshot.occupiedRooms, tone: "sage" },
    { label: "Habitaciones libres", value: snapshot.freeRooms, tone: "green" },
    { label: "Saldos por cobrar", value: formatCurrency(snapshot.pendingBalanceTotal), tone: "money" },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Hoy · operación en curso"
        title="Todo lo importante, a primera vista."
        description={mode === "demo" ? "Llegadas, salidas, ocupación y cobros pendientes del entorno de prueba." : "Llegadas, salidas, ocupación y cobros pendientes de la operación real."}
        actions={<><Link className="admin-button admin-button--primary" href="/admin/walk-in">Registrar ingreso sin reserva</Link><Link className="admin-button admin-button--secondary" href="/admin/reservas/nueva">Nueva reserva</Link></>}
      />

      <section className="admin-metric-grid" aria-label="Resumen de hoy">
        {metrics.map((metric) => <article className={`admin-metric admin-metric--${metric.tone}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><p>Acciones rápidas</p><h2>Resolver desde recepción</h2></div></div>
        <div className="admin-quick-grid">
          {[
            ["/admin/walk-in", "WI", "Ingreso sin reserva", "Registrar y hacer check-in"],
            ["/admin/huespedes/nuevo", "HU", "Nuevo huésped", "Crear ficha básica"],
            ["/admin/check-in", "IN", "Hacer check-in", "Confirmar una llegada"],
            ["/admin/check-out", "OU", "Hacer check-out", "Cerrar una estadía"],
            ["/admin/pagos/nuevo", "PA", "Registrar pago", "Actualizar un saldo"],
            ["/admin/notas", "NO", "Agregar nota", "Dejar contexto al equipo"],
          ].map(([href, code, title, description]) => <Link className="admin-quick-action" href={href} key={href}><span>{code}</span><strong>{title}</strong><small>{description}</small><i aria-hidden="true">→</i></Link>)}
        </div>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Próximas llegadas</p><h2>Check-ins de hoy</h2></div><Link href="/admin/reservas">Ver reservas</Link></div>
          {snapshot.arrivals.length ? <div className="admin-record-list">{snapshot.arrivals.map((reservation) => {
            const person = guest(reservation.primaryGuestId); const assignedRoom = room(reservation.roomId);
            return <article className="admin-record" key={reservation.id}><div className="admin-avatar">{person?.firstName.slice(0,1)}</div><div className="admin-record__main"><strong>{person ? formatGuestName(person.firstName, person.lastName) : "Sin huésped"}</strong><span>{reservation.guestCount} personas · {assignedRoom?.displayName ?? "Sin habitación"} · {reservation.expectedArrival ?? "Hora no informada"}</span></div><StatusPill status={reservation.paymentStatus}>{reservationStatusLabel(reservation.status)}</StatusPill><Link className="admin-button admin-button--compact" href={`/admin/check-in?reservation=${reservation.id}`}>Check-in</Link></article>;
          })}</div> : <EmptyState title="Sin llegadas pendientes" description={mode === "demo" ? "No hay check-ins pendientes para hoy en los datos de prueba." : "No hay check-ins pendientes para hoy."} />}
        </section>

        <aside className="admin-panel admin-alert-panel">
          <div className="admin-panel__heading"><div><p>Alertas</p><h2>Requiere atención</h2></div><span className="admin-count">{snapshot.pendingBalances.length + snapshot.openIssues}</span></div>
          <div className="admin-alert-list">
            {snapshot.departures.filter((item) => item.balance > 0).map((item) => <Link href={`/admin/check-out?reservation=${item.id}`} key={item.id}><span className="admin-alert-dot admin-alert-dot--danger" /><div><strong>Salida con saldo pendiente</strong><small>{item.code} · {formatCurrency(item.balance)}</small></div></Link>)}
            {snapshot.pendingBalances.slice(0, 2).map((item) => <Link href={`/admin/pagos/nuevo?reservation=${item.id}`} key={item.id}><span className="admin-alert-dot admin-alert-dot--warning" /><div><strong>Pago pendiente</strong><small>{item.code} · {formatCurrency(item.balance)}</small></div></Link>)}
            {state.issues.filter((item) => item.status === "open").map((item) => <Link href="/admin/habitaciones" key={item.id}><span className="admin-alert-dot" /><div><strong>{item.title}</strong><small>{item.area} · prioridad {item.priority}</small></div></Link>)}
          </div>
        </aside>
      </div>

      <div className="admin-dashboard-grid admin-dashboard-grid--equal">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Salidas de hoy</p><h2>Antes de las 10:00</h2></div><Link href="/admin/check-out">Ver todas</Link></div>
          {snapshot.departures.map((reservation) => { const person = guest(reservation.primaryGuestId); const assignedRoom = room(reservation.roomId); return <article className="admin-compact-record" key={reservation.id}><div><strong>{person ? formatGuestName(person.firstName, person.lastName) : reservation.code}</strong><span>{assignedRoom?.displayName} · saldo {formatCurrency(reservation.balance)}</span></div><Link className="admin-button admin-button--compact" href={`/admin/check-out?reservation=${reservation.id}`}>Check-out</Link></article>; })}
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Alojados ahora</p><h2>Estadías activas</h2></div><Link href="/admin/huespedes/actuales">Ver huéspedes</Link></div>
          {snapshot.active.map((reservation) => { const person = guest(reservation.primaryGuestId); const assignedRoom = room(reservation.roomId); return <article className="admin-compact-record" key={reservation.id}><div><strong>{person ? formatGuestName(person.firstName, person.lastName) : reservation.code}</strong><span>{assignedRoom?.displayName} · sale {formatDate(reservation.checkOut)}</span></div><StatusPill status={reservation.paymentStatus}>{formatCurrency(reservation.balance)} saldo</StatusPill></article>; })}
        </section>
      </div>

      <section className="admin-section admin-room-strip">
        <div className="admin-section-heading"><div><p>{mode === "demo" ? "Estado del inventario de prueba" : "Estado del inventario real"}</p><h2>Habitaciones ahora</h2></div><Link href="/admin/habitaciones">Abrir vista completa →</Link></div>
        {state.rooms.length ? <div className="admin-room-strip__grid">{state.rooms.map((item) => <article key={item.id}><span>{item.code}</span><strong>{item.displayName}</strong><StatusPill status={item.status}>{roomStatusLabel(item.status)}</StatusPill></article>)}</div> : <EmptyState title="Sin habitaciones configuradas" description="El inventario está vacío. Creá las habitaciones reales desde Configuración antes de operar." action={{ href: "/admin/configuracion#habitaciones", label: "Ir a configuración" }} />}
      </section>
    </>
  );
}
