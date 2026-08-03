import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "./schema";

export type PaymentNotice = {
  eventId: string;
  paymentId: string;
  storeganiseInvoiceId: string;
  method: "transfer" | "cash" | "card";
  status: "pending" | "approved" | "rejected" | "cancelled" | "refunded";
  amount: number;
  currency: string;
  reference?: string;
  paidAt?: string;
};

export function validatePaymentNotice(value: unknown): PaymentNotice {
  const data = value as Partial<PaymentNotice>;
  const methods = ["transfer", "cash", "card"];
  const statuses = ["pending", "approved", "rejected", "cancelled", "refunded"];
  if (!data || typeof data !== "object") throw new Error("JSON inválido.");
  if (!data.eventId || !data.paymentId || !data.storeganiseInvoiceId) {
    throw new Error("Faltan eventId, paymentId o storeganiseInvoiceId.");
  }
  if (!methods.includes(String(data.method))) throw new Error("Método de pago inválido.");
  if (!statuses.includes(String(data.status))) throw new Error("Estado de pago inválido.");
  if (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0) throw new Error("Monto inválido.");
  return { ...data, amount: Number(data.amount), currency: data.currency || "HNL" } as PaymentNotice;
}

export async function processPaymentNotice(notice: PaymentNotice, raw: unknown) {
  await ensureIntegrationSchema();
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const event = await client.query(
      `INSERT INTO integration_webhook_events
       (id, provider, event_id, event_type, signature_valid, raw_payload)
       VALUES ($1,'PAY_PORTAL',$2,'payment.updated',true,$3::jsonb)
       ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`,
      [randomUUID(), notice.eventId, JSON.stringify(raw)],
    );
    if (!event.rowCount) {
      await client.query("ROLLBACK");
      if (notice.status === "approved") await sendPaymentEmail(notice.storeganiseInvoiceId);
      return { duplicate: true, paymentId: notice.paymentId, status: notice.status };
    }

    const invoice = await client.query<{
      id: string; amount: string; currency: string; payment_status: string;
    }>(
      `SELECT id, amount, currency, payment_status FROM integration_invoices
       WHERE storeganise_invoice_id = $1 AND deleted = false FOR UPDATE`,
      [notice.storeganiseInvoiceId],
    );
    if (!invoice.rowCount) throw new Error("La factura de Storeganise no existe en el Portal.");

    const expected = Number(invoice.rows[0].amount);
    if (notice.status === "approved" &&
        (Math.abs(expected - notice.amount) > 0.01 || invoice.rows[0].currency !== notice.currency)) {
      throw new Error("El monto o la moneda no coincide con la factura de Storeganise.");
    }

    await client.query(
      `INSERT INTO integration_payments
       (id, external_payment_id, storeganise_invoice_id, method, status, amount,
        currency, reference, paid_at, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (external_payment_id) DO UPDATE SET
         status=EXCLUDED.status, reference=EXCLUDED.reference,
         paid_at=EXCLUDED.paid_at, raw_payload=EXCLUDED.raw_payload, updated_at=now()`,
      [
        randomUUID(), notice.paymentId, notice.storeganiseInvoiceId, notice.method,
        notice.status.toUpperCase(), notice.amount, notice.currency, notice.reference ?? null,
        notice.status === "approved" ? (notice.paidAt ?? new Date().toISOString()) : null,
        JSON.stringify(raw),
      ],
    );
    await client.query(
      `UPDATE integration_invoices SET payment_status=$2, payment_method=$3,
       payment_id=$4, paid_at=$5, updated_at=now()
       WHERE storeganise_invoice_id=$1`,
      [
        notice.storeganiseInvoiceId, notice.status.toUpperCase(), notice.method,
        notice.paymentId,
        notice.status === "approved" ? (notice.paidAt ?? new Date().toISOString()) : null,
      ],
    );
    await client.query(
      `UPDATE integration_webhook_events SET status='PROCESSED', processed_at=now()
       WHERE provider='PAY_PORTAL' AND event_id=$1`,
      [notice.eventId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (notice.status === "approved") {
    try {
      await sendPaymentEmail(notice.storeganiseInvoiceId);
    } catch (error) {
      console.error("Payment confirmation email:", error);
      return { duplicate: false, paymentId: notice.paymentId, status: notice.status, email: "PENDING_RETRY" };
    }
  }
  return { duplicate: false, paymentId: notice.paymentId, status: notice.status };
}

async function sendPaymentEmail(storeganiseInvoiceId: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return;
  const db = getPool();
  const claimed = await db.query<{
    email: string; first_name: string | null; amount: string; currency: string;
    payment_id: string; payment_method: string;
  }>(
    `UPDATE integration_invoices i SET email_status='SENDING', updated_at=now()
     FROM integration_customers c
     WHERE i.storeganise_invoice_id=$1 AND c.storeganise_user_id=i.storeganise_user_id
       AND i.payment_status='APPROVED' AND i.email_status='PENDING' AND c.email IS NOT NULL
     RETURNING c.email,c.first_name,i.amount,i.currency,i.payment_id,i.payment_method`,
    [storeganiseInvoiceId],
  );
  if (!claimed.rowCount) return;
  const row = claimed.rows[0];
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: row.email,
      subject: `Pago confirmado - factura ${storeganiseInvoiceId}`,
      text: `Hola ${row.first_name ?? ""}, confirmamos su pago de ${row.currency} ${row.amount}. Referencia: ${row.payment_id}.`,
      html: `<p>Hola ${escapeHtml(row.first_name ?? "")},</p><p>Confirmamos su pago de <strong>${escapeHtml(row.currency)} ${escapeHtml(row.amount)}</strong>.</p><p>Factura Storeganise: ${escapeHtml(storeganiseInvoiceId)}<br>Referencia: ${escapeHtml(row.payment_id)}<br>Método: ${escapeHtml(row.payment_method)}</p>`,
    });
    await db.query(
      `UPDATE integration_invoices SET email_status='SENT',email_sent_at=now(),updated_at=now()
       WHERE storeganise_invoice_id=$1`,
      [storeganiseInvoiceId],
    );
  } catch (error) {
    await db.query(
      `UPDATE integration_invoices SET email_status='PENDING',updated_at=now()
       WHERE storeganise_invoice_id=$1`,
      [storeganiseInvoiceId],
    );
    throw error;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}
