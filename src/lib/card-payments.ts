export type CardPaymentStatus = "RECORDED" | "APPROVED" | "PENDING" | "REJECTED" | "FAILED" | "CANCELLED" | "REFUNDED" | "UNKNOWN";

export const cardPaymentLabels: Record<CardPaymentStatus, string> = {
  RECORDED: "Registrado en Storeganise", APPROVED: "Aprobado", PENDING: "Pendiente",
  REJECTED: "Rechazado", FAILED: "Fallido", CANCELLED: "Cancelado", REFUNDED: "Reembolsado", UNKNOWN: "Por verificar",
};

/** Explicit public fields only. Never expose a gateway response or card object. */
export type CardPaymentRow = {
  key: string;
  paymentId: string | null;
  customerName: string;
  customerEmail: string | null;
  unitLabel: string | null;
  amount: number;
  currency: string;
  status: CardPaymentStatus;
  processor: "BAC" | "No identificado";
  manual: boolean;
  reference: string | null;
  transactionId: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  documentId: string | null;
  createdAt: string | null;
  paidAt: string | null;
  receivedAt: string;
};

export type CardPaymentsResponse = {
  ok: true;
  payments: CardPaymentRow[];
  fetchedAt: string;
  lastSync: string | null;
  invoiceLimitReached: boolean;
  unclassifiedPayments: number;
  invalidPayments: number;
};

export function hondurasDate(value: string | null) {
  if (!value) return "";
  // A date-only source is a calendar date, not midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function cardPaymentDate(value: string | null) {
  if (!value) return "Sin fecha informada";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/") + " (sin hora informada)";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Sin fecha informada";
  return new Intl.DateTimeFormat("es-HN", {
    timeZone: "America/Tegucigalpa", dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

export function cardPaymentMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-HN", { style: "currency", currency }).format(amount);
}
