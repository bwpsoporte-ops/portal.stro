import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureIntegrationSchema();
    const db = getPool();
    const [invoices, payments, ranges, creditNotes] = await Promise.all([
      db.query(
        `SELECT d.id,d.document_number,d.source,d.customer_name,d.customer_email,d.customer_rtn,
                d.unit_label,d.currency,d.subtotal,d.tax,d.total,d.amount_paid,d.credited_amount,
                d.status,d.cai,d.fiscal_correlative,d.sent_at,d.created_at,
                CASE WHEN d.currency='HNL' AND COALESCE(d.exchange_rate,0)>0 THEN d.subtotal/d.exchange_rate ELSE d.subtotal END AS subtotal_usd,
                CASE WHEN d.currency='HNL' AND COALESCE(d.exchange_rate,0)>0 THEN d.tax/d.exchange_rate ELSE d.tax END AS tax_usd,
                CASE WHEN d.currency='HNL' AND COALESCE(d.exchange_rate,0)>0 THEN d.total/d.exchange_rate ELSE d.total END AS total_usd
         FROM billing_documents d WHERE d.document_type='INVOICE'
         ORDER BY d.created_at DESC LIMIT 1000`,
      ),
      db.query(
        `SELECT p.id,p.document_id,p.amount,p.method,p.reference,p.notes,p.paid_at,
                d.document_number,d.customer_name,d.currency,d.exchange_rate,
                CASE WHEN d.currency='HNL' AND COALESCE(d.exchange_rate,0)>0 THEN p.amount/d.exchange_rate ELSE p.amount END AS amount_usd
         FROM billing_payments p JOIN billing_documents d ON d.id=p.document_id
         ORDER BY p.paid_at DESC LIMIT 1000`,
      ),
      db.query(
        `SELECT id,cai,range_start,range_end,current_number,expiration_date::text AS expiration_date,
                authorization_date::text AS authorization_date,status::text AS status,document_type,
                establishment,emission_point,branch,created_at,
                GREATEST(range_end-current_number+1,0)::integer AS available,
                GREATEST(current_number-range_start,0)::integer AS used
         FROM cai_ranges ORDER BY created_at DESC`,
      ),
      db.query(
        `SELECT id,credit_note_number,invoice_number,customer_name,currency,total,status,created_at
         FROM credit_notes ORDER BY created_at DESC LIMIT 500`,
      ),
    ]);
    return NextResponse.json({ ok: true, invoices: invoices.rows, payments: payments.rows, ranges: ranges.rows, creditNotes: creditNotes.rows }, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo cargar la información operativa." }, { status: 500 });
  }
}
