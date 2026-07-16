"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type {
  BedType,
  ConfigurationBed,
  ConfigurationProfile,
  ConfigurationRoom,
  ConfigurationRoomType,
  ConfigurationSnapshot,
} from "../data/configuration-types";
import { AdminPageHeader, EmptyState, formatCurrency, roomStatusLabel, StatusPill } from "../components/ui";

type CurrentUser = {
  id: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

type Props = {
  currentUser: CurrentUser;
  fallbackBasePrice: number | null;
  initialSnapshot: ConfigurationSnapshot;
  mode: "demo" | "production";
};

const bedTypeLabels: Record<BedType, string> = {
  single: "Individual",
  double: "Doble",
  bunk_single: "Cucheta individual",
  crib: "Cuna",
  other: "Otra",
};

const profileStatusLabels = {
  pending: "Pendiente",
  active: "Activo",
  disabled: "Deshabilitado",
} as const;

const progressStatusLabels = {
  pending: "Pendiente",
  incomplete: "Incompleto",
  configured: "Configurado",
} as const;

const roomStatusOptions = [
  "available", "reserved", "occupied", "ready", "clean", "pending_cleaning", "cleaning",
  "maintenance", "blocked", "out_of_service",
] as const;

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function checked(form: FormData, name: string) {
  return form.get(name) === "on";
}

function SectionHeading({ eyebrow, title, description, status }: {
  eyebrow: string;
  title: string;
  description: string;
  status?: ReactNode;
}) {
  return (
    <div className="admin-config-heading">
      <div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div>
      {status}
    </div>
  );
}

function SavedState({ saved }: { saved: boolean }) {
  return <span className={`admin-config-state ${saved ? "admin-config-state--saved" : ""}`}>{saved ? "Guardado en Supabase" : "Configuración pendiente"}</span>;
}

function FormActions({ busy, disabled, label = "Guardar cambios" }: { busy: boolean; disabled: boolean; label?: string }) {
  return (
    <div className="admin-config-actions">
      <small>Los cambios se validan en el servidor y quedan sujetos a RLS.</small>
      <button className="admin-button admin-button--primary" disabled={busy || disabled} type="submit">
        {busy ? "Guardando…" : label}
      </button>
    </div>
  );
}

export function ConfigurationConsole({ currentUser, fallbackBasePrice, initialSnapshot, mode }: Props) {
  const [state, setState] = useState(initialSnapshot);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const canManageSettings = currentUser.permissions.includes("settings.manage");
  const canManageInventory = currentUser.permissions.includes("rooms.inventory_manage");
  const canManageRooms = canManageInventory && currentUser.permissions.includes("rooms.manage");
  const canManageUsers = currentUser.permissions.includes("staff.manage") && currentUser.permissions.includes("rbac.manage");
  const isOwner = currentUser.roles.includes("owner");
  const ownerHasFullAccess = isOwner && state.permissions.length > 0 && currentUser.permissions.length === state.permissions.length;
  const readOnly = mode === "demo";

  async function mutate(operation: string, payload: unknown, successMessage: string) {
    if (readOnly) {
      setError("La configuración real sólo está disponible en modo producción.");
      return;
    }
    setBusy(operation);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/configuration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ operation, payload }),
      });
      const result = await response.json() as { state?: ConfigurationSnapshot; error?: string };
      if (!response.ok || !result.state) throw new Error(result.error ?? "No fue posible guardar los cambios.");
      setState(result.state);
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible guardar los cambios.");
    } finally {
      setBusy("");
    }
  }

  function submitGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("updateGeneral", {
      name: value(form, "name"),
      phone: value(form, "phone"),
      whatsapp: value(form, "whatsapp"),
      email: value(form, "email"),
      address: value(form, "address"),
      city: value(form, "city"),
      province: value(form, "province"),
      website: value(form, "website"),
    }, "Información general actualizada.");
  }

  function submitSchedules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("updateSchedules", {
      checkInFrom: value(form, "checkInFrom"),
      checkInUntil: value(form, "checkInUntil"),
      checkOutUntil: value(form, "checkOutUntil"),
      quietHoursFrom: value(form, "quietHoursFrom"),
      quietHoursUntil: value(form, "quietHoursUntil"),
    }, "Horarios operativos actualizados.");
  }

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("updatePrice", { amount: Number(value(form, "amount")), currency: "ARS" }, "Precio base actualizado.");
  }

  function submitPolicies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("updatePolicies", {
      cancellation: value(form, "cancellation"),
      minors: value(form, "minors"),
      pets: value(form, "pets"),
      smoking: value(form, "smoking"),
      quietHours: value(form, "quietHours"),
    }, "Políticas actualizadas.");
  }

  function submitRoomType(event: FormEvent<HTMLFormElement>, roomType?: ConfigurationRoomType) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(roomType ? "updateRoomType" : "createRoomType", {
      ...(roomType ? { id: roomType.id } : {}),
      code: value(form, "code").toLowerCase(),
      internalName: value(form, "internalName"),
      publicName: value(form, "publicName"),
      description: value(form, "description"),
      defaultCapacity: Number(value(form, "defaultCapacity")),
      baseRate: Number(value(form, "baseRate")),
      active: checked(form, "active"),
    }, roomType ? "Tipo de habitación actualizado." : "Tipo de habitación creado.");
  }

  function submitRoom(event: FormEvent<HTMLFormElement>, room?: ConfigurationRoom) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roomTypeId = value(form, "roomTypeId");
    void mutate(room ? "updateRoom" : "createRoom", {
      ...(room ? { id: room.id } : {}),
      roomTypeId: roomTypeId || null,
      code: value(form, "code"),
      displayName: value(form, "displayName"),
      capacity: Number(value(form, "capacity")),
      status: room ? value(form, "status") : "out_of_service",
      sector: value(form, "sector"),
      internalNotes: value(form, "internalNotes"),
      active: checked(form, "active"),
    }, room ? "Habitación actualizada." : "Habitación creada fuera de servicio hasta su habilitación operativa.");
  }

  function submitBed(event: FormEvent<HTMLFormElement>, bed?: ConfigurationBed) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(bed ? "updateBed" : "createBed", {
      ...(bed ? { id: bed.id } : {}),
      roomId: value(form, "roomId"),
      code: value(form, "code"),
      bedType: value(form, "bedType"),
      quantity: Number(value(form, "quantity")),
      capacity: Number(value(form, "capacity")),
      active: checked(form, "active"),
    }, bed ? "Cama actualizada." : "Cama creada.");
  }

  function submitRoomService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("createRoomService", {
      code: value(form, "code").toLowerCase(),
      name: value(form, "name"),
      description: value(form, "description"),
      active: checked(form, "active"),
    }, "Servicio configurable creado.");
  }

  function submitRoomServices(event: FormEvent<HTMLFormElement>, roomId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("saveRoomServices", {
      roomId,
      serviceIds: form.getAll("serviceIds").map(String),
    }, "Servicios de la habitación actualizados.");
  }

  function submitProfile(event: FormEvent<HTMLFormElement>, profile: ConfigurationProfile) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("saveUser", {
      userId: profile.id,
      displayName: value(form, "displayName"),
      phone: value(form, "phone"),
      status: value(form, "status"),
      roleIds: form.getAll("roleIds").map(String),
    }, "Perfil y roles actualizados.");
  }

  const general = state.settings.general?.value;
  const schedules = state.settings.schedules?.value;
  const price = state.settings.price?.value;
  const policies = state.settings.policies?.value;
  const configuredRoomTypes = state.roomTypes.filter((item) => item.active && item.publicName && item.defaultCapacity > 0 && Number(item.baseRate) > 0);
  const configuredRooms = state.rooms.filter((room) => room.active && room.roomTypeId && room.capacity > 0 && configuredRoomTypes.some((type) => type.id === room.roomTypeId));
  const capacitiesConfigured = configuredRooms.length > 0 && configuredRooms.every((room) => {
    const capacity = state.beds
      .filter((bed) => bed.active && bed.roomId === room.id)
      .reduce((total, bed) => total + (bed.quantity * bed.capacity), 0);
    return capacity >= room.capacity;
  });
  const policyTextConfigured = Boolean(policies && Object.values(policies).every((text) => text.trim().length > 0));
  const teamConfigured = state.profiles.some((profile) => profile.status === "active" && profile.roleIds.length > 0);
  const progress = [
    { label: "Datos generales", status: general ? "configured" : "pending" },
    { label: "Políticas y horarios", status: schedules && policyTextConfigured ? "configured" : schedules || policies ? "incomplete" : "pending" },
    { label: "Tipos de habitación", status: configuredRoomTypes.length ? "configured" : state.roomTypes.length ? "incomplete" : "pending" },
    { label: "Habitaciones", status: configuredRooms.length ? "configured" : state.rooms.length ? "incomplete" : "pending" },
    { label: "Camas y capacidades", status: capacitiesConfigured ? "configured" : state.beds.length ? "incomplete" : "pending" },
    { label: "Usuarios del equipo", status: teamConfigured ? "configured" : state.profiles.length ? "incomplete" : "pending" },
  ] as const;
  const setupComplete = progress.every((step) => step.status === "configured");

  return (
    <>
      <AdminPageHeader
        eyebrow="Control central"
        title="Configuración del hostel"
        description="Definí la operación real, el inventario y los accesos internos desde un único lugar protegido."
      />

      <section className="admin-access-summary" aria-label="Acceso actual">
        <div><span>{currentUser.displayName.slice(0, 1).toUpperCase()}</span><div><small>Sesión activa</small><strong>{currentUser.displayName}</strong></div></div>
        <div><small>Rol</small><strong>{currentUser.roles.join(", ") || "Sin rol"}</strong></div>
        <div><small>Permisos efectivos</small><strong>{currentUser.permissions.length} de {state.permissions.length || currentUser.permissions.length}</strong></div>
        <span className={`admin-access-verdict ${ownerHasFullAccess ? "admin-access-verdict--ok" : ""}`}>{ownerHasFullAccess ? "Owner con acceso completo" : "Acceso según rol"}</span>
      </section>

      <section className="admin-setup-progress" aria-labelledby="setup-progress-title">
        <div><p>Configuración inicial</p><h2 id="setup-progress-title">Avance del Hostel Bauti</h2><span>La operación queda bloqueada hasta contar con inventario, capacidad, horarios y políticas válidas.</span></div>
        <ol>
          {progress.map((step, index) => <li className={`admin-progress-step admin-progress-step--${step.status}`} key={step.label}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong><small>{progressStatusLabels[step.status]}</small></li>)}
          <li className={`admin-progress-step admin-progress-step--${setupComplete ? "configured" : "pending"}`}><span>07</span><strong>Configuración terminada</strong><small>{setupComplete ? "Configurado" : "Pendiente"}</small></li>
        </ol>
      </section>

      {message ? <p className="admin-feedback" role="status">{message}</p> : null}
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      {readOnly ? <p className="admin-form-error" role="alert">Esta vista es sólo informativa en modo demo. No se escriben datos reales.</p> : null}
      {!state.inventorySchemaReady && mode === "production" ? <div className="admin-schema-notice" role="status"><strong>Ampliación de inventario pendiente</strong><span>La interfaz nueva está lista, pero los campos de tarifa, sector, cantidad y servicios se habilitarán después de aplicar la migración incremental revisada. No se ejecutó ninguna migración.</span></div> : null}

      <nav className="admin-config-index" aria-label="Secciones de configuración">
        <a href="#general">Información general</a>
        <a href="#horarios">Horarios</a>
        <a href="#precio">Precio base</a>
        <a href="#politicas">Políticas</a>
        <a href="#tipos">Tipos</a>
        <a href="#habitaciones">Habitaciones</a>
        <a href="#camas">Camas</a>
        <a href="#servicios">Servicios</a>
        <a href="#equipo">Usuarios y roles</a>
      </nav>

      <section className="admin-config-section" id="general">
        <SectionHeading eyebrow="Identidad y contacto" title="Información general" description="Datos operativos del Hostel Bauti. El sitio público consume únicamente los campos permitidos mediante su contrato de lectura." status={<SavedState saved={Boolean(general)} />} />
        <form className="admin-config-card" key={state.settings.general?.updatedAt ?? "general-empty"} onSubmit={submitGeneral}>
          <div className="admin-field-grid">
            <label>Nombre comercial<input defaultValue={general?.name ?? "Hostel Bauti"} name="name" required /></label>
            <label>Teléfono<input defaultValue={general?.phone ?? ""} name="phone" /></label>
            <label>WhatsApp<input defaultValue={general?.whatsapp ?? ""} name="whatsapp" /></label>
            <label>Correo de contacto<input defaultValue={general?.email ?? ""} name="email" type="email" /></label>
            <label className="admin-field--full">Dirección<input defaultValue={general?.address ?? ""} name="address" /></label>
            <label>Ciudad<input defaultValue={general?.city ?? ""} name="city" /></label>
            <label>Provincia<input defaultValue={general?.province ?? ""} name="province" /></label>
            <label className="admin-field--full">Sitio web<input defaultValue={general?.website ?? ""} name="website" placeholder="https://" type="url" /></label>
          </div>
          <FormActions busy={busy === "updateGeneral"} disabled={!canManageSettings || readOnly} />
        </form>
      </section>

      <section className="admin-config-section" id="horarios">
        <SectionHeading eyebrow="Operación diaria" title="Horarios" description="Ventanas oficiales para recibir huéspedes, finalizar estadías y mantener horas de descanso." status={<SavedState saved={Boolean(schedules)} />} />
        <form className="admin-config-card" key={state.settings.schedules?.updatedAt ?? "schedules-empty"} onSubmit={submitSchedules}>
          <div className="admin-field-grid admin-field-grid--five">
            <label>Check-in desde<input defaultValue={schedules?.checkInFrom ?? ""} name="checkInFrom" required type="time" /></label>
            <label>Check-in hasta<input defaultValue={schedules?.checkInUntil ?? ""} name="checkInUntil" required type="time" /></label>
            <label>Check-out hasta<input defaultValue={schedules?.checkOutUntil ?? ""} name="checkOutUntil" required type="time" /></label>
            <label>Silencio desde<input defaultValue={schedules?.quietHoursFrom ?? ""} name="quietHoursFrom" required type="time" /></label>
            <label>Silencio hasta<input defaultValue={schedules?.quietHoursUntil ?? ""} name="quietHoursUntil" required type="time" /></label>
          </div>
          <FormActions busy={busy === "updateSchedules"} disabled={!canManageSettings || readOnly} />
        </form>
      </section>

      <section className="admin-config-section" id="precio">
        <SectionHeading eyebrow="Tarifa de referencia" title="Precio base" description="Importe interno de referencia. No habilita ni publica reservas online." status={<SavedState saved={Boolean(price)} />} />
        <form className="admin-config-card admin-config-card--compact" key={state.settings.price?.updatedAt ?? "price-empty"} onSubmit={submitPrice}>
          <div className="admin-price-field">
            <label>Precio base por noche (ARS)<input defaultValue={price?.amount ?? fallbackBasePrice ?? ""} min="1" name="amount" required step="1" type="number" /></label>
            <div><small>Vista previa</small><strong>{formatCurrency(price?.amount ?? fallbackBasePrice ?? 0)}</strong><span>{price ? "Valor guardado en Supabase" : "Valor local de respaldo; confirmalo para guardarlo"}</span></div>
          </div>
          <FormActions busy={busy === "updatePrice"} disabled={!canManageSettings || readOnly} />
        </form>
      </section>

      <section className="admin-config-section" id="politicas">
        <SectionHeading eyebrow="Reglas del alojamiento" title="Políticas" description="Textos internos listos para revisar antes de cualquier publicación futura." status={<SavedState saved={Boolean(policies)} />} />
        <form className="admin-config-card" key={state.settings.policies?.updatedAt ?? "policies-empty"} onSubmit={submitPolicies}>
          <div className="admin-field-grid">
            <label className="admin-field--full">Cancelaciones<textarea defaultValue={policies?.cancellation ?? ""} name="cancellation" /></label>
            <label>Menores<textarea defaultValue={policies?.minors ?? ""} name="minors" /></label>
            <label>Mascotas<textarea defaultValue={policies?.pets ?? ""} name="pets" /></label>
            <label>Tabaco<textarea defaultValue={policies?.smoking ?? ""} name="smoking" /></label>
            <label>Horas de silencio<textarea defaultValue={policies?.quietHours ?? ""} name="quietHours" /></label>
          </div>
          <FormActions busy={busy === "updatePolicies"} disabled={!canManageSettings || readOnly} />
        </form>
      </section>

      <section className="admin-config-section" id="tipos">
        <SectionHeading eyebrow="Inventario estructural" title="Tipos de habitación" description="Definí categorías reales antes de crear habitaciones y camas." status={<span className="admin-config-state">{state.roomTypes.length} configurados</span>} />
        {!state.roomTypes.length ? <EmptyState title="Todavía no hay tipos de habitación" description="Creá la primera categoría con su capacidad estándar. No se agregarán ejemplos automáticamente." /> : (
          <div className="admin-config-records">
            {state.roomTypes.map((roomType) => (
              <details className="admin-config-record" key={roomType.id}>
                <summary><div><strong>{roomType.publicName || roomType.internalName}</strong><span>{roomType.internalName} · {roomType.code} · capacidad {roomType.defaultCapacity}{roomType.baseRate ? ` · ${formatCurrency(roomType.baseRate)}` : ""}</span></div><span>{roomType.active ? "Activo" : "Inactivo"}</span></summary>
                <form onSubmit={(event) => submitRoomType(event, roomType)}>
                  <div className="admin-field-grid">
                    <label>Código<input defaultValue={roomType.code} name="code" required /></label>
                    <label>Nombre interno<input defaultValue={roomType.internalName} name="internalName" required /></label>
                    <label>Nombre público<input defaultValue={roomType.publicName} name="publicName" required /></label>
                    <label>Capacidad estándar<input defaultValue={roomType.defaultCapacity} max="30" min="1" name="defaultCapacity" required type="number" /></label>
                    <label>Tarifa base (ARS)<input defaultValue={roomType.baseRate ?? ""} min="1" name="baseRate" required step="1" type="number" /></label>
                    <label className="admin-check-field"><input defaultChecked={roomType.active} name="active" type="checkbox" /> Tipo activo</label>
                    <label className="admin-field--full">Descripción<textarea defaultValue={roomType.description} name="description" /></label>
                  </div>
                  <FormActions busy={busy === "updateRoomType"} disabled={!canManageInventory || !state.inventorySchemaReady || readOnly} />
                </form>
              </details>
            ))}
          </div>
        )}
        <details className="admin-create-panel">
          <summary>Crear tipo de habitación</summary>
          <form onSubmit={(event) => submitRoomType(event)}>
            <div className="admin-field-grid">
              <label>Código interno<input name="code" pattern="[a-z0-9][a-z0-9_-]{1,49}" required /></label>
              <label>Nombre interno<input name="internalName" required /></label>
              <label>Nombre público<input name="publicName" required /></label>
              <label>Capacidad estándar<input max="30" min="1" name="defaultCapacity" required type="number" /></label>
              <label>Tarifa base (ARS)<input min="1" name="baseRate" required step="1" type="number" /></label>
              <label className="admin-check-field"><input defaultChecked name="active" type="checkbox" /> Crear activo</label>
              <label className="admin-field--full">Descripción<textarea name="description" /></label>
            </div>
            <FormActions busy={busy === "createRoomType"} disabled={!canManageInventory || !state.inventorySchemaReady || readOnly} label="Crear tipo" />
          </form>
        </details>
      </section>

      <section className="admin-config-section" id="habitaciones">
        <SectionHeading eyebrow="Inventario físico" title="Habitaciones" description="Cada habitación nueva queda fuera de servicio hasta que recepción la habilite desde la vista operativa." status={<span className="admin-config-state">{state.rooms.length} configuradas</span>} />
        {!state.rooms.length ? <EmptyState title="Todavía no hay habitaciones" description="El inventario productivo está vacío. Creá únicamente las habitaciones reales del Hostel Bauti." /> : (
          <div className="admin-config-records admin-config-records--grid">
            {state.rooms.map((room) => (
              <details className="admin-config-record" key={room.id}>
                <summary><div><strong>{room.displayName}</strong><span>{room.code} · capacidad {room.capacity}</span></div><StatusPill status={room.status}>{roomStatusLabel(room.status)}</StatusPill></summary>
                <form onSubmit={(event) => submitRoom(event, room)}>
                  <div className="admin-field-grid">
                    <label>Código<input defaultValue={room.code} name="code" required /></label>
                    <label>Nombre visible<input defaultValue={room.displayName} name="displayName" required /></label>
                    <label>Tipo<select defaultValue={room.roomTypeId ?? ""} name="roomTypeId"><option value="">Sin tipo asignado</option>{state.roomTypes.map((item) => <option key={item.id} value={item.id}>{item.publicName || item.internalName}</option>)}</select></label>
                    <label>Capacidad<input defaultValue={room.capacity} max="30" min="1" name="capacity" required type="number" /></label>
                    <label>Planta o sector<input defaultValue={room.sector} name="sector" /></label>
                    <label>Estado operativo<select defaultValue={room.status} name="status">{roomStatusOptions.map((status) => <option key={status} value={status}>{roomStatusLabel(status)}</option>)}</select></label>
                    <label className="admin-field--full">Observaciones internas<textarea defaultValue={room.internalNotes} name="internalNotes" /></label>
                    <label className="admin-check-field admin-field--full"><input defaultChecked={room.active} name="active" type="checkbox" /> Habitación activa en el inventario</label>
                  </div>
                  <FormActions busy={busy === "updateRoom"} disabled={!canManageRooms || !state.inventorySchemaReady || readOnly} />
                </form>
              </details>
            ))}
          </div>
        )}
        <details className="admin-create-panel">
          <summary>Crear habitación real</summary>
          <form onSubmit={(event) => submitRoom(event)}>
            <div className="admin-field-grid">
              <label>Código<input name="code" required /></label>
              <label>Nombre visible<input name="displayName" required /></label>
              <label>Tipo<select name="roomTypeId"><option value="">Sin tipo asignado</option>{state.roomTypes.map((item) => <option key={item.id} value={item.id}>{item.publicName || item.internalName}</option>)}</select></label>
              <label>Capacidad<input max="30" min="1" name="capacity" required type="number" /></label>
              <label>Planta o sector<input name="sector" /></label>
              <label>Estado operativo<input readOnly value="Fuera de servicio" /></label>
              <label className="admin-field--full">Observaciones internas<textarea name="internalNotes" /></label>
              <label className="admin-check-field admin-field--full"><input defaultChecked name="active" type="checkbox" /> Crear activa en el inventario</label>
            </div>
            <FormActions busy={busy === "createRoom"} disabled={!canManageRooms || !state.inventorySchemaReady || readOnly} label="Crear habitación" />
          </form>
        </details>
      </section>

      <section className="admin-config-section" id="camas">
        <SectionHeading eyebrow="Capacidad disponible" title="Camas y capacidades" description="La suma de plazas activas se compara con la capacidad declarada de cada habitación." status={<span className="admin-config-state">{state.beds.length} camas</span>} />
        {!state.rooms.length ? <EmptyState title="Primero configurá las habitaciones" description="Cuando exista una habitación real, vas a poder registrar sus camas y plazas." /> : (
          <div className="admin-bed-groups">
            {state.rooms.map((room) => {
              const roomBeds = state.beds.filter((bed) => bed.roomId === room.id);
              const activeCapacity = roomBeds.filter((bed) => bed.active).reduce((sum, bed) => sum + (bed.quantity * bed.capacity), 0);
              return (
                <article className="admin-bed-group" key={room.id}>
                  <header><div><strong>{room.displayName}</strong><span>{room.code}</span></div><span className={activeCapacity === room.capacity ? "is-balanced" : ""}>{activeCapacity} / {room.capacity} plazas</span></header>
                  {!roomBeds.length ? <p>Sin camas registradas para esta habitación.</p> : roomBeds.map((bed) => (
                    <details className="admin-bed-record" key={bed.id}>
                      <summary><strong>{bed.code}</strong><span>{bed.quantity} × {bedTypeLabels[bed.bedType]} · {bed.capacity} plaza{bed.capacity === 1 ? "" : "s"} cada una</span></summary>
                      <form onSubmit={(event) => submitBed(event, bed)}>
                        <input name="roomId" type="hidden" value={room.id} />
                        <div className="admin-field-grid">
                          <label>Código<input defaultValue={bed.code} name="code" required /></label>
                          <label>Tipo<select defaultValue={bed.bedType} name="bedType">{Object.entries(bedTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                          <label>Cantidad<input defaultValue={bed.quantity} max="30" min="1" name="quantity" required type="number" /></label>
                          <label>Plazas<input defaultValue={bed.capacity} max="4" min="1" name="capacity" required type="number" /></label>
                          <label className="admin-check-field"><input defaultChecked={bed.active} name="active" type="checkbox" /> Cama activa</label>
                        </div>
                        <FormActions busy={busy === "updateBed"} disabled={!canManageInventory || !state.inventorySchemaReady || readOnly} />
                      </form>
                    </details>
                  ))}
                  <details className="admin-create-panel admin-create-panel--nested">
                    <summary>Agregar cama</summary>
                    <form onSubmit={(event) => submitBed(event)}>
                      <input name="roomId" type="hidden" value={room.id} />
                      <div className="admin-field-grid">
                        <label>Código<input name="code" required /></label>
                        <label>Tipo<select name="bedType">{Object.entries(bedTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                        <label>Cantidad<input defaultValue="1" max="30" min="1" name="quantity" required type="number" /></label>
                        <label>Plazas<input defaultValue="1" max="4" min="1" name="capacity" required type="number" /></label>
                        <label className="admin-check-field"><input defaultChecked name="active" type="checkbox" /> Cama activa</label>
                      </div>
                      <FormActions busy={busy === "createBed"} disabled={!canManageInventory || !state.inventorySchemaReady || readOnly} label="Agregar cama" />
                    </form>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-config-section" id="servicios">
        <SectionHeading eyebrow="Comodidades reales" title="Servicios por habitación" description="Asigná únicamente servicios disponibles. El catálogo no incluye baño privado." status={<span className="admin-config-state">{state.services.length} servicios</span>} />
        {!state.inventorySchemaReady ? <EmptyState title="Catálogo pendiente de migración" description="La migración incremental crea el catálogo de servicios y sus asignaciones con RLS y auditoría. No fue ejecutada durante esta revisión." /> : !state.rooms.length ? <EmptyState title="Primero configurá las habitaciones" description="Los servicios se asignan cuando existe al menos una habitación real." /> : (
          <div className="admin-service-rooms">
            {state.rooms.map((room) => (
              <form className="admin-service-room" key={room.id} onSubmit={(event) => submitRoomServices(event, room.id)}>
                <header><div><strong>{room.displayName}</strong><span>{room.code}{room.sector ? ` · ${room.sector}` : ""}</span></div><small>{room.serviceIds.length} asignados</small></header>
                <fieldset><legend>Servicios disponibles</legend>{state.services.filter((service) => service.active).map((service) => <label key={service.id}><input defaultChecked={room.serviceIds.includes(service.id)} name="serviceIds" type="checkbox" value={service.id} /><span><strong>{service.name}</strong><small>{service.description || service.code}</small></span></label>)}</fieldset>
                <FormActions busy={busy === "saveRoomServices"} disabled={!canManageInventory || readOnly} label="Guardar servicios" />
              </form>
            ))}
          </div>
        )}
        <details className="admin-create-panel">
          <summary>Crear otro servicio configurable</summary>
          <form onSubmit={submitRoomService}>
            <div className="admin-field-grid">
              <label>Código<input name="code" pattern="[a-z][a-z0-9_]{1,49}" required /></label>
              <label>Nombre<input name="name" required /></label>
              <label className="admin-field--full">Descripción<textarea name="description" /></label>
              <label className="admin-check-field admin-field--full"><input defaultChecked name="active" type="checkbox" /> Servicio activo</label>
            </div>
            <FormActions busy={busy === "createRoomService"} disabled={!canManageInventory || !state.inventorySchemaReady || readOnly} label="Crear servicio" />
          </form>
        </details>
      </section>

      <section className="admin-config-section" id="equipo">
        <SectionHeading eyebrow="Seguridad interna" title="Usuarios y roles" description="Los perfiles provienen de Supabase Auth. Desde aquí se activan, deshabilitan y asignan roles existentes." status={<span className="admin-config-state">{state.profiles.length} perfiles · {state.roles.length} roles</span>} />
        <div className="admin-role-overview">
          {state.roles.map((role) => (
            <article key={role.id}>
              <div><span>{role.code}</span><strong>{role.name}</strong></div>
              <p>{role.description || "Sin descripción."}</p>
              <strong>{role.permissionIds.length} de {state.permissions.length} permisos</strong>
              <details><summary>Ver permisos</summary><ul>{role.permissionIds.map((id) => { const permission = state.permissions.find((item) => item.id === id); return permission ? <li key={id}><code>{permission.code}</code><span>{permission.description}</span></li> : null; })}</ul></details>
            </article>
          ))}
        </div>

        {!state.profiles.length ? <EmptyState title="No hay perfiles internos visibles" description="Los usuarios aparecen después de ser creados en Supabase Auth. Esta pantalla no utiliza una clave administrativa." /> : (
          <div className="admin-user-records">
            {state.profiles.map((profile) => {
              const profileRoles = state.roles.filter((role) => profile.roleIds.includes(role.id));
              const profileIsOwner = profileRoles.some((role) => role.code === "owner");
              return (
                <details className="admin-user-record" key={profile.id}>
                  <summary>
                    <div className="admin-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>
                    <div><strong>{profile.displayName}</strong><span>{profileRoles.map((role) => role.name).join(", ") || "Sin roles"} · ID {profile.id.slice(0, 8)}…</span></div>
                    <span className={`admin-profile-status admin-profile-status--${profile.status}`}>{profileStatusLabels[profile.status]}</span>
                  </summary>
                  <form onSubmit={(event) => submitProfile(event, profile)}>
                    <div className="admin-field-grid">
                      <label>Nombre visible<input defaultValue={profile.displayName} name="displayName" required /></label>
                      <label>Teléfono<input defaultValue={profile.phone} name="phone" /></label>
                      <label>Estado<select defaultValue={profile.status} name="status"><option value="pending">Pendiente</option><option value="active">Activo</option><option value="disabled">Deshabilitado</option></select></label>
                      <fieldset className="admin-role-selector"><legend>Roles asignados</legend>{state.roles.map((role) => <label key={role.id}><input defaultChecked={profile.roleIds.includes(role.id)} name="roleIds" type="checkbox" value={role.id} /> <span><strong>{role.name}</strong><small>{role.code}</small></span></label>)}</fieldset>
                    </div>
                    {profile.id === currentUser.id || profileIsOwner ? <p className="admin-security-note">Los perfiles owner deben permanecer activos y conservar ese rol. El servidor impide el autobloqueo.</p> : null}
                    <FormActions busy={busy === "saveUser"} disabled={!canManageUsers || readOnly} label="Guardar perfil y roles" />
                  </form>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
