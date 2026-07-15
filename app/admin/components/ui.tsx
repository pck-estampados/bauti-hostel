import Link from "next/link";
import type { ReactNode } from "react";
import type { PaymentMethod, PaymentStatus, ReservationStatus, RoomStatus } from "../lib/types";

const roomLabels: Record<RoomStatus, string> = {
  available: "Disponible", reserved: "Reservada", occupied: "Ocupada", pending_cleaning: "Pendiente de limpieza",
  cleaning: "En limpieza", clean: "Limpia", ready: "Lista", maintenance: "Mantenimiento", blocked: "Bloqueada", out_of_service: "Fuera de servicio",
};

const reservationLabels: Record<ReservationStatus, string> = {
  inquiry: "Consulta", pending: "Pendiente", pending_deposit: "Pendiente de seña", confirmed: "Confirmada",
  partially_paid: "Parcialmente pagada", paid: "Pagada", checked_in: "Check-in realizado", accommodated: "Alojado",
  checked_out: "Check-out realizado", completed: "Finalizada", cancelled: "Cancelada", no_show: "No show", rejected: "Rechazada",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo", transfer: "Transferencia", mercado_pago: "Mercado Pago (futuro)", card: "Tarjeta (futuro)", other: "Otro",
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

export function roomStatusLabel(status: RoomStatus) { return roomLabels[status]; }
export function reservationStatusLabel(status: ReservationStatus) { return reservationLabels[status]; }

export function StatusPill({ status, children }: { status: RoomStatus | ReservationStatus | PaymentStatus | "alert" | "neutral"; children: ReactNode }) {
  return <span className={`admin-status admin-status--${status}`}>{children}</span>;
}

export function AdminPageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="admin-page-header">
      <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return (
    <div className="admin-empty">
      <span aria-hidden="true">✓</span><h3>{title}</h3><p>{description}</p>
      {action ? <Link className="admin-button admin-button--secondary" href={action.href}>{action.label}</Link> : null}
    </div>
  );
}
