"use client";

import { useState } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, roomStatusLabel, StatusPill } from "../components/ui";
import { formatGuestName } from "../lib/operations";
import type { RoomStatus } from "../lib/types";

export default function RoomsNowPage() {
  const { state, changeRoomStatus } = useOperations();
  const [message, setMessage] = useState("");
  const activeByRoom = new Map(state.reservations.filter((item) => item.roomId && item.status === "accommodated").map((item) => [item.roomId, item]));

  function change(id: string, status: RoomStatus) {
    try { changeRoomStatus(id, status); setMessage("Estado actualizado en el entorno de prueba."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible actualizar."); }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Operación en tiempo real" title="Habitaciones ahora" description="Una lectura rápida del estado operativo. El inventario mostrado es únicamente de prueba." />
      {message ? <p className="admin-feedback" role="status">{message}</p> : null}
      <div className="admin-room-grid">
        {state.rooms.map((room) => {
          const reservation = activeByRoom.get(room.id); const guest = reservation ? state.guests.find((item) => item.id === reservation.primaryGuestId) : undefined;
          return <article className={`admin-room-card admin-room-card--${room.status}`} key={room.id}><div className="admin-room-card__top"><span>{room.code}</span><StatusPill status={room.status}>{roomStatusLabel(room.status)}</StatusPill></div><h2>{room.displayName}</h2>{reservation && guest ? <div className="admin-room-guest"><strong>{formatGuestName(guest.firstName, guest.lastName)}</strong><span>{reservation.guestCount} persona{reservation.guestCount === 1 ? "" : "s"} · salida {reservation.checkOut}</span></div> : <p>{room.statusNote ?? (room.status === "ready" ? "Lista para recibir huéspedes." : "Sin estadía activa asignada.")}</p>}<div className="admin-room-card__actions">{room.status === "pending_cleaning" ? <button onClick={() => change(room.id, "cleaning")}>Iniciar limpieza</button> : null}{room.status === "cleaning" ? <button onClick={() => change(room.id, "clean")}>Marcar limpia</button> : null}{room.status === "clean" ? <button onClick={() => change(room.id, "ready")}>Marcar lista</button> : null}{room.status === "ready" || room.status === "available" ? <button onClick={() => change(room.id, "blocked")}>Bloquear</button> : null}{room.status === "blocked" ? <button onClick={() => change(room.id, "ready")}>Desbloquear</button> : null}</div></article>;
        })}
      </div>
    </>
  );
}
