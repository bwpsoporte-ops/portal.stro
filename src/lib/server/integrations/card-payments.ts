import type { CardBrand, CardPaymentRow, CardPaymentStatus, CardPaymentsResponse } from "@/lib/card-payments";
import { getPool } from "@/lib/server/db";

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const normalized = (value: unknown) => (text(value) ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[ _-]+/g, " ");
const methodName = (value: unknown) => typeof value === "string" ? value : record(value).code ?? record(value).name ?? record(value).type;

const cardMethods = new Set(["card", "credit card", "creditcard", "debit card", "debitcard", "tarjeta", "tarjeta de credito", "tarjeta de debito"]);
const bacNames = new Set(["bac", "bac credomatic", "baccredomatic", "credomatic"]);
const nonCardMethods = new Set(["cash", "efectivo", "transfer", "transferencia", "bank transfer", "banktransfer", "ach", "direct debit"]);

function cardBrand(payment: Json): CardBrand | null {
  const card = record(payment.card);
  const method = record(payment.method ?? payment.paymentMethod);
  // Only explicit brand metadata is read. Never infer a network from card
  // numbers, bank names, references, notes or a generic payment method.
  const values = [payment.cardBrand, payment.card_brand, payment.brand, payment.cardType,
    card.brand, card.network, card.scheme, method.cardBrand, method.brand];
  const brands = new Set<CardBrand>();
  for (const value of values) {
    const name = normalized(value);
    if (name === "visa") brands.add("Visa");
    if (["mastercard", "master card"].includes(name)) brands.add("Mastercard");
    if (["amex", "american express", "americanexpress"].includes(name)) brands.add("American Express");
  }
  // Conflicting or absent metadata must not become a guessed brand.
  return brands.size === 1 ? [...brands][0] : null;
}

function classify(payment: Json): "card" | "other" | "unknown" {
  const method = normalized(methodName(payment.method ?? payment.paymentMethod));
  // An explicit transfer/cash overrides a bank/provider label such as BAC.
  if (nonCardMethods.has(method)) return "other";
  if (cardMethods.has(method) || bacNames.has(method)) return "card";
  const type = normalized(payment.type);
  if (cardMethods.has(type) || bacNames.has(type)) return "card";
  return "unknown";
}

function paymentStatus(payment: Json, amount: number): CardPaymentStatus {
  const state = normalized(payment.state ?? payment.status);
  if (["refunded", "refund", "reembolsado"].includes(state) || amount < 0) return "REFUNDED";
  if (["cancelled", "canceled", "deleted", "voided"].includes(state)) return "CANCELLED";
  if (["failed", "error"].includes(state)) return "FAILED";
  if (["rejected", "declined"].includes(state)) return "REJECTED";
  if (["pending", "processing", "created", "authorized", "authorised"].includes(state)) return "PENDING";
  if (["paid", "approved", "completed", "succeeded", "success", "settled", "captured"].includes(state)) return "APPROVED";
  // A payment in Storeganise's current ledger is a recorded payment, not proof
  // of a BAC bank approval. Manual card entries generally have no status field.
  return state ? "UNKNOWN" : "RECORDED";
}

function date(value: unknown): string | null {
  const string = text(value);
  if (!string || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(string) || !Number.isFinite(Date.parse(string))) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(string) ? string : new Date(string).toISOString();
}

// References are bounded scalars. Do not forward free-form notes, nested
// responses, tokens or card information even if supplied by the source.
function reference(value: unknown): string | null {
  const string = text(value);
  if (!string || string.length > 128) return null;
  return string.replace(/\b(?:\d[ -]?){13,19}\b/g, "[dato numérico protegido]");
}

type InvoiceRow = {
  storeganise_invoice_id: string;
  currency: string;
  updated_at: Date;
  payments: unknown;
  customer_name: string | null;
  customer_email: string | null;
  document_id: string | null;
  document_number: string | null;
  unit_label: string | null;
};

export async function readStoreganiseCardPayments(scope: "module" | "overview-history" = "module"): Promise<CardPaymentsResponse> {
  // Read the latest authoritative invoice snapshot, NOT the event history or
  // receipts. One invoice may have rent + deposit receipts for the SAME payment.
  // Removed payments disappear after the next Storeganise invoice update.
  // No schema initializer: this endpoint must never execute migrations/writes.
  const history = scope === "overview-history";
  const result = await getPool().query<InvoiceRow>(`
    SELECT i.storeganise_invoice_id,i.currency,i.updated_at,
           i.raw_payload->'resource'->'payments' AS payments,
           COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),d.customer_name) AS customer_name,
           COALESCE(c.email,d.customer_email) AS customer_email,
           d.id AS document_id,d.document_number,d.unit_label
    FROM integration_invoices i
    LEFT JOIN integration_customers c ON c.storeganise_user_id=i.storeganise_user_id
    LEFT JOIN billing_documents d ON d.id=i.billing_document_id AND d.document_type='INVOICE'
    WHERE i.deleted=false AND i.storeganise_invoice_id NOT LIKE 'JOB:%'
      AND jsonb_typeof(i.raw_payload->'resource'->'payments')='array'
      AND (NOT $1::boolean OR i.raw_payload->'resource'->'payments' <> '[]'::jsonb)
    ORDER BY i.updated_at DESC,i.storeganise_invoice_id
    LIMIT $2
  `, [history, history ? null : 2001]);
  const payments: CardPaymentRow[] = [];
  let unclassifiedPayments = 0;
  let invalidPayments = 0;
  for (const invoice of history ? result.rows : result.rows.slice(0, 2000)) {
    const entries = Array.isArray(invoice.payments) ? invoice.payments : [];
    const seen = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const payment = record(entry);
      const kind = classify(payment);
      if (kind !== "card") {
        if (kind === "unknown") unclassifiedPayments++;
        continue;
      }
      const amount = typeof payment.amount === "number" || typeof payment.amount === "string" && payment.amount.trim()
        ? Number(payment.amount) : NaN;
      const currency = (text(payment.currency) ?? text(record(payment.currency).code) ?? invoice.currency).toUpperCase();
      if (!Number.isFinite(amount) || amount === 0 || !/^[A-Z]{3}$/.test(currency)) { invalidPayments++; continue; }
      const originalId = text(payment.id ?? payment._id);
      const key = `${invoice.storeganise_invoice_id}:${originalId ?? `position-${index}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const provider = methodName(payment.provider ?? payment.gateway ?? payment.processor);
      const isBac = [provider, methodName(payment.method ?? payment.paymentMethod), payment.type].some((value) => bacNames.has(normalized(value)));
      payments.push({
        key,
        paymentId: reference(originalId),
        customerName: invoice.customer_name || "Cliente sin nombre sincronizado",
        customerEmail: invoice.customer_email,
        unitLabel: invoice.unit_label,
        amount: Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100,
        currency,
        status: paymentStatus(payment, amount),
        processor: isBac ? "BAC" : "No identificado",
        cardBrand: cardBrand(payment),
        manual: normalized(payment.type) === "manual",
        reference: reference(payment.reference),
        transactionId: reference(payment.transactionId ?? payment.transaction_id),
        invoiceId: invoice.storeganise_invoice_id,
        documentId: invoice.document_id,
        invoiceNumber: invoice.document_number,
        createdAt: date(payment.created ?? payment.createdAt),
        paidAt: date(payment.paidAt ?? payment.date),
        receivedAt: invoice.updated_at.toISOString(),
      });
    }
  }
  payments.sort((a, b) => (b.paidAt ?? b.createdAt ?? b.receivedAt).localeCompare(a.paidAt ?? a.createdAt ?? a.receivedAt));
  return {
    ok: true, payments, fetchedAt: new Date().toISOString(),
    lastSync: result.rows[0]?.updated_at.toISOString() ?? null,
    invoiceLimitReached: !history && result.rows.length > 2000, unclassifiedPayments, invalidPayments,
  };
}
