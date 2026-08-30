"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOperations } from "../components/operations-provider";
import {
  AdminPageHeader,
  EmptyState,
  formatCurrency,
  formatDate,
  reservationStatusLabel,
  roomStatusLabel,
  StatusPill,
} from "../components/ui";
import {
  allowedRoomStatusTransitions,
  buildStayOperationsReadModel,
} from "../data/stay-operations-core";
import { formatGuestName } from "../lib/operations";
import type { RoomStatus } from "../lib/types";

function StayRecord({ reservationId, action }: { reservationId: string; action?: "check-in" | "check-out" }) {
  const { state } = useOperations();
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation) return null;
  const guest = state.guests.find((item) => item.id === reservation.primaryGuestId);
  const room = state.rooms.find((item) => item.id === reservation.roomId);
  const href = action === "check-in"
    ? `/admin/check-in?reservation=${reservation.id}`
    : `/admin/check-out?reservation=${reservation.id}`;
  return (
    <article className="admin-compact-record">
      <div>
        <strong>{guest ? formatGuestName(guest.firstName, guest.lastName) : reservation.code}</strong>
        <span>{room?.displayName ?? "Sin habitación"} · {reservation.guestCount} persona{reservation.guestCount === 1 ? "" : "s"} · {formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</span>
      </div>
      {action ? <Link className="admin-button admin-button--compact" href={href}>{action === "check-in" ? "Check-in" : "Check-out"}</Link> : <StatusPill status={reservation.status}>{reservationStatusLabel(reservation.status)}</StatusPill>}
    </article>
  );
}

export default function StayOperationsPage() {
  const { state, mode, permissions, changeRoomStatus } = useOperations();
  const snapshot = useMemo(() => buildStayOperationsReadModel(state), [state]);
  const canManageStays = mode === "demo" || permissions.includes("reservations.manage");
  const canManageRooms = mode === "demo" || permissions.some((permission) => ["rooms.manage", "housekeeping.manage"].includes(permission));
  const [targets, setTargets] = useState<Record<string, RoomStatus>>({});
  const [busyRoom, setBusyRoom] = useState("");
  const [error, setError] = useState("");

  const metrics = [
    ["Llegadas de hoy", snapshot.arrivalsToday.length],
    ["Salidas de hoy", snapshot.departuresToday.length],
    ["Personas alojadas", snapshot.currentGuests],
    ["Habitaciones ocupadas", snapshot.occupiedRooms],
    ["Pendientes de limpieza", snapshot.pendingCleaningRooms],
    ["Habitaciones disponibles", snapshot.availableRooms],
    ["Fuera de servicio", snapshot.outOfServiceRooms],
    ["Capacidad de alojamiento", snapshot.lodgingCapacity],
  ] as const;

  async function updateStatus(roomId: string, currentStatus: RoomStatus) {
    const target = targets[roomId] ?? allowedRoomStatusTransitions(currentStatus)[0];
    if (!target) return;
    setBusyRoom(roomId); setError("");
    try {
      await changeRoomStatus(roomId, target, "Actualizado desde el panel de operación.");
      setTargets((current) => ({ ...current, [roomId]: allowedRoomStatusTransitions(target)[0] ?? target }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible actualizar la habitación.");
    } finally {
      setBusyRoom("");
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={`Operación · ${formatDate(snapshot.today)}`}
        title="Estadías y habitaciones, en tiempo real."
        description="Llegadas, salidas, ocupación y preparación de habitaciones con datos persistidos en Supabase."
        actions={<><Link className="admin-button admin-button--primary" href="/admin/walk-in">Nuevo walk-in</Link><Link className="admin-button admin-button--secondary" href="/admin/calendario">Ver calendario</Link></>}
      />

      <section className="admin-metric-grid admin-metric-grid--operations" aria-label="Resumen de operación">
        {metrics.map(([label, value], index) => <article className={`admin-metric admin-metric--${["ink", "clay", "sage", "green", "sand", "green", "clay", "money"][index]}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      {snapshot.overdueCheckouts.length ? <p className="admin-operation-alert" role="alert"><strong>{snapshot.overdueCheckouts.length} salida{snapshot.overdueCheckouts.length === 1 ? "" : "s"} vencida{snapshot.overdueCheckouts.length === 1 ? "" : "s"}.</strong> Requiere revisión inmediata.</p> : null}
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}

      <div className="admin-dashboard-grid admin-dashboard-grid--equal">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Llegan hoy y pendientes</p><h2>Check-ins por resolver</h2></div><span className="admin-count">{snapshot.pendingCheckIns.length}</span></div>
          {snapshot.pendingCheckIns.length ? snapshot.pendingCheckIns.map((reservation) => <StayRecord action={canManageStays ? "check-in" : undefined} key={reservation.id} reservationId={reservation.id} />) : <EmptyState title="Sin llegadas pendientes" description="No hay reservas válidas esperando check-in." />}
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Salen hoy</p><h2>Check-outs previstos</h2></div><span className="admin-count">{snapshot.departuresToday.length}</span></div>
          {snapshot.departuresToday.length ? snapshot.departuresToday.map((reservation) => <StayRecord action={canManageStays ? "check-out" : undefined} key={reservation.id} reservationId={reservation.id} />) : <EmptyState title="Sin salidas previstas" description="No hay estadías alojadas con salida programada para hoy." />}
        </section>
      </div>

      <div className="admin-dashboard-grid admin-dashboard-grid--equal">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Alojados ahora</p><h2>Estadías activas</h2></div><span className="admin-count">{snapshot.currentlyStaying.length}</span></div>
          {snapshot.currentlyStaying.length ? snapshot.currentlyStaying.map((reservation) => <StayRecord key={reservation.id} reservationId={reservation.id} />) : <EmptyState title="No hay huéspedes alojados" description="La ocupación actual está vacía." />}
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p>Limpieza y mantenimiento</p><h2>Habitaciones que requieren atención</h2></div><span className="admin-count">{snapshot.roomsRequiringAttention.length}</span></div>
          {snapshot.roomsRequiringAttention.length ? snapshot.roomsRequiringAttention.map((room) => {
            const transitions = allowedRoomStatusTransitions(room.status);
            const task = state.housekeepingTasks.find((item) => item.roomId === room.id);
            const target = targets[room.id] ?? transitions[0] ?? room.status;
            return <article className="admin-room-attention" key={room.id}><div><strong>{room.displayName}</strong><span>{room.code}{task ? ` · tarea ${task.status}` : ""}</span></div><StatusPill status={room.status}>{roomStatusLabel(room.status)}</StatusPill>{canManageRooms && transitions.length ? <div className="admin-room-attention__actions"><label>Próximo estado<select aria-label={`Próximo estado de ${room.displayName}`} value={target} onChange={(event) => setTargets((current) => ({ ...current, [room.id]: event.target.value as RoomStatus }))}>{transitions.map((status) => <option key={status} value={status}>{roomStatusLabel(status)}</option>)}</select></label><button className="admin-button admin-button--compact" disabled={busyRoom === room.id} onClick={() => updateStatus(room.id, room.status)} type="button">{busyRoom === room.id ? "Guardando…" : "Actualizar"}</button></div> : null}</article>;
          }) : <EmptyState title="Sin habitaciones pendientes" description="No hay habitaciones esperando limpieza, mantenimiento o habilitación." />}
        </section>
      </div>

      <section className="admin-section admin-room-strip">
        <div className="admin-section-heading"><div><p>Quién está en cada habitación</p><h2>Ocupación actual</h2></div><span>{snapshot.activeRooms} activas de {snapshot.totalRooms}</span></div>
        {snapshot.roomOccupancy.length ? <div className="admin-room-occupancy-grid">{snapshot.roomOccupancy.map(({ room, reservation, guest }) => <article key={room.id}><span>{room.code}</span><strong>{room.displayName}</strong><StatusPill status={room.status}>{room.active ? roomStatusLabel(room.status) : "Inactiva"}</StatusPill>{reservation ? <dl><div><dt>Huésped</dt><dd>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin ficha"}</dd></div><div><dt>Personas</dt><dd>{reservation.guestCount}</dd></div><div><dt>Salida</dt><dd>{formatDate(reservation.checkOut)}</dd></div><div><dt>Origen</dt><dd>{reservation.source}</dd></div><div><dt>Reserva</dt><dd>{reservation.code}</dd></div><div><dt>Saldo</dt><dd>{formatCurrency(reservation.balance)}</dd></div></dl> : <p>Sin estadía activa asignada.</p>}</article>)}</div> : <EmptyState title="Sin habitaciones configuradas" description="El inventario real está vacío. Completalo desde Configuración antes de operar." action={{ href: "/admin/configuracion#habitaciones", label: "Ir a configuración" }} />}
      </section>
    </>
  );
}
