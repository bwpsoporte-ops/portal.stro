type Resource = Record<string, unknown>;

const record = (value: unknown): Resource =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Resource : {};

const normalized = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function number(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);

export function storeganiseRentalId(resource: Resource): string | null {
  const rental = record(resource.unitRental ?? resource.rental);
  const value = resource.unitRentalId ?? resource.unit_rental_id ?? resource.rentalId ?? rental.id ?? rental._id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDeposit(entry: Resource) {
  const labels = [entry.type, ...(Array.isArray(entry.tags) ? entry.tags : [])];
  return labels.some((label) => ["deposit", "security_deposit", "security deposit", "deposito"].includes(normalized(label)));
}

function entryTotal(entry: Resource) {
  const total = number(entry.total);
  if (total !== null) return total;
  const subtotal = number(entry.subtotal);
  const tax = number(entry.tax);
  if (subtotal !== null && tax !== null) return subtotal + tax;
  throw new Error("Storeganise no envió el total completo de un concepto. No se puede separar el depósito con seguridad.");
}

/** Only typed invoice entries identify a deposit. Names and first-payment
 * guesses must never move rent or other charges into a proforma. */
export function splitStoreganiseDeposit(resource: Resource, total: number) {
  if (!Array.isArray(resource.entries) || !resource.entries.length) {
    throw new Error("Storeganise no envió entries con el detalle del cobro. Se espera la factura completa para identificar el depósito.");
  }
  const entries = resource.entries.map(record);
  const taggedDeposits = entries.filter(isDeposit);
  if (taggedDeposits.some((entry) => entryTotal(entry) < 0)) {
    throw new Error("El cobro incluye una devolución o ajuste negativo de depósito. Requiere revisión, no una nueva proforma.");
  }
  const deposits = taggedDeposits.filter((entry) => entryTotal(entry) > 0);
  // Keep invoices without a deposit on their existing billing path.
  if (!deposits.length) return { rentalTotal: total, depositTotal: 0, rentalId: null, deposits: [] as Resource[] };

  const rentalId = storeganiseRentalId(resource);
  if (!rentalId) throw new Error("El depósito no contiene unitRentalId. Se necesita el alquiler para evitar proformas duplicadas.");
  const sourceCents = cents(total);
  const entriesCents = entries.reduce((sum, entry) => sum + cents(entryTotal(entry)), 0);
  if (sourceCents !== entriesCents) {
    throw new Error("El detalle de Storeganise no coincide con el total. Revisa descuentos/créditos antes de separar el depósito.");
  }
  for (const deposit of deposits) {
    if (entryTotal(deposit) <= 0) throw new Error("El depósito es cero o negativo. Su ajuste requiere revisión, no una nueva proforma.");
    // The received security deposits have explicit zero tax. Do not silently
    // strip tax if Storeganise ever sends a different kind of deposit.
    if (number(deposit.tax) !== 0) {
      throw new Error("El depósito no tiene impuesto cero confirmado en Storeganise. Revisa su detalle antes de emitir la proforma.");
    }
  }
  const depositCents = deposits.reduce((sum, entry) => sum + cents(entryTotal(entry)), 0);
  if (depositCents > sourceCents) throw new Error("El depósito supera el total recibido de Storeganise.");
  return { rentalTotal: (sourceCents - depositCents) / 100, depositTotal: depositCents / 100, rentalId, deposits };
}

/** A payment-change notification can also mean a deleted payment. Require the
 * fetched invoice's settled state, balance and actual paid amount together. */
export function storeganisePaymentConfirmed(resource: Resource, total: number) {
  const state = normalized(resource.state ?? resource.status);
  const balance = number(resource.balance);
  const paid = number(resource.amountPaid);
  return state === "paid" && balance !== null && cents(balance) <= 0
    && paid !== null && cents(paid) >= cents(total) && total > 0;
}

/** Keep the external payment evidence even when the gateway uses a custom
 * method. Never label an unknown payment as cash or card. */
export function storeganisePaymentDetails(resource: Resource, invoiceId: string) {
  const payments = (Array.isArray(resource.payments) ? resource.payments : []).map(record)
    .filter((payment) => (number(payment.amount) ?? 0) > 0
      && !["failed", "pending", "cancelled", "canceled", "refunded", "deleted"]
        .includes(normalized(payment.state ?? payment.status)));
  const methods = payments.map((payment) => {
    const raw = payment.method ?? payment.paymentMethod ?? payment.type;
    const value = typeof raw === "string" ? normalized(raw) : "";
    if (["cash", "efectivo"].includes(value)) return "cash";
    if (["transfer", "bank transfer", "banktransfer", "bank_transfer", "transferencia"].includes(value)) return "transfer";
    if (["card", "credit card", "creditcard", "debit card", "tarjeta"].includes(value)) return "card";
    return "Storeganise";
  });
  const method = methods.length && new Set(methods).size === 1 ? methods[0] : "Storeganise";
  const references = payments.map((payment) => payment.reference ?? payment.transactionId ?? payment.id)
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const dates = [resource.paidAt, ...payments.map((payment) => payment.paidAt ?? payment.date ?? payment.created)]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => new Date(value)).filter((date) => Number.isFinite(date.getTime()));
  return {
    method,
    reference: references.length ? [...new Set(references)].join(", ") : `Storeganise invoice: ${invoiceId}`,
    paidAt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null,
  };
}
