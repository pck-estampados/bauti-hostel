"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { roomStatusLabel } from "../components/ui";
import { allowedRoomStatusTransitions } from "../data/stay-operations-core";
import type { RoomStatus } from "../lib/types";

export type CleaningRoom = { room_id: string; code: string; display_name: string;
  sector: string | null; status: RoomStatus; cleaning_note: string | null; task_status: string | null };
const cleaningStates: RoomStatus[] = ["pending_cleaning", "cleaning", "clean", "ready"];

export function CleaningConsole({ rooms, canManage }: { rooms: CleaningRoom[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(roomId: string, status: RoomStatus) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/operations", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "changeRoomStatus", payload: { roomId, status, reason: "Actualización del flujo de limpieza." } }) });
      if (!response.ok) throw new Error("No se pudo cambiar el estado. Revisá tus permisos y recargá la vista.");
      setMessage("Estado actualizado."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo completar la operación."); }
    finally { setBusy(false); }
  }
  return <>
    {message ? <p role="status">{message}</p> : null}
    <div className="admin-config-records">{rooms.map((room) => <section className="admin-config-card" key={room.room_id}>
      <h2>{room.display_name} · {room.code}</h2>
      <p>{room.sector || "Sector no indicado"} · {roomStatusLabel(room.status)}</p>
      <p>{room.cleaning_note || "Sin instrucciones adicionales de limpieza."}</p>
      {canManage && cleaningStates.includes(room.status) ? <div className="admin-config-actions">
        {allowedRoomStatusTransitions(room.status).filter((status) => cleaningStates.includes(status)).map((status) =>
          <button className="admin-button" key={status} disabled={busy} onClick={() => void change(room.room_id, status)} type="button">{roomStatusLabel(status)}</button>)}
      </div> : <small>Este estado requiere intervención de Gerencia.</small>}
    </section>)}</div>
  </>;
}
