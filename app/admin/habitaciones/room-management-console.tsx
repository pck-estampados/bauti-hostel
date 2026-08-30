"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  ManagedBed,
  ManagedRoom,
  ManagedRoomType,
  RoomManagementSnapshot,
} from "@/app/admin/data/room-management-types";
import {
  AdminPageHeader,
  EmptyState,
  formatCurrency,
  roomStatusLabel,
  StatusPill,
} from "@/app/admin/components/ui";
import { allowedRoomStatusTransitions } from "@/app/admin/data/stay-operations-core";

type Props = {
  initialSnapshot: RoomManagementSnapshot;
  initialError: string;
  canRead: boolean;
  canManageRooms: boolean;
  canManageRoomTypes: boolean;
  mode: "demo" | "production";
};

type ApiPayload = {
  error?: string;
  state?: RoomManagementSnapshot;
};

const bedTypeLabels: Record<ManagedBed["bedType"], string> = {
  single: "Individual",
  double: "Doble",
  bunk_single: "Cucheta individual",
  crib: "Cuna",
  other: "Otra",
};

function formValue(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as ApiPayload;
  if (!response.ok) {
    throw new Error(payload.error ?? "No fue posible completar la operación.");
  }
  return payload;
}

function roomPayload(form: FormData) {
  return {
    roomTypeId: formValue(form, "roomTypeId"),
    code: formValue(form, "code"),
    displayName: formValue(form, "displayName"),
    capacity: Number(formValue(form, "capacity")),
    sector: formValue(form, "sector"),
    internalNotes: formValue(form, "internalNotes"),
    active: form.has("active"),
  };
}

function roomTypePayload(form: FormData) {
  return {
    code: formValue(form, "code").toLowerCase(),
    internalName: formValue(form, "internalName"),
    publicName: formValue(form, "publicName"),
    description: formValue(form, "description"),
    defaultCapacity: Number(formValue(form, "defaultCapacity")),
    baseRate: Number(formValue(form, "baseRate")),
    active: form.has("active"),
  };
}

function bedPayload(form: FormData) {
  return {
    code: formValue(form, "code"),
    bedType: formValue(form, "bedType"),
    quantity: Number(formValue(form, "quantity")),
    capacity: Number(formValue(form, "capacity")),
    active: form.has("active"),
  };
}

function BedFields({ bed }: { bed?: ManagedBed }) {
  return (
    <div className="admin-field-grid admin-field-grid--compact">
      <label>
        Código
        <input defaultValue={bed?.code ?? ""} maxLength={40} name="code" required />
      </label>
      <label>
        Tipo de cama
        <select defaultValue={bed?.bedType ?? "single"} name="bedType" required>
          {Object.entries(bedTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        Cantidad
        <input defaultValue={bed?.quantity ?? 1} max={30} min={1} name="quantity" required type="number" />
      </label>
      <label>
        Personas por cama
        <input defaultValue={bed?.capacity ?? 1} max={4} min={1} name="capacity" required type="number" />
      </label>
      {bed?.active ? (
        <div className="admin-check-field admin-check-field--locked">
          <input name="active" type="hidden" value="on" />
          Activa. Usá “Desactivar” para darla de baja.
        </div>
      ) : (
        <label className="admin-check-field">
          <input defaultChecked={!bed} name="active" type="checkbox" />
          {bed ? "Reactivar cama" : "Cama activa"}
        </label>
      )}
    </div>
  );
}

function RoomFields({ room, roomTypes }: { room?: ManagedRoom; roomTypes: ManagedRoomType[] }) {
  return (
    <div className="admin-field-grid">
      <label>
        Tipo de habitación
        <select defaultValue={room?.roomTypeId ?? ""} name="roomTypeId" required>
          <option value="">Seleccionar tipo</option>
          {roomTypes.filter((item) => item.active || item.id === room?.roomTypeId).map((item) => (
            <option key={item.id} value={item.id}>
              {item.publicName} {!item.active ? "(inactivo)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Código interno
        <input defaultValue={room?.code ?? ""} maxLength={30} name="code" required />
      </label>
      <label>
        Nombre visible
        <input defaultValue={room?.displayName ?? ""} maxLength={100} name="displayName" required />
      </label>
      <label>
        Capacidad declarada
        <input defaultValue={room?.capacity ?? ""} max={30} min={1} name="capacity" required type="number" />
      </label>
      <label>
        Planta o sector <small>(opcional)</small>
        <input defaultValue={room?.sector ?? ""} maxLength={100} name="sector" />
      </label>
      {room?.active ? (
        <div className="admin-check-field admin-check-field--locked">
          <input name="active" type="hidden" value="on" />
          Activa en el inventario. Usá “Desactivar” para darla de baja.
        </div>
      ) : (
        <label className="admin-check-field">
          <input defaultChecked={!room} name="active" type="checkbox" />
          {room ? "Reactivar en el inventario" : "Activa en el inventario"}
        </label>
      )}
      <label className="admin-field--full">
        Observaciones internas <small>(opcional)</small>
        <textarea defaultValue={room?.internalNotes ?? ""} maxLength={2_000} name="internalNotes" />
      </label>
    </div>
  );
}

function RoomTypeFields({ roomType }: { roomType?: ManagedRoomType }) {
  return (
    <div className="admin-field-grid">
      <label>
        Código interno
        <input defaultValue={roomType?.code ?? ""} maxLength={50} name="code" pattern="[a-z0-9][a-z0-9_-]{1,49}" required />
      </label>
      <label>
        Nombre interno
        <input defaultValue={roomType?.internalName ?? ""} maxLength={100} name="internalName" required />
      </label>
      <label>
        Nombre público
        <input defaultValue={roomType?.publicName ?? ""} maxLength={120} name="publicName" required />
      </label>
      <label>
        Capacidad estándar
        <input defaultValue={roomType?.defaultCapacity ?? ""} max={30} min={1} name="defaultCapacity" required type="number" />
      </label>
      <label>
        Tarifa base (ARS)
        <input defaultValue={roomType?.baseRate || ""} max={100_000_000} min={1} name="baseRate" required step="1" type="number" />
      </label>
      <label className="admin-check-field">
        <input defaultChecked={roomType?.active ?? true} name="active" type="checkbox" />
        Tipo activo
      </label>
      <label className="admin-field--full">
        Descripción <small>(opcional)</small>
        <textarea defaultValue={roomType?.description ?? ""} maxLength={500} name="description" />
      </label>
    </div>
  );
}

export function RoomManagementConsole({
  initialSnapshot,
  initialError,
  canRead,
  canManageRooms,
  canManageRoomTypes,
  mode,
}: Props) {
  const [state, setState] = useState(initialSnapshot);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const roomTypeById = useMemo(
    () => new Map(state.roomTypes.map((item) => [item.id, item])),
    [state.roomTypes],
  );
  const activeRoomTypes = state.roomTypes.filter((item) => item.active);
  const activeRooms = state.rooms.filter((room) => room.active);
  const activeBeds = state.beds.filter((bed) => bed.active);
  const inventoryConfigured = activeRoomTypes.length > 0
    && activeRooms.length > 0
    && activeRooms.every((room) => room.bedCapacity >= room.capacity);

  async function refresh() {
    const response = await fetch("/api/admin/rooms", { credentials: "same-origin" });
    const payload = await readResponse(response);
    if (!payload.state) throw new Error("La respuesta del inventario está incompleta.");
    setState(payload.state);
  }

  async function run(key: string, action: () => Promise<void>, success: string) {
    if (mode !== "production") {
      setError("La gestión real sólo está disponible en producción.");
      return;
    }
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible completar la operación.");
    } finally {
      setBusy("");
    }
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = roomPayload(new FormData(form));
    void run("create-room", async () => {
      await readResponse(await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
      form.reset();
      setShowRoomForm(false);
    }, "Habitación creada en Supabase. Quedó fuera de servicio hasta su habilitación operativa.");
  }

  function updateRoom(event: FormEvent<HTMLFormElement>, room: ManagedRoom) {
    event.preventDefault();
    const payload = roomPayload(new FormData(event.currentTarget));
    void run(`update-room-${room.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
    }, "Habitación actualizada y persistida.");
  }

  function deactivateRoom(room: ManagedRoom) {
    if (!window.confirm(`¿Desactivar “${room.displayName}”? Quedará fuera de servicio y no se eliminará su historial.`)) return;
    void run(`deactivate-room-${room.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      }));
    }, "Habitación desactivada de forma segura.");
  }

  function updateRoomStatus(event: FormEvent<HTMLFormElement>, room: ManagedRoom) {
    event.preventDefault();
    const status = formValue(new FormData(event.currentTarget), "status");
    void run(`status-room-${room.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
      }));
    }, "Estado operativo actualizado.");
  }

  function createRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = roomTypePayload(new FormData(form));
    void run("create-room-type", async () => {
      await readResponse(await fetch("/api/admin/room-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
      form.reset();
      setShowTypeForm(false);
    }, "Tipo de habitación creado en Supabase.");
  }

  function updateRoomType(event: FormEvent<HTMLFormElement>, roomType: ManagedRoomType) {
    event.preventDefault();
    const payload = roomTypePayload(new FormData(event.currentTarget));
    void run(`update-room-type-${roomType.id}`, async () => {
      await readResponse(await fetch(`/api/admin/room-types/${roomType.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
    }, "Tipo de habitación actualizado y persistido.");
  }

  function createBed(event: FormEvent<HTMLFormElement>, room: ManagedRoom) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = bedPayload(new FormData(form));
    void run(`create-bed-${room.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/beds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
      form.reset();
    }, "Cama creada y vinculada a la habitación.");
  }

  function updateBed(
    event: FormEvent<HTMLFormElement>,
    room: ManagedRoom,
    bed: ManagedBed,
  ) {
    event.preventDefault();
    const payload = bedPayload(new FormData(event.currentTarget));
    void run(`update-bed-${bed.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/beds/${bed.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }));
    }, "Cama actualizada y persistida.");
  }

  function deactivateBed(room: ManagedRoom, bed: ManagedBed) {
    if (!window.confirm(`¿Desactivar la cama “${bed.code}”? No se eliminará su historial.`)) return;
    void run(`deactivate-bed-${bed.id}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/beds/${bed.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      }));
    }, "Cama desactivada de forma segura.");
  }

  function assignService(room: ManagedRoom, serviceId: string) {
    void run(`assign-service-${room.id}-${serviceId}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/services`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ serviceId }),
      }));
    }, "Servicio asignado a la habitación.");
  }

  function removeService(room: ManagedRoom, serviceId: string) {
    void run(`remove-service-${room.id}-${serviceId}`, async () => {
      await readResponse(await fetch(`/api/admin/rooms/${room.id}/services/${serviceId}`, {
        method: "DELETE",
        credentials: "same-origin",
      }));
    }, "Servicio retirado de la habitación.");
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Inventario real"
        title="Habitaciones"
        description="Administrá habitaciones, camas y servicios reales. Todas las escrituras usan tu sesión y quedan sujetas a RLS."
        actions={canManageRooms ? (
          <button
            className="admin-button admin-button--primary"
            onClick={() => setShowRoomForm((visible) => !visible)}
            type="button"
          >
            Agregar habitación
          </button>
        ) : undefined}
      />

      {!canRead ? (
        <p className="admin-form-error" role="alert">No tenés permiso para ver el inventario de habitaciones.</p>
      ) : null}
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      {message ? <p className="admin-form-success" role="status">{message}</p> : null}

      {canRead ? (
        <section className="admin-inventory-summary" aria-label="Estado del inventario de Casa Albor">
          <div><span>Tipos de habitación</span><strong>{state.roomTypes.length}</strong></div>
          <div><span>Habitaciones</span><strong>{state.rooms.length}</strong></div>
          <div><span>Camas activas</span><strong>{activeBeds.reduce((total, bed) => total + bed.quantity, 0)}</strong></div>
          <div><span>Servicios existentes</span><strong>{state.services.length}</strong></div>
          <div className="admin-inventory-summary__state">
            <span>Estado</span>
            <strong>{inventoryConfigured ? "Inventario configurado" : "Configuración incompleta"}</strong>
          </div>
        </section>
      ) : null}

      {showRoomForm ? (
        <section className="admin-room-management-panel" aria-labelledby="create-room-title">
          <div className="admin-panel__heading">
            <div><p>Nueva fila real</p><h2 id="create-room-title">Agregar habitación</h2></div>
            <button className="admin-button admin-button--compact" onClick={() => setShowRoomForm(false)} type="button">Cerrar</button>
          </div>
          {activeRoomTypes.length ? (
            <form onSubmit={createRoom}>
              <RoomFields roomTypes={state.roomTypes} />
              <div className="admin-config-actions">
                <small>Se creará fuera de servicio. La habilitación operativa se realiza después.</small>
                <button className="admin-button admin-button--primary" disabled={busy === "create-room"} type="submit">
                  {busy === "create-room" ? "Guardando…" : "Guardar habitación"}
                </button>
              </div>
            </form>
          ) : (
            <div className="admin-room-prerequisite" role="status">
              <strong>Primero necesitás un tipo de habitación activo.</strong>
              <p>No se crearán tipos ni datos ficticios automáticamente.</p>
              {canManageRoomTypes ? <button className="admin-button admin-button--secondary" onClick={() => setShowTypeForm(true)} type="button">Agregar tipo de habitación</button> : null}
            </div>
          )}
        </section>
      ) : null}

      {canRead ? (
        <section className="admin-section" aria-busy={busy !== ""}>
          <div className="admin-section-heading">
            <div><p>Inventario físico</p><h2>{state.rooms.length} habitación{state.rooms.length === 1 ? "" : "es"}</h2></div>
            <span className="admin-config-state">{state.rooms.filter((room) => room.active).length} activas</span>
          </div>
          {state.rooms.length ? (
            <div className="admin-room-management-grid">
              {state.rooms.map((room) => {
                const roomType = roomTypeById.get(room.roomTypeId);
                const roomBeds = state.beds.filter((bed) => bed.roomId === room.id);
                const activeRoomBeds = roomBeds.filter((bed) => bed.active);
                const activeBedUnits = activeRoomBeds.reduce(
                  (total, bed) => total + bed.quantity,
                  0,
                );
                const activeBedCapacity = activeRoomBeds.reduce(
                  (total, bed) => total + bed.quantity * bed.capacity,
                  0,
                );
                const visibleServices = state.services.filter(
                  (service) => service.active || room.serviceIds.includes(service.id),
                );
                return (
                  <details className="admin-config-record admin-room-management-record" key={room.id}>
                    <summary>
                      <div>
                        <strong>{room.displayName}</strong>
                        <span>{room.code} · {roomType?.publicName ?? "Tipo no disponible"} · capacidad {room.capacity}</span>
                      </div>
                      <span>{room.active ? roomStatusLabel(room.status) : "Inactiva"}</span>
                    </summary>
                    <div className="admin-room-management-meta">
                      <StatusPill status={room.status}>{roomStatusLabel(room.status)}</StatusPill>
                      <span>{activeBedUnits} camas activas · {activeBedCapacity} plazas de {room.capacity}</span>
                      <span>{room.serviceIds.length} servicios asignados</span>
                      <span>Sector: {room.sector || "Sin informar"}</span>
                    </div>
                    {activeBedCapacity !== room.capacity ? (
                      <p className="admin-capacity-warning" role="status">
                        Capacidad inconsistente: la habitación declara {room.capacity} plazas y las camas activas suman {activeBedCapacity}. Podés guardar, pero revisá el inventario antes de habilitar reservas.
                      </p>
                    ) : null}
                    <h3 className="admin-room-management-subtitle">Estado</h3>
                    <form className="admin-room-status-form" onSubmit={(event) => updateRoomStatus(event, room)}>
                      <label>
                        Estado operativo
                        <select defaultValue={allowedRoomStatusTransitions(room.status)[0]} disabled={!room.active || !allowedRoomStatusTransitions(room.status).length} name="status">
                          {allowedRoomStatusTransitions(room.status).map((status) => <option key={status} value={status}>{roomStatusLabel(status)}</option>)}
                        </select>
                      </label>
                      <button className="admin-button admin-button--secondary" disabled={!canManageRooms || !room.active || !allowedRoomStatusTransitions(room.status).length || busy !== ""} type="submit">
                        {busy === `status-room-${room.id}` ? "Actualizando…" : "Cambiar estado"}
                      </button>
                    </form>
                    <h3 className="admin-room-management-subtitle">Editar</h3>
                    <form
                      key={`${room.id}-${room.roomTypeId}-${room.code}-${room.displayName}-${room.capacity}-${room.active}`}
                      onSubmit={(event) => updateRoom(event, room)}
                    >
                      <RoomFields room={room} roomTypes={state.roomTypes} />
                      <div className="admin-config-actions">
                        <small>Editar no modifica el estado operativo. Desactivar sí la deja fuera de servicio.</small>
                        <div className="admin-room-management-actions">
                          {room.active ? (
                            <button className="admin-button admin-button--danger" disabled={!canManageRooms || busy !== ""} onClick={() => deactivateRoom(room)} type="button">Desactivar</button>
                          ) : null}
                          <button className="admin-button admin-button--primary" disabled={!canManageRooms || busy !== ""} type="submit">
                            {busy === `update-room-${room.id}` ? "Guardando…" : "Guardar cambios"}
                          </button>
                        </div>
                      </div>
                    </form>

                    <details className="admin-room-inventory-section">
                      <summary>
                        <strong>Camas</strong>
                        <span>{activeBedUnits} activas · {activeBedCapacity} plazas</span>
                      </summary>
                      <div className="admin-room-inventory-section__body">
                        {roomBeds.length ? (
                          <div className="admin-config-records">
                            {roomBeds.map((bed) => (
                              <details className="admin-bed-record" key={bed.id}>
                                <summary>
                                  <strong>{bed.code}</strong>
                                  <span>{bed.quantity} × {bedTypeLabels[bed.bedType]} · {bed.capacity} persona{bed.capacity === 1 ? "" : "s"} cada una · {bed.active ? "Activa" : "Inactiva"}</span>
                                </summary>
                                <form
                                  key={`${bed.id}-${bed.code}-${bed.bedType}-${bed.quantity}-${bed.capacity}-${bed.active}`}
                                  onSubmit={(event) => updateBed(event, room, bed)}
                                >
                                  <BedFields bed={bed} />
                                  <div className="admin-config-actions">
                                    <small>Editar conserva la asociación con {room.displayName}.</small>
                                    <div className="admin-room-management-actions">
                                      {bed.active ? (
                                        <button
                                          className="admin-button admin-button--danger"
                                          disabled={!canManageRoomTypes || busy !== ""}
                                          onClick={() => deactivateBed(room, bed)}
                                          type="button"
                                        >
                                          Desactivar cama
                                        </button>
                                      ) : null}
                                      <button
                                        className="admin-button admin-button--primary"
                                        disabled={!canManageRoomTypes || busy !== ""}
                                        type="submit"
                                      >
                                        {busy === `update-bed-${bed.id}` ? "Guardando…" : "Guardar cama"}
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              </details>
                            ))}
                          </div>
                        ) : (
                          <p className="admin-room-management-note">No hay camas cargadas para esta habitación.</p>
                        )}

                        {canManageRoomTypes ? (
                          <form className="admin-room-management-panel" onSubmit={(event) => createBed(event, room)}>
                            <h4>Agregar cama real</h4>
                            <BedFields />
                            <div className="admin-config-actions">
                              <small>No se completará ningún dato automáticamente.</small>
                              <button
                                className="admin-button admin-button--primary"
                                disabled={busy !== ""}
                                type="submit"
                              >
                                {busy === `create-bed-${room.id}` ? "Guardando…" : "Agregar cama"}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    </details>

                    <details className="admin-room-inventory-section">
                      <summary>
                        <strong>Servicios</strong>
                        <span>{room.serviceIds.length} asignados de {state.services.length}</span>
                      </summary>
                      <div className="admin-room-inventory-section__body">
                        {visibleServices.length ? (
                          <ul className="admin-room-service-list">
                            {visibleServices.map((service) => {
                              const assigned = room.serviceIds.includes(service.id);
                              const actionKey = `${assigned ? "remove" : "assign"}-service-${room.id}-${service.id}`;
                              return (
                                <li key={service.id}>
                                  <div>
                                    <strong>{service.name}</strong>
                                    <span>{service.description || service.code}</span>
                                  </div>
                                  <div className="admin-room-service-action">
                                    <span>{assigned ? "Asignado" : service.active ? "Disponible" : "Inactivo"}</span>
                                    <button
                                      className={`admin-button ${assigned ? "admin-button--danger" : "admin-button--secondary"}`}
                                      disabled={!canManageRoomTypes || busy !== "" || (!service.active && !assigned)}
                                      onClick={() => assigned
                                        ? removeService(room, service.id)
                                        : assignService(room, service.id)}
                                      type="button"
                                    >
                                      {busy === actionKey ? "Guardando…" : assigned ? "Quitar" : "Asignar"}
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="admin-room-management-note">No hay servicios activos disponibles.</p>
                        )}
                      </div>
                    </details>
                  </details>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No hay habitaciones cargadas."
              description="Agregá únicamente habitaciones reales cuando cuentes con sus datos confirmados."
            />
          )}
        </section>
      ) : null}

      {canRead ? (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div><p>Requisito estructural</p><h2>Tipos de habitación</h2></div>
            {canManageRoomTypes ? (
              <button className="admin-button admin-button--secondary" onClick={() => setShowTypeForm((visible) => !visible)} type="button">Agregar tipo</button>
            ) : null}
          </div>
          <p className="admin-room-management-note">El catálogo tiene {state.serviceCount} servicios existentes cargados desde Supabase. Esta pantalla sólo permite asignarlos; no crea ni modifica sus definiciones.</p>

          {showTypeForm ? (
            <form className="admin-room-management-panel" onSubmit={createRoomType}>
              <div className="admin-panel__heading"><div><p>Sin datos automáticos</p><h2>Nuevo tipo real</h2></div></div>
              <RoomTypeFields />
              <div className="admin-config-actions">
                <small>La tarifa y los nombres deben ser reales y confirmados.</small>
                <button className="admin-button admin-button--primary" disabled={busy === "create-room-type"} type="submit">
                  {busy === "create-room-type" ? "Guardando…" : "Guardar tipo"}
                </button>
              </div>
            </form>
          ) : null}

          {state.roomTypes.length ? (
            <div className="admin-config-records">
              {state.roomTypes.map((roomType) => (
                <details className="admin-config-record" key={roomType.id}>
                  <summary>
                    <div><strong>{roomType.publicName}</strong><span>{roomType.code} · capacidad {roomType.defaultCapacity} · {formatCurrency(roomType.baseRate)}</span></div>
                    <span>{roomType.active ? "Activo" : "Inactivo"}</span>
                  </summary>
                  <form
                    key={`${roomType.id}-${roomType.code}-${roomType.publicName}-${roomType.defaultCapacity}-${roomType.baseRate}-${roomType.active}`}
                    onSubmit={(event) => updateRoomType(event, roomType)}
                  >
                    <RoomTypeFields roomType={roomType} />
                    <div className="admin-config-actions">
                      <small>Desmarcar “Tipo activo” aplica una baja lógica; no elimina referencias.</small>
                      <button className="admin-button admin-button--primary" disabled={!canManageRoomTypes || busy !== ""} type="submit">
                        {busy === `update-room-type-${roomType.id}` ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  </form>
                </details>
              ))}
            </div>
          ) : (
            <EmptyState title="No hay tipos de habitación cargados." description="Ingresá el primer tipo real para habilitar la creación de habitaciones." />
          )}
        </section>
      ) : null}
    </>
  );
}
