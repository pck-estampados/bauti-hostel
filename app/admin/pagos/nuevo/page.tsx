"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader, EmptyState, formatCurrency, paymentMethodLabels } from "../../components/ui";
import { formatGuestName } from "../../lib/operations";
import type { PaymentMethod } from "../../lib/types";

function safeReturnTo(value: string | null): string | undefined {
  return value?.startsWith("/admin/") && !value.startsWith("//") ? value : undefined;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, mode, permissions, addPayment } = useOperations();
  const canManage = mode === "demo" || permissions.includes("payments.manage");
  const eligible = useMemo(
    () => state.reservations.filter(
      (reservation) => reservation.balance > 0 && !["cancelled", "rejected"].includes(reservation.status),
    ),
    [state.reservations],
  );
  const requested = eligible.find((reservation) => reservation.id === searchParams.get("reservation"));
  const [form, setForm] = useState({
    reservationId: requested?.id ?? eligible[0]?.id ?? "",
    amount: requested?.balance ?? eligible[0]?.balance ?? 0,
    method: "cash" as PaymentMethod,
    reference: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = eligible.find((reservation) => reservation.id === form.reservationId);
  const guest = state.guests.find((item) => item.id === selected?.primaryGuestId);

  function choose(reservationId: string) {
    const reservation = eligible.find((item) => item.id === reservationId);
    setForm((current) => ({ ...current, reservationId, amount: reservation?.balance ?? 0 }));
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return setError("No tenés permiso para registrar pagos.");
    if (!selected) return setError("Seleccioná una reserva con saldo pendiente.");
    if (form.amount <= 0 || form.amount > selected.balance) return setError("El importe debe ser mayor a cero y no superar el saldo.");
    setBusy(true);
    setError("");
    try {
      await addPayment(form);
      router.push(safeReturnTo(searchParams.get("returnTo")) ?? `/admin/reservas/${selected.id}?payment=created`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible registrar el pago.");
      setBusy(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Movimiento manual"
        title="Registrar pago"
        description="Registra un cobro real y recalcula pagado y saldo desde el libro financiero de Supabase."
      />
      {!eligible.length ? (
        <div className="admin-list-panel">
          <EmptyState title="No hay saldos pendientes" description="No existen reservas habilitadas que necesiten un pago." />
        </div>
      ) : (
        <div className="admin-operation-layout">
          <form className="admin-form-card" onSubmit={submit}>
            <div className="admin-field-grid">
              <label className="admin-field--full">Reserva
                <select required value={form.reservationId} onChange={(event) => choose(event.target.value)}>
                  <option value="">Seleccionar</option>
                  {eligible.map((reservation) => {
                    const person = state.guests.find((item) => item.id === reservation.primaryGuestId);
                    return <option value={reservation.id} key={reservation.id}>{reservation.code} · {person ? formatGuestName(person.firstName, person.lastName) : "Sin huésped"} · saldo {formatCurrency(reservation.balance)}</option>;
                  })}
                </select>
              </label>
              <label>Importe
                <input required min="0.01" max={selected?.balance} step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
              </label>
              <label>Método
                <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}>
                  {Object.entries(paymentMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label>Referencia <small>opcional</small>
                <input maxLength={200} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
              </label>
              <label className="admin-field--full">Nota <small>opcional</small>
                <textarea maxLength={1000} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
              </label>
            </div>
            {!canManage ? <p className="admin-form-error" role="alert">Tu usuario puede consultar pagos, pero no registrarlos.</p> : null}
            {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
            <button className="admin-button admin-button--primary admin-button--large" disabled={!selected || !canManage || busy} type="submit">
              {busy ? "Registrando…" : "Registrar pago"}
            </button>
          </form>
          <aside className="admin-form-summary">
            <p>Reserva seleccionada</p>
            <h2>{guest ? formatGuestName(guest.firstName, guest.lastName) : "Sin selección"}</h2>
            {selected ? <dl><div><dt>Total</dt><dd>{formatCurrency(selected.total)}</dd></div><div><dt>Pagado</dt><dd>{formatCurrency(selected.paid)}</dd></div><div><dt>Saldo actual</dt><dd>{formatCurrency(selected.balance)}</dd></div><div><dt>Saldo posterior</dt><dd>{formatCurrency(Math.max(selected.balance - form.amount, 0))}</dd></div><div><dt>Moneda</dt><dd>{selected.currency}</dd></div></dl> : null}
          </aside>
        </div>
      )}
    </>
  );
}
