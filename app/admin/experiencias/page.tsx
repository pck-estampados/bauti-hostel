"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useOperations } from "../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, formatDateTime } from "../components/ui";
import {
  assertCapacityAvailable,
  bookingEndAt,
  buildWellnessReadModel,
  wellnessLocalDate,
  wellnessLocalTime,
  wellnessPrice,
} from "../data/wellness-capacity-core";
import type {
  WellnessBooking,
  WellnessBookingInput,
  WellnessBookingStatus,
  WellnessProduct,
  WellnessProductInput,
  WellnessProductType,
  WellnessSlot,
  WellnessSlotInput,
  WellnessSource,
} from "../data/wellness-types";
import type { PaymentMethod } from "../lib/types";

const productTypeLabels: Record<WellnessProductType, string> = {
  circuit_relax: "Circuito Relax",
  day_pass_relax: "Pase Relax Día",
  club_relax: "Club Relax",
};

const bookingStatusLabels: Record<WellnessBookingStatus, string> = {
  pending_payment: "Pago pendiente",
  confirmed: "Confirmada",
  checked_in: "Ingresado",
  completed: "Finalizada",
  cancelled: "Cancelada",
  no_show: "No show",
};

const sourceLabels: Record<WellnessSource, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  phone: "Teléfono",
  walk_in: "Walk-in",
  instagram: "Instagram",
  referral: "Referido",
  admin: "Administración",
  other: "Otro",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercado_pago: "Mercado Pago",
  card: "Tarjeta",
  other: "Otro",
};

type BookingUpdateInput = { bookingId: string; startAt: string; partySize: number; notes?: string };
type BookingTransitionInput = { bookingId: string; action: "check_in" | "complete" | "no_show" | "cancel"; reason?: string };

function formText(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function optionalText(data: FormData, name: string) {
  return formText(data, name) || undefined;
}

function requiredNumber(data: FormData, name: string) {
  return Number(data.get(name));
}

function optionalNumber(data: FormData, name: string) {
  const value = formText(data, name);
  return value === "" ? undefined : Number(value);
}

function nullableInteger(data: FormData, name: string) {
  const value = formText(data, name);
  return value === "" ? null : Number(value);
}

function toOffsetDateTime(value: string) {
  return `${value.length === 16 ? `${value}:00` : value}-03:00`;
}

function toDateTimeLocal(value: string) {
  return `${wellnessLocalDate(value)}T${wellnessLocalTime(value)}`;
}

function SectionHeading({ eyebrow, title, description, aside }: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="admin-config-heading">
      <div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div>
      {aside}
    </div>
  );
}

function SubmitArea({ busy, disabled, label }: { busy: boolean; disabled: boolean; label: string }) {
  return (
    <div className="admin-config-actions">
      <small>La API vuelve a validar permisos, reglas y capacidad antes de persistir.</small>
      <button className="admin-button admin-button--primary" disabled={busy || disabled} type="submit">
        {busy ? "Guardando…" : label}
      </button>
    </div>
  );
}

function ProductForm({ product, busy, disabled, onSave }: {
  product?: WellnessProduct;
  busy: boolean;
  disabled: boolean;
  onSave: (input: WellnessProductInput) => Promise<boolean>;
}) {
  const [productType, setProductType] = useState<WellnessProductType>(product?.productType ?? "circuit_relax");
  const pricing = product?.pricingRules;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const policyRules = {
      rebookingHours: optionalNumber(data, "rebookingHours"),
      lateCancellationCreditPercent: optionalNumber(data, "lateCancellationCreditPercent"),
      noShowCreditPercent: optionalNumber(data, "noShowCreditPercent"),
      notes: optionalText(data, "policyNotes"),
    };
    const common = {
      id: product?.id,
      code: formText(data, "code"),
      name: formText(data, "name"),
      description: optionalText(data, "description"),
      active: data.get("active") === "on",
      salesEnabled: productType === "club_relax" ? false : data.get("salesEnabled") === "on",
      currency: "ARS" as const,
      policyRules,
      instructions: optionalText(data, "instructions"),
    };

    let input: WellnessProductInput;
    if (productType === "circuit_relax") {
      input = {
        ...common,
        productType,
        durationMinutes: 180,
        pricingRules: {
          individual: requiredNumber(data, "individual"),
          couple: requiredNumber(data, "couple"),
        },
      };
    } else if (productType === "day_pass_relax") {
      input = {
        ...common,
        productType,
        durationMinutes: 540,
        pricingRules: {
          mon_thu: { individual: requiredNumber(data, "monThuIndividual"), couple: requiredNumber(data, "monThuCouple") },
          friday: { individual: requiredNumber(data, "fridayIndividual"), couple: requiredNumber(data, "fridayCouple") },
          weekend_holiday: { individual: requiredNumber(data, "weekendIndividual"), couple: requiredNumber(data, "weekendCouple") },
          holiday_dates: formText(data, "holidayDates").split(",").map((item) => item.trim()).filter(Boolean),
        },
      };
    } else {
      input = {
        ...common,
        productType,
        durationMinutes: requiredNumber(data, "durationMinutes"),
        salesEnabled: false,
        pricingRules: {},
      };
    }
    const succeeded = await onSave(input);
    if (succeeded && !product) form.reset();
  }

  return (
    <form onSubmit={submit}>
      <fieldset className="admin-wellness-form-lock" disabled={disabled || busy}>
      <div className="admin-field-grid">
        <label>Tipo de producto
          <select disabled={Boolean(product)} name="productType" value={productType} onChange={(event) => setProductType(event.target.value as WellnessProductType)}>
            <option value="circuit_relax">Circuito Relax</option>
            <option value="day_pass_relax">Pase Relax Día</option>
            {product?.productType === "club_relax" ? <option value="club_relax">Club Relax · preparado para futuro</option> : null}
          </select>
        </label>
        <label>Código interno<input defaultValue={product?.code ?? ""} name="code" pattern="[a-z0-9][a-z0-9_-]{1,49}" required /></label>
        <label>Nombre<input defaultValue={product?.name ?? ""} maxLength={120} name="name" required /></label>
        {productType === "club_relax" ? <label>Duración en minutos<input defaultValue={product?.durationMinutes ?? ""} min="1" max="1440" name="durationMinutes" required type="number" /></label> : <label>Duración<input readOnly value={productType === "circuit_relax" ? "3 horas" : "9 horas"} /></label>}
        <label className="admin-field--full">Descripción<textarea defaultValue={product?.description ?? ""} maxLength={2000} name="description" rows={3} /></label>
      </div>

      <fieldset className="admin-wellness-fieldset">
        <legend>Tarifas por reserva</legend>
        {productType === "circuit_relax" ? (
          <div className="admin-field-grid">
            <label>Individual (ARS)<input defaultValue={pricing?.individual ?? ""} min="1" name="individual" required step="1" type="number" /></label>
            <label>Pareja (ARS)<input defaultValue={pricing?.couple ?? ""} min="1" name="couple" required step="1" type="number" /></label>
          </div>
        ) : productType === "day_pass_relax" ? (
          <div className="admin-field-grid admin-wellness-pricing-grid">
            <label>Lun–Jue · individual<input defaultValue={pricing?.mon_thu?.individual ?? ""} min="1" name="monThuIndividual" required step="1" type="number" /></label>
            <label>Lun–Jue · pareja<input defaultValue={pricing?.mon_thu?.couple ?? ""} min="1" name="monThuCouple" required step="1" type="number" /></label>
            <label>Viernes · individual<input defaultValue={pricing?.friday?.individual ?? ""} min="1" name="fridayIndividual" required step="1" type="number" /></label>
            <label>Viernes · pareja<input defaultValue={pricing?.friday?.couple ?? ""} min="1" name="fridayCouple" required step="1" type="number" /></label>
            <label>Fin de semana/feriado · individual<input defaultValue={pricing?.weekend_holiday?.individual ?? ""} min="1" name="weekendIndividual" required step="1" type="number" /></label>
            <label>Fin de semana/feriado · pareja<input defaultValue={pricing?.weekend_holiday?.couple ?? ""} min="1" name="weekendCouple" required step="1" type="number" /></label>
            <label className="admin-field--full">Feriados aplicables <small>Fechas ISO separadas por coma, por ejemplo AAAA-MM-DD.</small><input defaultValue={pricing?.holiday_dates?.join(", ") ?? ""} name="holidayDates" placeholder="AAAA-MM-DD" /></label>
          </div>
        ) : <p className="admin-wellness-muted">Club Relax queda sin venta y sin tarifas hasta la fase de membresías.</p>}
      </fieldset>

      <fieldset className="admin-wellness-fieldset">
        <legend>Política aplicable</legend>
        <div className="admin-field-grid">
          <label>Horas para reprogramar<input defaultValue={product?.policyRules.rebookingHours ?? ""} min="0" max="720" name="rebookingHours" type="number" /></label>
          <label>Crédito por cancelación tardía (%)<input defaultValue={product?.policyRules.lateCancellationCreditPercent ?? ""} min="0" max="100" name="lateCancellationCreditPercent" type="number" /></label>
          <label>Crédito por no-show (%)<input defaultValue={product?.policyRules.noShowCreditPercent ?? ""} min="0" max="100" name="noShowCreditPercent" type="number" /></label>
          <label className="admin-field--full">Notas de política<textarea defaultValue={product?.policyRules.notes ?? ""} maxLength={1000} name="policyNotes" rows={3} /></label>
          <label className="admin-field--full">Instrucciones operativas<textarea defaultValue={product?.instructions ?? ""} maxLength={4000} name="instructions" rows={4} /></label>
        </div>
      </fieldset>

      <div className="admin-wellness-toggles">
        <label className="admin-check-field"><input defaultChecked={product?.active ?? false} name="active" type="checkbox" /> Producto activo</label>
        <label className="admin-check-field"><input defaultChecked={product?.salesEnabled ?? false} disabled={productType === "club_relax"} name="salesEnabled" type="checkbox" /> Venta administrativa habilitada</label>
      </div>
      <SubmitArea busy={busy} disabled={disabled} label={product ? "Guardar producto" : "Crear producto"} />
      </fieldset>
    </form>
  );
}

function SlotForm({ slot, busy, disabled, onSave }: {
  slot?: WellnessSlot;
  busy: boolean;
  disabled: boolean;
  onSave: (input: WellnessSlotInput) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const [startTime, endTime] = formText(data, "window").split("|");
    const date = formText(data, "date");
    const succeeded = await onSave({
      id: slot?.id,
      startAt: `${date}T${startTime}:00-03:00`,
      endAt: `${date}T${endTime}:00-03:00`,
      capacityLimit: nullableInteger(data, "capacityLimit"),
      externalCapacityLimit: nullableInteger(data, "externalCapacityLimit"),
      guestBuffer: requiredNumber(data, "guestBuffer"),
      salesEnabled: data.get("salesEnabled") === "on",
      status: formText(data, "status") as "open" | "blocked",
      notes: optionalText(data, "notes"),
    });
    if (succeeded && !slot) form.reset();
  }

  const windowValue = slot ? `${wellnessLocalTime(slot.startAt)}|${wellnessLocalTime(slot.endAt)}` : "10:00|13:00";

  return (
    <form onSubmit={submit}>
      <fieldset className="admin-wellness-form-lock" disabled={disabled || busy}>
      <div className="admin-field-grid">
        <label>Fecha local<input defaultValue={slot ? wellnessLocalDate(slot.startAt) : ""} name="date" required type="date" /></label>
        <label>Franja operativa<select defaultValue={windowValue} name="window" required><option value="10:00|13:00">10:00–13:00</option><option value="14:00|17:00">14:00–17:00</option><option value="18:00|21:00">18:00–21:00</option></select></label>
        <label>Aforo total <small>Dejar vacío si todavía no fue confirmado.</small><input defaultValue={slot?.capacityLimit ?? ""} min="1" max="500" name="capacityLimit" type="number" /></label>
        <label>Cupo vendible externo <small>No puede ser menor a las {slot?.bookedExternal ?? 0} plazas ya reservadas.</small><input defaultValue={slot?.externalCapacityLimit ?? ""} min={Math.max(1, slot?.bookedExternal ?? 0)} max="500" name="externalCapacityLimit" type="number" /></label>
        <label>Resguardo para huéspedes<input defaultValue={slot?.guestBuffer ?? 0} min="0" max="500" name="guestBuffer" required type="number" /></label>
        <label>Estado<select defaultValue={slot?.status ?? "blocked"} name="status"><option value="open">Abierta</option><option value="blocked">Bloqueada</option></select></label>
        <label className="admin-field--full">Nota interna<textarea defaultValue={slot?.notes ?? ""} maxLength={1000} name="notes" rows={3} /></label>
        <label className="admin-check-field admin-field--full"><input defaultChecked={slot?.salesEnabled ?? false} name="salesEnabled" type="checkbox" /> Habilitar venta en esta franja</label>
      </div>
      <SubmitArea busy={busy} disabled={disabled} label={slot ? "Guardar franja" : "Crear franja"} />
      </fieldset>
    </form>
  );
}

function bookingOptions(product: WellnessProduct | undefined, slots: WellnessSlot[], partySize: number) {
  if (!product || !product.active || !product.salesEnabled || product.productType === "club_relax") return [];
  const candidates = product.productType === "day_pass_relax"
    ? slots.filter((slot) => wellnessLocalTime(slot.startAt) === "10:00")
    : slots;
  return candidates.filter((slot) => {
    try {
      assertCapacityAvailable(slots, slot.startAt, bookingEndAt(product.productType, slot.startAt), partySize, product.productType);
      return true;
    } catch {
      return false;
    }
  }).map((slot) => ({ value: slot.startAt, label: `${formatDateTime(slot.startAt)} · ${product.productType === "day_pass_relax" ? "hasta 19:00" : `hasta ${wellnessLocalTime(slot.endAt)}`}` }));
}

function BookingCreateForm({ products, slots, guests, busy, disabled, onCreate }: {
  products: WellnessProduct[];
  slots: WellnessSlot[];
  guests: { id: string; firstName: string; lastName: string; phone: string }[];
  busy: boolean;
  disabled: boolean;
  onCreate: (input: WellnessBookingInput) => Promise<boolean>;
}) {
  const [productId, setProductId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [startAt, setStartAt] = useState("");
  const product = products.find((item) => item.id === productId);
  const starts = useMemo(() => bookingOptions(product, slots, partySize), [partySize, product, slots]);
  let price: number | null = null;
  try { if (product && startAt) price = wellnessPrice(product, startAt, partySize); } catch { price = null; }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const succeeded = await onCreate({
      guestId: formText(data, "guestId"),
      productId,
      startAt,
      partySize,
      source: formText(data, "source") as WellnessSource,
      paymentMethod: formText(data, "paymentMethod") as PaymentMethod,
      paymentReference: optionalText(data, "paymentReference"),
      paymentNote: optionalText(data, "paymentNote"),
      notes: optionalText(data, "notes"),
    });
    if (succeeded) {
      form.reset();
      setProductId(""); setStartAt(""); setPartySize(1);
    }
  }

  const canSubmit = !disabled && Boolean(product && startAt && price && guests.length && starts.length);
  return (
    <form className="admin-form-card" onSubmit={submit}>
      <fieldset className="admin-wellness-form-lock" disabled={disabled || busy}>
      <div className="admin-form-section"><span>01</span><div><h2>Producto y visitante</h2><p>Se utiliza una ficha existente; no se duplica el CRM de huéspedes.</p></div></div>
      <div className="admin-field-grid">
        <label className="admin-field--full">Titular<select defaultValue="" name="guestId" required><option disabled value="">Seleccionar persona</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.lastName}, {guest.firstName} · {guest.phone}</option>)}</select></label>
        <label>Producto<select value={productId} onChange={(event) => { setProductId(event.target.value); setStartAt(""); }} required><option value="">Seleccionar producto</option>{products.filter((item) => item.active && item.salesEnabled && item.productType !== "club_relax").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Personas<select value={partySize} onChange={(event) => { setPartySize(Number(event.target.value)); setStartAt(""); }}><option value="1">1 · individual</option><option value="2">2 · pareja</option></select></label>
        <label className="admin-field--full">Fecha y franja<select value={startAt} onChange={(event) => setStartAt(event.target.value)} required><option value="">Seleccionar franja con capacidad</option>{starts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>

      <div className="admin-form-section"><span>02</span><div><h2>Origen y pago</h2><p>La confirmación exige el pago total y conserva el precio aplicado.</p></div></div>
      <div className="admin-field-grid">
        <label>Origen<select defaultValue="admin" name="source">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Medio de pago<select defaultValue="" name="paymentMethod" required><option disabled value="">Seleccionar medio</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Referencia de pago<input maxLength={200} name="paymentReference" /></label>
        <label>Nota del pago<input maxLength={1000} name="paymentNote" /></label>
        <label className="admin-field--full">Observaciones de la reserva<textarea maxLength={4000} name="notes" rows={3} /></label>
      </div>

      {!guests.length ? <p className="admin-form-error" role="status">Todavía no hay huéspedes registrados. Creá primero la ficha real del titular.</p> : null}
      {product && !starts.length ? <p className="admin-form-error" role="status">No hay una franja completa con capacidad suficiente para este producto y cantidad de personas.</p> : null}
      <div className="admin-wellness-booking-submit">
        <div><span>Total a cobrar</span><strong>{price ? formatCurrency(price) : "Pendiente de selección"}</strong><small>Pago anticipado del 100%.</small></div>
        <button className="admin-button admin-button--primary admin-button--large" disabled={busy || !canSubmit} type="submit">{busy ? "Confirmando…" : "Crear y confirmar reserva"}</button>
      </div>
      </fieldset>
    </form>
  );
}

function BookingRecord({ booking, product, guestName, busy, canManage, highlighted, now, onUpdate, onTransition }: {
  booking: WellnessBooking;
  product?: WellnessProduct;
  guestName: string;
  busy: boolean;
  canManage: boolean;
  highlighted: boolean;
  now: number;
  onUpdate: (input: BookingUpdateInput) => Promise<boolean>;
  onTransition: (input: BookingTransitionInput) => Promise<boolean>;
}) {
  const editable = canManage && booking.status === "confirmed";
  return (
    <details className="admin-wellness-booking" id={`wellness-booking-${booking.id}`} open={highlighted || undefined}>
      <summary>
        <div><strong>{booking.code} · {guestName}</strong><span>{product?.name ?? "Producto no disponible"} · {formatDateTime(booking.startAt)} · {booking.partySize} persona{booking.partySize === 1 ? "" : "s"}</span></div>
        <span className={`admin-status admin-status--${booking.status}`}>{bookingStatusLabels[booking.status]}</span>
      </summary>
      <div className="admin-wellness-booking__body">
        <dl className="admin-detail-list">
          <div><dt>Total</dt><dd>{formatCurrency(booking.total)}</dd></div>
          <div><dt>Pagado</dt><dd>{formatCurrency(booking.amountPaid)}</dd></div>
          <div><dt>Saldo</dt><dd>{formatCurrency(booking.balanceDue)}</dd></div>
          <div><dt>Origen</dt><dd>{sourceLabels[booking.source]}</dd></div>
          <div><dt>Fin previsto</dt><dd>{formatDateTime(booking.endAt)}</dd></div>
          {booking.actualCheckInAt ? <div><dt>Ingreso real</dt><dd>{formatDateTime(booking.actualCheckInAt)}</dd></div> : null}
          {booking.actualEndAt ? <div><dt>Finalización real</dt><dd>{formatDateTime(booking.actualEndAt)}</dd></div> : null}
        </dl>

        {editable ? (
          <form className="admin-wellness-booking__edit" onSubmit={async (event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            await onUpdate({ bookingId: booking.id, startAt: toOffsetDateTime(formText(data, "startAt")), partySize: requiredNumber(data, "partySize"), notes: optionalText(data, "notes") });
          }}>
            <div className="admin-field-grid">
              <label>Inicio local<input defaultValue={toDateTimeLocal(booking.startAt)} name="startAt" required type="datetime-local" /></label>
              <label>Personas<select defaultValue={booking.partySize} name="partySize"><option value="1">1 · individual</option><option value="2">2 · pareja</option></select></label>
              <label className="admin-field--full">Observaciones<textarea defaultValue={booking.notes ?? ""} maxLength={4000} name="notes" rows={3} /></label>
            </div>
            <button className="admin-button admin-button--secondary" disabled={busy || !canManage} type="submit">Revalidar y guardar</button>
          </form>
        ) : null}

        {canManage ? (
          <div className="admin-wellness-transitions">
            {booking.status === "confirmed" ? <button className="admin-button admin-button--secondary" disabled={busy} onClick={() => onTransition({ bookingId: booking.id, action: "check_in" })} type="button">Registrar ingreso</button> : null}
            {booking.status === "checked_in" ? <button className="admin-button admin-button--secondary" disabled={busy} onClick={() => onTransition({ bookingId: booking.id, action: "complete" })} type="button">Registrar finalización</button> : null}
            {booking.status === "confirmed" ? <button className="admin-button admin-button--danger" disabled={busy || now < Date.parse(booking.startAt)} onClick={() => onTransition({ bookingId: booking.id, action: "no_show" })} type="button">Marcar no-show</button> : null}
            {booking.status === "confirmed" ? (
              <form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await onTransition({ bookingId: booking.id, action: "cancel", reason: formText(data, "reason") }); }}>
                <label>Motivo de cancelación<input maxLength={500} minLength={2} name="reason" required /></label>
                <button className="admin-button admin-button--danger" disabled={busy} type="submit">Cancelar sin borrar</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export default function ExperiencesPage() {
  const searchParams = useSearchParams();
  const {
    state,
    mode,
    permissions,
    saveWellnessProduct,
    saveWellnessSlot,
    createWellnessBooking,
    updateWellnessBooking,
    transitionWellnessBooking,
  } = useOperations();
  const snapshot = useMemo(() => buildWellnessReadModel(state), [state]);
  const canRead = mode === "demo" || permissions.includes("experiences.read") || permissions.includes("experiences.manage");
  const canManage = mode === "production" && permissions.includes("experiences.manage");
  const canCreateBooking = canManage && permissions.includes("payments.manage");
  const requestedBookingId = searchParams.get("booking") ?? "";
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bookingFilter, setBookingFilter] = useState<WellnessBookingStatus | "all">("all");

  async function run(key: string, success: string, operation: () => Promise<void>) {
    setBusy(key); setError(""); setMessage("");
    try { await operation(); setMessage(success); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible completar la operación."); return false; }
    finally { setBusy(""); }
  }

  const sortedSlots = state.wellnessSlots.toSorted((left, right) => left.startAt.localeCompare(right.startAt));
  const upcomingSlots = sortedSlots.filter((slot) => Date.parse(slot.endAt) >= now).slice(0, 9);
  const bookings = state.wellnessBookings
    .filter((booking) => bookingFilter === "all" || booking.status === bookingFilter)
    .toSorted((left, right) => right.startAt.localeCompare(left.startAt));
  const capacityPending = !state.wellnessSlots.some((slot) => slot.capacityLimit !== null && slot.externalCapacityLimit !== null);

  if (!canRead) {
    return <><AdminPageHeader eyebrow="Experiencias" title="Acceso restringido" description="Esta sección requiere permiso para consultar experiencias wellness." /><p className="admin-form-error" role="alert">No tenés permiso experiences.read.</p></>;
  }

  return (
    <>
      <AdminPageHeader eyebrow={`Wellness · ${snapshot.today}`} title="Experiencias y capacidad compartida." description="Circuito Relax y Pase Relax Día consumen un único inventario transaccional de franjas wellness." />

      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      {message ? <p className="admin-form-success" role="status">{message}</p> : null}
      {!canManage ? <p className="admin-operation-alert" role="status"><strong>Vista de consulta.</strong> Las escrituras requieren experiences.manage y están deshabilitadas en modo demo.</p> : null}
      {canManage && !canCreateBooking ? <p className="admin-operation-alert" role="status"><strong>Venta deshabilitada.</strong> Crear una reserva con pago también requiere payments.manage.</p> : null}
      {capacityPending ? <p className="admin-operation-alert" role="status"><strong>Capacidad wellness pendiente de configurar.</strong> No se publica ni se ofrece disponibilidad hasta definir aforo y cupo externo reales.</p> : null}

      <nav className="admin-config-index" aria-label="Secciones de experiencias">
        <a href="#hoy">Hoy</a><a href="#reservar">Nueva reserva</a><a href="#reservas">Reservas</a><a href="#franjas">Capacidad</a><a href="#productos">Productos</a>
      </nav>

      <section className="admin-config-section" id="hoy">
        <SectionHeading eyebrow="Operación del día" title="Wellness hoy" description="Visitantes externos separados de los huéspedes alojados." />
        <div className="admin-wellness-metrics" aria-label="Resumen wellness de hoy">
          <article><span>Circuitos</span><strong>{snapshot.circuitCount}</strong></article>
          <article><span>Pases Día</span><strong>{snapshot.dayPassCount}</strong></article>
          <article><span>Externos reservados</span><strong>{snapshot.externalReserved}</strong></article>
          <article><span>Externos presentes</span><strong>{snapshot.externalPresent}</strong></article>
          <article><span>Huéspedes alojados</span><strong>{snapshot.housedGuests}</strong><small>No descuentan cupo sin presencia conocida.</small></article>
          <article><span>Capacidad restante ahora</span><strong>{snapshot.currentRemaining ?? "—"}</strong><small>{snapshot.currentSlot ? `${wellnessLocalTime(snapshot.currentSlot.startAt)}–${wellnessLocalTime(snapshot.currentSlot.endAt)}` : "Sin franja activa"}</small></article>
        </div>
        <div className="admin-dashboard-grid admin-dashboard-grid--equal">
          <section className="admin-panel">
            <div className="admin-panel__heading"><div><p>Agenda operativa</p><h2>Próximas franjas</h2></div><span className="admin-count">{upcomingSlots.length}</span></div>
            {upcomingSlots.length ? upcomingSlots.map((slot) => <article className="admin-wellness-slot-summary" key={slot.id}><div><strong>{formatDateTime(slot.startAt)}</strong><span>hasta {wellnessLocalTime(slot.endAt)} · {slot.status === "open" ? "abierta" : "bloqueada"}</span></div><div><strong>{slot.availableExternal ?? "—"}</strong><span>cupos externos</span></div></article>) : <EmptyState title="No hay franjas próximas" description="Configurá únicamente fechas y capacidades confirmadas." />}
          </section>
          <section className="admin-panel">
            <div className="admin-panel__heading"><div><p>Reservas de hoy</p><h2>Accesos previstos</h2></div><span className="admin-count">{snapshot.todayBookings.length}</span></div>
            {snapshot.todayBookings.length ? snapshot.todayBookings.map((booking) => {
              const product = state.wellnessProducts.find((item) => item.id === booking.productId);
              const guest = state.guests.find((item) => item.id === booking.guestId);
              return <article className="admin-compact-record" key={booking.id}><div><strong>{guest ? `${guest.firstName} ${guest.lastName}` : booking.code}</strong><span>{product?.name ?? "Producto no disponible"} · {wellnessLocalTime(booking.startAt)} · {booking.partySize} persona{booking.partySize === 1 ? "" : "s"}</span></div><span className={`admin-status admin-status--${booking.status}`}>{bookingStatusLabels[booking.status]}</span></article>;
            }) : <EmptyState title="No hay reservas wellness hoy" description="La agenda está vacía; no se agregan turnos ni personas ficticias." />}
          </section>
        </div>
      </section>

      <section className="admin-config-section" id="reservar">
        <SectionHeading eyebrow="Venta administrativa" title="Nueva reserva wellness" description="La capacidad se revalida en todas las franjas solapadas y el pago total se registra en la misma operación." />
        <BookingCreateForm busy={busy === "create-booking"} disabled={!canCreateBooking} guests={state.guests} products={state.wellnessProducts} slots={state.wellnessSlots} onCreate={(input) => run("create-booking", "Reserva wellness creada y confirmada.", () => createWellnessBooking(input))} />
      </section>

      <section className="admin-config-section" id="reservas">
        <SectionHeading eyebrow="Historial operativo" title="Reservas" description="El ingreso, la finalización, el no-show y la cancelación conservan eventos y auditoría." aside={<label className="admin-wellness-filter">Estado<select value={bookingFilter} onChange={(event) => setBookingFilter(event.target.value as WellnessBookingStatus | "all")}><option value="all">Todos</option>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>} />
        {bookings.length ? <div className="admin-wellness-bookings">{bookings.map((booking) => {
          const product = state.wellnessProducts.find((item) => item.id === booking.productId);
          const guest = state.guests.find((item) => item.id === booking.guestId);
          return <BookingRecord booking={booking} busy={busy === booking.id} canManage={canManage} guestName={guest ? `${guest.firstName} ${guest.lastName}` : "Titular no disponible"} highlighted={booking.id === requestedBookingId} key={booking.id} now={now} product={product} onUpdate={(input) => run(booking.id, "Reserva revalidada y actualizada.", () => updateWellnessBooking(input))} onTransition={(input) => run(booking.id, "Estado de la reserva actualizado.", () => transitionWellnessBooking(input))} />;
        })}</div> : <EmptyState title="No hay reservas wellness" description="El inventario real está vacío. No se crean reservas ni personas de ejemplo." />}
      </section>

      <section className="admin-config-section" id="franjas">
        <SectionHeading eyebrow="Inventario único" title="Franjas y capacidad" description="El cupo externo, el resguardo y el bloqueo se configuran sin cancelar reservas existentes." aside={<span className="admin-config-state">{state.wellnessSlots.length} franjas</span>} />
        {sortedSlots.length ? <div className="admin-config-records">{sortedSlots.map((slot) => <details className="admin-config-record" key={slot.id}><summary><div><strong>{formatDateTime(slot.startAt)}–{wellnessLocalTime(slot.endAt)}</strong><span>Total {slot.capacityLimit ?? "pendiente"} · externo {slot.externalCapacityLimit ?? "pendiente"} · reservado {slot.bookedExternal} · disponible {slot.availableExternal ?? "—"}</span></div><span className={`admin-status admin-status--${slot.status}`}>{slot.status === "open" ? "Abierta" : "Bloqueada"}</span></summary><SlotForm busy={busy === slot.id} disabled={!canManage} onSave={(input) => run(slot.id, "Franja actualizada sin afectar reservas existentes.", () => saveWellnessSlot(input))} slot={slot} /></details>)}</div> : <EmptyState title="Capacidad wellness pendiente de configurar." description="No existen franjas reales. Definí fechas y límites confirmados antes de habilitar ventas." />}
        <details className="admin-create-panel"><summary>Crear franja real</summary><SlotForm busy={busy === "create-slot"} disabled={!canManage} onSave={(input) => run("create-slot", "Franja creada.", () => saveWellnessSlot(input))} /></details>
      </section>

      <section className="admin-config-section" id="productos">
        <SectionHeading eyebrow="Catálogo interno" title="Productos wellness" description="Las tarifas y políticas se persisten y quedan fotografiadas al confirmar cada reserva." aside={<span className="admin-config-state">{state.wellnessProducts.length} productos</span>} />
        {state.wellnessProducts.length ? <div className="admin-config-records">{state.wellnessProducts.map((product) => <details className="admin-config-record" key={product.id}><summary><div><strong>{product.name}</strong><span>{productTypeLabels[product.productType]} · {product.code} · {product.durationMinutes} minutos</span></div><span className={`admin-config-state ${product.active && product.salesEnabled ? "admin-config-state--saved" : ""}`}>{!product.active ? "Inactivo" : product.salesEnabled ? "Venta habilitada" : "Sin venta"}</span></summary><ProductForm busy={busy === product.id} disabled={!canManage} onSave={(input) => run(product.id, "Producto actualizado.", () => saveWellnessProduct(input))} product={product} /></details>)}</div> : <EmptyState title="No hay productos wellness" description="Creá únicamente Circuito Relax o Pase Relax Día con sus precios y políticas confirmados." />}
        <details className="admin-create-panel"><summary>Crear producto wellness</summary><ProductForm busy={busy === "create-product"} disabled={!canManage} onSave={(input) => run("create-product", "Producto creado.", () => saveWellnessProduct(input))} /></details>
      </section>
    </>
  );
}
