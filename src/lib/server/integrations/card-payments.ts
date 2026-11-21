import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CardPaymentRow, CardPaymentStatus, CardPaymentsResponse, CardPaymentsAccess } from "@/lib/card-payments";
import { getPool } from "@/lib/server/db";

const ACCESS_SECONDS = 15 * 60;
const ACCESS_SCOPE = "pagos-bac:read";

export class CardPaymentsAccessError extends Error {
  constructor(public readonly code: "CONFIGURATION" | "RATE_LIMIT") { super(code); }
}

function accessSecret() {
  // Never use NEXT_PUBLIC_* values to sign access tokens. An independent
  // PAGOS_BAC_SESSION_SECRET can be set without changing the global login.
  const secret = process.env.PAGOS_BAC_SESSION_SECRET || process.env.ROOT_PASSWORD;
  if (!secret) throw new CardPaymentsAccessError("CONFIGURATION");
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", accessSecret()).update(value).digest("base64url");
}

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Bounded, per-instance throttle. In a multi-instance deployment, supplement
// this with an edge/WAF rate limit; no authentication tables are created here.
const accessAttempts = new Map<string, { count: number; until: number }>();
let globalAttempts = { count: 0, until: 0 };
function throttle(username: string) {
  const now = Date.now();
  for (const [key, value] of accessAttempts) if (value.until <= now) accessAttempts.delete(key);
  if (globalAttempts.until <= now) globalAttempts = { count: 0, until: now + 60_000 };
  const key = signature(`attempt:${username}`);
  const entry = accessAttempts.get(key) ?? { count: 0, until: now + 5 * 60_000 };
  if (entry.count >= 5 || globalAttempts.count >= 60 || accessAttempts.size >= 2000) {
    throw new CardPaymentsAccessError("RATE_LIMIT");
  }
  entry.count++;
  globalAttempts.count++;
  accessAttempts.set(key, entry);
  return key;
}

function rootCredentials() {
  const username = process.env.ROOT_USERNAME ?? process.env.NEXT_PUBLIC_ROOT_USERNAME;
  const password = process.env.ROOT_PASSWORD;
  return username && password ? { username: username.trim().toLowerCase(), password } : null;
}

function credentialVersion(id: string, verifier: string) {
  return signature(`credential:${id}:${verifier}`);
}

export async function authorizeCardPayments(username: string, password: string): Promise<CardPaymentsAccess | null> {
  const normalizedUsername = username.trim().toLowerCase();
  const attemptKey = throttle(normalizedUsername);
  const root = rootCredentials();
  let user: { id: string; name: string; version: string };
  if (root && normalizedUsername === root.username) {
    if (!equalSecret(password, root.password)) return null;
    user = { id: "USR-ROOT", name: process.env.ROOT_NAME || "Root", version: credentialVersion("USR-ROOT", `${root.username}:${root.password}`) };
  } else {
    // SELECT only: preserve last_access, global sessions, roles and permissions.
    // Do not use db.query(), whose initializer performs unrelated migrations.
    const result = await getPool().query<{ id: string; display_name: string; password_hash: string; valid: boolean }>(
      `SELECT id,display_name,password_hash,password_hash=crypt($2,password_hash) AS valid
       FROM app_users WHERE lower(username)=$1 AND status='ACTIVO' LIMIT 1`,
      [normalizedUsername, password],
    );
    const row = result.rows[0];
    if (!row?.valid) return null;
    user = { id: row.id, name: row.display_name, version: credentialVersion(row.id, row.password_hash) };
  }
  const expires = Math.floor(Date.now() / 1000) + ACCESS_SECONDS;
  const payload = Buffer.from(JSON.stringify({ scope: ACCESS_SCOPE, sub: user.id, version: user.version, exp: expires, nonce: randomUUID() })).toString("base64url");
  accessAttempts.delete(attemptKey);
  return { token: `${payload}.${signature(payload)}`, expiresAt: new Date(expires * 1000).toISOString(), user: { id: user.id, name: user.name } };
}

export async function hasCardPaymentsAccess(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ") || authorization.length > 2048) return false;
  const token = authorization.slice(7);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  const [encoded, mac] = parts;
  if (!equalSecret(mac, signature(encoded))) return false;
  let payload: { scope?: unknown; sub?: unknown; version?: unknown; exp?: unknown };
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.scope !== ACCESS_SCOPE || typeof payload.sub !== "string" || payload.sub.length > 128
    || typeof payload.version !== "string" || typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp)
    || payload.exp <= now || payload.exp > now + ACCESS_SECONDS) return false;
  if (payload.sub === "USR-ROOT") {
    const root = rootCredentials();
    return Boolean(root && equalSecret(payload.version, credentialVersion("USR-ROOT", `${root.username}:${root.password}`)));
  }
  // Recheck activation and password version on every read, so disabling an
  // account or changing its password invalidates access without a schema change.
  const result = await getPool().query<{ password_hash: string }>(
    "SELECT password_hash FROM app_users WHERE id=$1 AND status='ACTIVO'", [payload.sub],
  );
  return Boolean(result.rows[0] && equalSecret(payload.version, credentialVersion(payload.sub, result.rows[0].password_hash)));
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const normalized = (value: unknown) => (text(value) ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[ _-]+/g, " ");
const methodName = (value: unknown) => typeof value === "string" ? value : record(value).code ?? record(value).name ?? record(value).type;

const cardMethods = new Set(["card", "credit card", "creditcard", "debit card", "debitcard", "tarjeta", "tarjeta de credito", "tarjeta de debito"]);
const bacNames = new Set(["bac", "bac credomatic", "baccredomatic", "credomatic"]);
const nonCardMethods = new Set(["cash", "efectivo", "transfer", "transferencia", "bank transfer", "banktransfer", "ach", "direct debit"]);

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

export async function readStoreganiseCardPayments(): Promise<CardPaymentsResponse> {
  // Read the latest authoritative invoice snapshot, NOT the event history or
  // receipts. One invoice may have rent + deposit receipts for the SAME payment.
  // Removed payments disappear after the next Storeganise invoice update.
  // No schema initializer: this endpoint must never execute migrations/writes.
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
    ORDER BY i.updated_at DESC,i.storeganise_invoice_id
    LIMIT 2001
  `);
  const payments: CardPaymentRow[] = [];
  let unclassifiedPayments = 0;
  let invalidPayments = 0;
  for (const invoice of result.rows.slice(0, 2000)) {
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
    invoiceLimitReached: result.rows.length > 2000, unclassifiedPayments, invalidPayments,
  };
}
