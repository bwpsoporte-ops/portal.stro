import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";
import { processStoreganiseWebhook } from "@/lib/server/integrations/storeganise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  signature_valid: boolean;
  raw_payload: Record<string, unknown>;
  error_message: string | null;
  received_at: Date;
  processed_at: Date | null;
};

function textAt(payload: Record<string, unknown>, keys: string[]) {
  const queue: unknown[] = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current)) continue;
    const object = current as Record<string, unknown>;
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) return value;
      if (typeof value === "number") return String(value);
    }
    queue.push(...Object.values(object));
  }
  return "";
}

export async function GET() {
  try {
    await ensureIntegrationSchema();
    const db = getPool();
    const [eventsResult, customersResult, invoicesResult, unitsResult, totalsResult] = await Promise.all([
      db.query<EventRow>(`SELECT id,event_id,event_type,status,signature_valid,raw_payload,error_message,received_at,processed_at FROM integration_webhook_events WHERE lower(provider)='storeganise' ORDER BY received_at DESC LIMIT 250`),
      db.query<{ storeganise_user_id: string; name: string; email: string | null }>(`SELECT storeganise_user_id,trim(concat_ws(' ',first_name,last_name)) AS name,email FROM integration_customers WHERE disabled=false`),
      db.query<{ storeganise_invoice_id: string; storeganise_user_id: string | null; amount: string; currency: string; document_number: string | null }>(`SELECT i.storeganise_invoice_id,i.storeganise_user_id,i.amount::text,i.currency,d.document_number FROM integration_invoices i LEFT JOIN billing_documents d ON d.id=i.billing_document_id WHERE i.deleted=false`),
      db.query<{ count: string }>(`SELECT count(*)::text AS count FROM customer_units`),
      db.query<{ customers: string; invoices: string; failed: string; today: string; last_sync: Date | null }>(`SELECT (SELECT count(*) FROM integration_customers WHERE disabled=false)::text AS customers,(SELECT count(*) FROM integration_invoices WHERE deleted=false)::text AS invoices,(SELECT count(*) FROM integration_webhook_events WHERE lower(provider)='storeganise' AND status='FAILED')::text AS failed,(SELECT count(*) FROM integration_webhook_events WHERE lower(provider)='storeganise' AND received_at::date=current_date)::text AS today,(SELECT max(received_at) FROM integration_webhook_events WHERE lower(provider)='storeganise') AS last_sync`),
    ]);

    const customers = new Map(customersResult.rows.map((row) => [row.storeganise_user_id, row]));
    const invoices = new Map(invoicesResult.rows.map((row) => [row.storeganise_invoice_id, row]));
    const logs = eventsResult.rows.map((row) => {
      const storeganiseInvoiceId = textAt(row.raw_payload, ["invoiceId", "invoice_id", "invoice", "storeganiseInvoiceId"]);
      const invoice = invoices.get(storeganiseInvoiceId);
      const storeganiseUserId = invoice?.storeganise_user_id ?? textAt(row.raw_payload, ["userId", "user_id", "customerId", "customer_id"]);
      const customer = customers.get(storeganiseUserId);
      return {
        id: row.event_id || row.id,
        event: row.event_type,
        customer: customer?.name || "Cliente Storeganise",
        email: customer?.email || "",
        storeganiseInvoiceId,
        storeganiseUserId,
        amount: invoice ? Number(invoice.amount) : null,
        currency: invoice?.currency ?? "USD",
        status: row.status,
        signatureValid: row.signature_valid,
        receivedAt: row.received_at.toISOString(),
        processedAt: row.processed_at?.toISOString(),
        error: row.error_message ?? undefined,
        retries: 0,
        invoiceNumber: invoice?.document_number ?? undefined,
        payload: row.raw_payload,
        reviewed: row.status === "PROCESSED",
      };
    });
    const totals = totalsResult.rows[0];
    const configured = Boolean(process.env.STOREGANISE_WEBHOOK_SECRET && process.env.STOREGANISE_API_URL && process.env.STOREGANISE_API_KEY);
    const webhookConnected = eventsResult.rows.some((row) => row.signature_valid);

    return NextResponse.json({
      ok: true,
      connection: {
        configured,
        apiConfigured: Boolean(process.env.STOREGANISE_API_URL && process.env.STOREGANISE_API_KEY),
        webhookConfigured: Boolean(process.env.STOREGANISE_WEBHOOK_SECRET),
        webhookConnected,
        apiUrl: process.env.STOREGANISE_API_URL || null,
        status: configured && (webhookConnected || Number(totals.customers) > 0) ? "CONECTADA" : configured ? "LISTA" : "INCOMPLETA",
      },
      metrics: {
        today: Number(totals.today),
        processed: eventsResult.rows.filter((row) => row.status === "PROCESSED").length,
        failed: Number(totals.failed),
        invoices: Number(totals.invoices),
        customers: Number(totals.customers),
        units: Number(unitsResult.rows[0]?.count ?? 0),
        lastSync: totals.last_sync?.toISOString() ?? null,
        retries: eventsResult.rows.filter((row) => row.status === "RETRYING").length,
      },
      logs,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo consultar Storeganise." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureIntegrationSchema();
    const input = await request.json() as { eventId?: string; action?: string };
    if (input.action !== "RETRY" || !input.eventId) {
      return NextResponse.json({ ok: false, message: "Solicitud de reintento inválida." }, { status: 400 });
    }
    const result = await getPool().query<{ raw_payload: Record<string, unknown>; status: string }>(
      `SELECT raw_payload,status FROM integration_webhook_events WHERE lower(provider)='storeganise' AND event_id=$1 LIMIT 1`,
      [input.eventId],
    );
    const event = result.rows[0];
    if (!event) return NextResponse.json({ ok: false, message: "El evento no existe." }, { status: 404 });
    if (!["FAILED", "IGNORED", "PROCESSED"].includes(event.status)) {
      return NextResponse.json({ ok: false, message: "El evento todavía está siendo procesado." }, { status: 409 });
    }
    await getPool().query(
      `UPDATE integration_webhook_events SET status='FAILED',error_message=NULL,processed_at=NULL WHERE lower(provider)='storeganise' AND event_id=$1`,
      [input.eventId],
    );
    const processed = await processStoreganiseWebhook(event.raw_payload, JSON.stringify(event.raw_payload));
    return NextResponse.json({ ok: true, result: processed });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo reintentar el evento." }, { status: 422 });
  }
}
