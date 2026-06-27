export type PaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type EmailStatus = "ENVIADA" | "PENDIENTE" | "FALLIDA";
export type AlertLevel = "INFO" | "WARNING" | "CRITICAL";
export type CaiStatus = "ACTIVO" | "INACTIVO" | "VENCIDO" | "AGOTADO";

export type Invoice = {
  id: string;
  number: string;
  client: string;
  rtn: string;
  email: string;
  amount: number;
  isv: number;
  total: number;
  cai: string;
  correlative: string;
  issuedAt: string;
  emailStatus: EmailStatus;
  bacReference: string;
  paymentId: string;
};

export type BacPayment = {
  id: string;
  client: string;
  email: string;
  amount: number;
  status: PaymentStatus;
  bacReference: string;
  transactionId: string;
  paidAt: string;
  invoiceNumber?: string;
  bankResponse: string;
  confirmed: boolean;
  error?: string;
};

export type CaiRange = {
  id: string;
  cai: string;
  initial: number;
  final: number;
  current: number;
  limitDate: string;
  status: CaiStatus;
  branch: string;
  point: string;
  documentType: string;
};

export type StoreganiseEvent = {
  id: string;
  event: string;
  status: "RECIBIDO" | "PROCESADO" | "ERROR" | "REINTENTO";
  receivedAt: string;
  payloadRef: string;
  retries: number;
  message: string;
};

export type SystemAlert = {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  area: "CAI" | "BAC" | "EMAIL" | "STOREGANISE" | "PDF";
  createdAt: string;
  resolved: boolean;
};

export const money = (value: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 2,
  }).format(value);

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("es-HN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export const invoices: Invoice[] = [];

export const payments: BacPayment[] = [];

export const caiRanges: CaiRange[] = [];

export const storeganiseEvents: StoreganiseEvent[] = [];

export const alerts: SystemAlert[] = [];

export const activeCai = caiRanges.find((range) => range.status === "ACTIVO");

export function getAvailableCorrelatives(range = activeCai) {
  if (!range) return 0;
  return Math.max(range.final - range.current, 0);
}

export function canGenerateInvoice(range = activeCai) {
  if (!range) return { ok: false, reason: "No hay CAI activo." };
  if (range.status !== "ACTIVO") return { ok: false, reason: "El CAI no está activo." };
  if (new Date(range.limitDate) < new Date()) return { ok: false, reason: "El CAI está vencido." };
  if (getAvailableCorrelatives(range) <= 0) return { ok: false, reason: "El rango está agotado." };
  return { ok: true, reason: "El sistema puede generar facturas." };
}

export const overview = {
  billedToday: invoices
    .filter((invoice) => invoice.issuedAt.startsWith("2026-05-02"))
    .reduce((sum, invoice) => sum + invoice.total, 0),
  billedMonth: invoices
    .filter((invoice) => invoice.issuedAt.startsWith("2026-05"))
    .reduce((sum, invoice) => sum + invoice.total, 0),
  approvedPayments: payments.filter((payment) => payment.status === "APPROVED").length,
  pendingPayments: payments.filter((payment) => payment.status === "PENDING").length,
  generatedInvoices: invoices.length,
  sentInvoices: invoices.filter((invoice) => invoice.emailStatus === "ENVIADA").length,
  criticalAlerts: alerts.filter((alert) => alert.level === "CRITICAL" && !alert.resolved).length,
  storeganiseStatus: storeganiseEvents.some((event) => event.status === "ERROR")
    ? "CON ERRORES"
    : "OPERATIVO",
};
