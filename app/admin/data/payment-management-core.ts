import type { OperationsState, Payment, PaymentMethod, PaymentStatus } from "../lib/types.ts";
import { hostelLocalDate } from "./stay-operations-core.ts";

export type ReservationFinancials = {
  total: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
};

export type CashFilters = {
  from?: string;
  to?: string;
  method?: PaymentMethod | "";
  reservationId?: string;
};

export function paymentSignedAmount(payment: Payment): number {
  if (payment.status !== "posted") return 0;
  return payment.direction === "charge" ? payment.amount : -payment.amount;
}

export function reservationPaidTotal(payments: Payment[], reservationId: string): number {
  return Math.max(
    payments
      .filter((payment) => payment.reservationId === reservationId)
      .reduce((total, payment) => total + paymentSignedAmount(payment), 0),
    0,
  );
}

export function financialStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partial";
}

export function reservationFinancials(
  total: number,
  payments: Payment[],
  reservationId: string,
): ReservationFinancials {
  const paid = reservationPaidTotal(payments, reservationId);
  return {
    total,
    paid,
    balance: Math.max(total - paid, 0),
    paymentStatus: financialStatus(total, paid),
  };
}

export function paymentLocalDate(payment: Payment): string {
  return hostelLocalDate(new Date(payment.createdAt));
}

export function buildCashReadModel(
  state: OperationsState,
  filters: CashFilters = {},
  today = hostelLocalDate(),
) {
  const movements = state.payments
    .filter((payment) => {
      const localDate = paymentLocalDate(payment);
      return (!filters.from || localDate >= filters.from)
        && (!filters.to || localDate <= filters.to)
        && (!filters.method || payment.method === filters.method)
        && (!filters.reservationId || payment.reservationId === filters.reservationId);
    })
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  const todayMovements = state.payments.filter((payment) => paymentLocalDate(payment) === today);
  const postedChargesToday = todayMovements.filter(
    (payment) => payment.status === "posted" && payment.direction === "charge",
  );
  const byMethod = Object.fromEntries(
    (["cash", "transfer", "mercado_pago", "card", "other"] as const).map((method) => [
      method,
      postedChargesToday
        .filter((payment) => payment.method === method)
        .reduce((total, payment) => total + payment.amount, 0),
    ]),
  ) as Record<PaymentMethod, number>;

  return {
    today,
    movements,
    latestMovements: movements.slice(0, 50),
    incomeToday: postedChargesToday.reduce((total, payment) => total + payment.amount, 0),
    paymentCountToday: postedChargesToday.length,
    voidedToday: todayMovements.filter((payment) => payment.status === "voided").length,
    byMethod,
  };
}
